import { NextRequest, NextResponse } from 'next/server';
import { denyIfNotAutocarga } from '@/lib/autocarga/allowlist';
import { buildCargaPlan, PlanError, LoadItem } from '@/lib/autocarga/plan';
import { ensureAutocargaSchema } from '@/lib/autocarga/tables';
import { createRun, finishRun, insertItems, ItemInsert } from '@/lib/autocarga/records';
import { logAudit } from '@/lib/db/audit';
import {
  depositToGroup, transfers, isRateLimitCode, getPoolBalance,
  VexpayAuthError, TransferItem,
} from '@/lib/vexpay/client';
import { r2 } from '@/lib/quinzena/financials';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const RATE_LIMIT_RETRY_MS = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// POST /api/quinzena-autocarga/execute {year, month, quinzena}
// Executa a carga real: deposit pool→grupo (delta) e transfers grupo→cartão,
// com resultado por CPF gravado em quinzena_carga_runs/items. Idempotente —
// CPF já carregado no período nunca recebe duas vezes.
export async function POST(request: NextRequest) {
  const deny = denyIfNotAutocarga(request);
  if (deny) return deny;

  let body: { year: number; month: number; quinzena: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalido' }, { status: 400 });
  }
  const { year, month, quinzena } = body;
  if (!year || !month || ![1, 2].includes(quinzena)) {
    return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 });
  }

  const userEmail = request.headers.get('x-user-email') || 'unknown';
  const userName = request.headers.get('x-user-name') || '';
  await ensureAutocargaSchema();

  // 1. Plano re-construído no servidor — nunca confia no preflight do cliente
  let plan;
  try {
    plan = await buildCargaPlan(year, month, quinzena);
  } catch (e) {
    if (e instanceof PlanError && e.code === 'not_frozen') {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    if (e instanceof VexpayAuthError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    throw e;
  }

  if (plan.loads.length === 0) {
    return NextResponse.json(
      { error: 'Nada a carregar — todos já foram carregados ou estão bloqueados',
        blocked: plan.blocked, already_loaded: plan.already_loaded },
      { status: 409 },
    );
  }
  if (!plan.pool_sufficient) {
    return NextResponse.json(
      { error: `Pool EQS insuficiente: disponível R$ ${plan.pool.toFixed(2)}, necessário R$ ${plan.total_to_load.toFixed(2)}`,
        pool: plan.pool, total_to_load: plan.total_to_load, deficit: plan.pool_deficit },
      { status: 409 },
    );
  }
  const missingBalance = plan.groups.filter((g) => g.deposit > 0 && !g.group_balance_id);
  if (missingBalance.length > 0) {
    return NextResponse.json(
      { error: `Grupo(s) sem balance_id para depósito: ${missingBalance.map((g) => g.name).join(', ')}` },
      { status: 409 },
    );
  }

  // 2. Run
  const runId = await createRun(year, month, quinzena, userEmail, userName, plan.pool, plan.total_to_load);
  const results = new Map<string, ItemInsert>();
  const mark = (l: LoadItem, s: Partial<ItemInsert> & { status: ItemInsert['status'] }) => {
    results.set(l.balance_account_id + l.cpf, {
      cpf: l.cpf, colaborador: l.colaborador, card_group_id: l.card_group_id,
      balance_account_id: l.balance_account_id, amount: l.amount, ...s,
    } as ItemInsert);
  };

  const retryQueue: LoadItem[] = [];

  try {
    // 3. Por grupo: deposit (delta) → transfers (lote)
    for (const g of plan.groups) {
      const groupLoads = plan.loads.filter((l) => l.card_group_id === g.card_group_id);
      if (groupLoads.length === 0) continue;

      if (g.deposit > 0) {
        try {
          const dep = await depositToGroup(
            g.group_balance_id!, g.deposit,
            `Carga ${quinzena}a QZ ${String(month).padStart(2, '0')}/${year} — auto-carga (run ${runId})`,
          );
          if (!dep.ok) {
            for (const l of groupLoads) {
              mark(l, { status: 'failed', block_reason: `deposit no grupo falhou: ${JSON.stringify(dep.response.errors ?? dep.response.message)}`, vex_response: dep.response });
            }
            continue;
          }
        } catch (e) {
          for (const l of groupLoads) {
            mark(l, { status: 'failed', block_reason: `deposit no grupo falhou: ${String(e)}` });
          }
          continue;
        }
      }

      const items: TransferItem[] = groupLoads.map((l) => ({
        balance_account_id: l.balance_account_id, amount: l.amount, type: 'CREDIT' as const,
      }));
      try {
        const res = await transfers(items);
        if (!res.callOk) {
          if (isRateLimitCode(res.callErrorCode)) {
            retryQueue.push(...groupLoads);
          } else {
            for (const l of groupLoads) {
              mark(l, { status: 'failed', block_reason: res.callError ?? 'falha na chamada de transferência', vex_response: res.raw });
            }
          }
          continue;
        }
        const okSet = new Set(res.success.map((s) => s.balance_account_id));
        const failMap = new Map(res.failure.map((f) => [f.balance_account_id, f]));
        const txMap = new Map(res.success.map((s) => [s.balance_account_id, s]));
        for (const l of groupLoads) {
          if (okSet.has(l.balance_account_id)) {
            mark(l, { status: 'ok', transaction_id: txMap.get(l.balance_account_id)?.transaction_id ?? null });
          } else {
            const f = failMap.get(l.balance_account_id);
            if (f && isRateLimitCode(f.code)) {
              retryQueue.push(l);
            } else {
              mark(l, { status: 'failed', block_reason: f?.message ?? 'falha não informada', vex_response: f });
            }
          }
        }
      } catch (e) {
        for (const l of groupLoads) {
          mark(l, { status: 'failed', block_reason: `transferências do grupo falharam: ${String(e)}` });
        }
      }
    }

    // 4. Retry único dos rate-limited após a janela (~60s)
    if (retryQueue.length > 0) {
      await sleep(RATE_LIMIT_RETRY_MS);
      try {
        const res = await transfers(
          retryQueue.map((l) => ({ balance_account_id: l.balance_account_id, amount: l.amount, type: 'CREDIT' as const })),
        );
        if (res.callOk) {
          const okSet = new Set(res.success.map((s) => s.balance_account_id));
          const failMap = new Map(res.failure.map((f) => [f.balance_account_id, f]));
          const txMap = new Map(res.success.map((s) => [s.balance_account_id, s]));
          for (const l of retryQueue) {
            if (okSet.has(l.balance_account_id)) {
              mark(l, { status: 'ok', transaction_id: txMap.get(l.balance_account_id)?.transaction_id ?? null });
            } else {
              const f = failMap.get(l.balance_account_id);
              mark(l, { status: 'failed', block_reason: `após retry: ${f?.message ?? 'falha não informada'}`, vex_response: f });
            }
          }
        } else {
          for (const l of retryQueue) {
            mark(l, { status: 'failed', block_reason: `após retry: ${res.callError ?? 'falha na chamada'}`, vex_response: res.raw });
          }
        }
      } catch (e) {
        for (const l of retryQueue) {
          mark(l, { status: 'failed', block_reason: `após retry: ${String(e)}` });
        }
      }
    }
  } catch (e) {
    await finishRun(runId, { status: 'failed', error: String(e) });
    throw e;
  }

  // 5. Persiste itens (executados + bloqueados p/ badge) e fecha a run
  const executed = [...results.values()];
  const blockedInserts: ItemInsert[] = plan.blocked.map((b) => ({
    cpf: b.cpf, colaborador: b.colaborador, card_group_id: b.card_group_id ?? null,
    balance_account_id: b.balance_account_id ?? null, amount: b.amount,
    status: 'blocked', block_reason: `${b.reason}: ${b.detail}`,
  }));
  await insertItems(runId, year, month, quinzena, [...executed, ...blockedInserts]);

  const okItems = executed.filter((i) => i.status === 'ok');
  const failedItems = executed.filter((i) => i.status === 'failed');
  const totalLoaded = r2(okItems.reduce((s, i) => s + i.amount, 0));
  let poolAfter: number | null = null;
  try {
    await sleep(3000); // saldos são cacheados alguns segundos na VExpenses
    poolAfter = await getPoolBalance();
  } catch {}

  const status = failedItems.length === 0 ? 'done' : okItems.length > 0 ? 'partial' : 'failed';
  await finishRun(runId, {
    status, pool_after: poolAfter, total_loaded: totalLoaded,
    items_ok: okItems.length, items_failed: failedItems.length,
    items_blocked: plan.blocked.length, items_forced: 0,
  });

  await logAudit(request, {
    action: 'quinzena.autocarga',
    entity_type: 'quinzena',
    entity_id: `${year}-${String(month).padStart(2, '0')}-Q${quinzena}`,
    details: {
      run_id: runId, total_loaded: totalLoaded,
      items_ok: okItems.length, items_failed: failedItems.length,
      items_blocked: plan.blocked.length,
      groups: plan.groups.length,
    },
  });

  return NextResponse.json({
    ok: true,
    run_id: runId,
    status,
    total_loaded: totalLoaded,
    pool_after: poolAfter,
    items: executed.map((i) => ({
      cpf: i.cpf, colaborador: i.colaborador, amount: i.amount,
      status: i.status, block_reason: i.block_reason, transaction_id: i.transaction_id,
    })),
    blocked: plan.blocked,
    already_loaded: plan.already_loaded,
  });
}
