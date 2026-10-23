import { NextRequest, NextResponse } from 'next/server';
import { denyIfNotAutocarga } from '@/lib/autocarga/allowlist';
import { buildCargaPlan, PlanError } from '@/lib/autocarga/plan';
import { ensureAutocargaSchema } from '@/lib/autocarga/tables';
import { createRun, finishRun, insertItems } from '@/lib/autocarga/records';
import { logAudit } from '@/lib/db/audit';
import {
  depositToGroup, transfers, getGroupBalances, listCardGroups, VexpayAuthError,
} from '@/lib/vexpay/client';
import { r2 } from '@/lib/quinzena/financials';
import { normalizeCpf } from '@/lib/auth/scope';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// POST /api/quinzena-autocarga/force {year, month, quinzena, cpf}
// "Carregar mesmo assim" — executa a carga de UM item bloqueado forceable,
// com registro forced_ok/forced_failed + auditoria de quem forçou.
export async function POST(request: NextRequest) {
  const deny = denyIfNotAutocarga(request);
  if (deny) return deny;

  let body: { year: number; month: number; quinzena: number; cpf: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalido' }, { status: 400 });
  }
  const { year, month, quinzena } = body;
  const cpf = normalizeCpf(body.cpf);
  if (!year || !month || ![1, 2].includes(quinzena) || !cpf) {
    return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 });
  }

  const userEmail = request.headers.get('x-user-email') || 'unknown';
  const userName = request.headers.get('x-user-name') || '';
  await ensureAutocargaSchema();

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

  // Já carregado?
  if (plan.already_loaded.some((l) => normalizeCpf(l.cpf) === cpf)) {
    return NextResponse.json({ error: 'Este CPF já recebeu carga nesta quinzena' }, { status: 409 });
  }

  const item = plan.blocked.find((b) => normalizeCpf(b.cpf) === cpf);
  if (!item) {
    const inLoads = plan.loads.some((l) => normalizeCpf(l.cpf) === cpf);
    return NextResponse.json(
      { error: inLoads ? 'CPF não está bloqueado — será carregado pela execução normal' : 'CPF não encontrado no plano' },
      { status: 404 },
    );
  }
  if (!item.forceable || !item.balance_account_id || !item.card_group_id) {
    return NextResponse.json(
      { error: `Não é possível forçar: ${item.detail}` },
      { status: 409 },
    );
  }

  const runId = await createRun(year, month, quinzena, userEmail, userName, plan.pool, item.amount);
  const tag = `Carga ${quinzena}a QZ ${String(month).padStart(2, '0')}/${year} — forçada (run ${runId})`;

  try {
    // Garante saldo no grupo do cartão (delta sobre saldo livre atual)
    const avail = (await getGroupBalances([item.card_group_id])).get(item.card_group_id) ?? 0;
    const needed = r2(Math.max(0, item.amount - avail));
    if (needed > 0) {
      let gid = plan.groups.find((g) => g.card_group_id === item.card_group_id)?.group_balance_id ?? null;
      if (!gid) {
        const gs = await listCardGroups();
        gid = gs.find((g) => g.id === item.card_group_id)?.balance_id ?? null;
      }
      if (!gid) throw new Error('balance_id do grupo não encontrado para depósito');
      const dep = await depositToGroup(gid, needed, tag);
      if (!dep.ok) throw new Error(`deposit falhou: ${JSON.stringify(dep.response.errors ?? dep.response.message)}`);
    }

    const res = await transfers([
      { balance_account_id: item.balance_account_id, amount: item.amount, type: 'CREDIT' },
    ]);

    const okItem = res.callOk
      ? res.success.find((s) => s.balance_account_id === item.balance_account_id)
      : null;
    const failItem = res.callOk
      ? res.failure.find((f) => f.balance_account_id === item.balance_account_id)
      : null;

    const status = okItem ? 'forced_ok' : 'forced_failed';
    const blockReason = okItem
      ? null
      : (failItem?.message ?? res.callError ?? 'falha não informada');

    await insertItems(runId, year, month, quinzena, [{
      cpf: item.cpf, colaborador: item.colaborador,
      card_group_id: item.card_group_id, balance_account_id: item.balance_account_id,
      amount: item.amount, status, block_reason: blockReason,
      forced: true, forced_by: userEmail,
      transaction_id: okItem?.transaction_id ?? null,
      vex_response: res.raw,
    }]);

    await finishRun(runId, {
      status: okItem ? 'done' : 'failed',
      total_loaded: okItem ? item.amount : 0,
      items_ok: 0, items_failed: okItem ? 0 : 1, items_blocked: 0, items_forced: okItem ? 1 : 0,
      error: okItem ? null : blockReason,
    });

    await logAudit(request, {
      action: 'quinzena.autocarga_force',
      entity_type: 'quinzena',
      entity_id: `${year}-${String(month).padStart(2, '0')}-Q${quinzena}`,
      details: {
        run_id: runId, cpf: item.cpf, colaborador: item.colaborador,
        amount: item.amount, reason_original: item.reason,
        result: status, transaction_id: okItem?.transaction_id ?? null,
      },
    });

    if (!okItem) {
      return NextResponse.json(
        { ok: false, run_id: runId, status, error: blockReason },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true, run_id: runId, status,
      transaction_id: okItem.transaction_id,
      cpf: item.cpf, colaborador: item.colaborador, amount: item.amount,
    });
  } catch (e) {
    await insertItems(runId, year, month, quinzena, [{
      cpf: item.cpf, colaborador: item.colaborador,
      card_group_id: item.card_group_id, balance_account_id: item.balance_account_id ?? null,
      amount: item.amount, status: 'forced_failed',
      block_reason: String(e), forced: true, forced_by: userEmail,
    }]).catch(() => {});
    await finishRun(runId, { status: 'failed', error: String(e), items_forced: 0, items_failed: 1 });
    if (e instanceof VexpayAuthError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    console.error('[autocarga/force]', e);
    return NextResponse.json({ error: 'Erro ao forçar carga', detail: String(e) }, { status: 500 });
  }
}
