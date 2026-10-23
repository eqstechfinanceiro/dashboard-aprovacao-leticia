// Core da execução da auto-carga — usado pela rota /execute (operador) e pelo
// disparo agendado pós-freeze (lib/autocarga via quinzena-fechar). Não conhece
// NextRequest: recebe o ator explicitamente e reporta via auditActor.

import { sql } from '@/lib/db/neon';
import { ensureAuditTable } from '@/lib/db/audit';
import { notifyAdmins } from '@/lib/sync/notifications';
import { buildCargaPlan, PlanError, LoadItem } from '@/lib/autocarga/plan';
import { ensureAutocargaSchema } from '@/lib/autocarga/tables';
import { createRun, finishRun, insertItems, ItemInsert } from '@/lib/autocarga/records';
import {
  depositToGroup, transfers, isRateLimitCode, getPoolBalance,
  VexpayAuthError, TransferItem,
} from '@/lib/vexpay/client';
import { r2 } from '@/lib/quinzena/financials';

const RATE_LIMIT_RETRY_MS = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ExecuteError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public payload: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ExecuteError';
  }
}

export interface AuditEntry {
  action: string;
  entity_type?: string;
  entity_id?: string;
  details?: Record<string, unknown>;
}
type AuditFn = (entry: AuditEntry) => Promise<void>;

// Audit sem request (disparo agendado). Nunca lança.
function makeActorAudit(actor: { email: string; name: string; role?: string }): AuditFn {
  return async (entry) => {
    if (!sql) return;
    try {
      await ensureAuditTable();
      await sql`
        INSERT INTO audit_log (user_id, user_email, user_name, user_role, action, entity_type, entity_id, details, ip)
        VALUES (NULL, ${actor.email || null}, ${actor.name || null}, ${actor.role ?? 'admin'},
                ${entry.action}, ${entry.entity_type ?? null},
                ${entry.entity_id != null ? String(entry.entity_id) : null},
                ${entry.details ? JSON.stringify(entry.details) : null}::jsonb, NULL)
      `;
    } catch (e) {
      console.error('[autocarga/audit]', e);
    }
  };
}

export interface ExecuteOutcome {
  ok: true;
  run_id: number;
  status: 'done' | 'partial' | 'failed';
  total_loaded: number;
  pool_after: number | null;
  items: {
    cpf: string; colaborador: string; amount: number;
    status: string; block_reason?: string | null; transaction_id?: string | null;
  }[];
  blocked: unknown[];
  already_loaded: unknown[];
}

// Já existe uma run 'running' fresca (<20min) pro período? Evita disparo
// duplo (operador + agendamento simultâneo). Runs 'running' velhas são
// consideradas órfãs (restart do PM2) e não bloqueiam.
export async function hasActiveRun(year: number, month: number, quinzena: number): Promise<boolean> {
  if (!sql) return false;
  const r = await sql`
    SELECT COUNT(*)::int AS n FROM quinzena_carga_runs
    WHERE year=${year} AND month=${month} AND quinzena=${quinzena}
      AND status='running' AND started_at > NOW() - INTERVAL '20 minutes'
  `.catch(() => [{ n: 0 }]);
  return Number((r as any[])[0]?.n ?? 0) > 0;
}

export async function executeAutoCarga(
  year: number, month: number, quinzena: number,
  actor: { email: string; name: string; role?: string },
  onAudit?: AuditFn,
): Promise<ExecuteOutcome> {
  await ensureAutocargaSchema();

  if (await hasActiveRun(year, month, quinzena)) {
    throw new ExecuteError(409, 'Já existe uma execução de auto-carga em andamento nesta quinzena.');
  }

  // 1. Plano re-construído — nunca confia no preflight do cliente
  let plan;
  try {
    plan = await buildCargaPlan(year, month, quinzena);
  } catch (e) {
    if (e instanceof PlanError && e.code === 'not_frozen') throw new ExecuteError(409, e.message);
    if (e instanceof VexpayAuthError) throw new ExecuteError(502, e.message);
    throw e;
  }

  if (plan.loads.length === 0) {
    throw new ExecuteError(409, 'Nada a carregar — todos já foram carregados ou estão bloqueados', {
      blocked: plan.blocked, already_loaded: plan.already_loaded,
    });
  }
  if (!plan.pool_sufficient) {
    throw new ExecuteError(409,
      `Pool EQS insuficiente: disponível R$ ${plan.pool.toFixed(2)}, necessário R$ ${plan.total_to_load.toFixed(2)}`,
      { pool: plan.pool, total_to_load: plan.total_to_load, deficit: plan.pool_deficit });
  }
  const missingBalance = plan.groups.filter((g) => g.deposit > 0 && !g.group_balance_id);
  if (missingBalance.length > 0) {
    throw new ExecuteError(409,
      `Grupo(s) sem balance_id para depósito: ${missingBalance.map((g) => g.name).join(', ')}`);
  }

  // 2. Run
  const runId = await createRun(year, month, quinzena, actor.email, actor.name, plan.pool, plan.total_to_load);
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

  const periodoId = `${year}-${String(month).padStart(2, '0')}-Q${quinzena}`;
  await (onAudit ?? makeActorAudit(actor))({
    action: 'quinzena.autocarga',
    entity_type: 'quinzena',
    entity_id: periodoId,
    details: {
      run_id: runId, total_loaded: totalLoaded,
      items_ok: okItems.length, items_failed: failedItems.length,
      items_blocked: plan.blocked.length,
      groups: plan.groups.length,
    },
  });

  // 6. Notificação aos admins (P2) — sininho do header
  try {
    const titulo = status === 'done' ? 'Auto-carga concluída' : status === 'partial' ? 'Auto-carga parcial' : 'Auto-carga falhou';
    await notifyAdmins({
      type: 'autocarga_run',
      title: `${titulo} — ${periodoId}`,
      body: `${okItems.length} cartão(ões) carregado(s), R$ ${totalLoaded.toFixed(2)}` +
        (failedItems.length ? ` · ${failedItems.length} falha(s)` : '') +
        (plan.blocked.length ? ` · ${plan.blocked.length} bloqueado(s)` : '') +
        (poolAfter !== null ? ` · pool após R$ ${poolAfter.toFixed(2)}` : ''),
      link: `/quinzena-dinamica?year=${year}&month=${month}&quinzena=${quinzena}`,
      dedupKey: `autocarga:run:${runId}`,
      details: {
        run_id: runId, status, total_loaded: totalLoaded,
        items_ok: okItems.length, items_failed: failedItems.length,
        items_blocked: plan.blocked.length, by: actor.email,
      },
    });
  } catch (e) {
    console.error('[autocarga/notify]', e);
  }

  return {
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
  };
}
