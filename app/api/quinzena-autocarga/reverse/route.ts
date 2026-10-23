import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { denyIfNotAutocarga } from '@/lib/autocarga/allowlist';
import { ensureAutocargaSchema } from '@/lib/autocarga/tables';
import { logAudit } from '@/lib/db/audit';
import {
  transfers, withdrawFromGroup, listCardGroups, isRateLimitCode,
  VexpayAuthError,
} from '@/lib/vexpay/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ReverseItemResult {
  cpf: string;
  colaborador: string;
  amount: number;
  estornado: boolean;
  estorno_tx: string | null;
  pool_tx: string | null;
  error?: string;
}

// POST /api/quinzena-autocarga/reverse {year, month, quinzena, cpf | all, to_pool?}
// Estorna uma carga executada: DEBIT cartão→grupo e (default) withdrawal
// grupo→pool. O item vira 'estornado' — sai do índice único, então o CPF
// volta a ser carregável numa próxima execução.
export async function POST(request: NextRequest) {
  const deny = denyIfNotAutocarga(request);
  if (deny) return deny;
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados nao configurado' }, { status: 503 });
  }

  let body: { year: number; month: number; quinzena: number; cpf?: string; all?: boolean; to_pool?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalido' }, { status: 400 });
  }
  const { year, month, quinzena } = body;
  const cpf = (body.cpf ?? '').replace(/\D/g, '');
  const all = body.all === true;
  const toPool = body.to_pool !== false;
  if (!year || !month || ![1, 2].includes(quinzena) || (!cpf && !all)) {
    return NextResponse.json({ error: 'Parametros invalidos (year/month/quinzena + cpf ou all)' }, { status: 400 });
  }

  const userEmail = request.headers.get('x-user-email') || 'unknown';
  const userName = request.headers.get('x-user-name') || '';
  await ensureAutocargaSchema();

  // Alvos: último item ok/forced_ok por CPF no período
  const items = cpf
    ? await sql`
        SELECT id, cpf, colaborador, amount::text, card_group_id, balance_account_id
        FROM quinzena_carga_items
        WHERE year=${year} AND month=${month} AND quinzena=${quinzena}
          AND cpf=${cpf} AND status IN ('ok','forced_ok')
        ORDER BY id DESC LIMIT 1`
    : await sql`
        SELECT DISTINCT ON (cpf) id, cpf, colaborador, amount::text, card_group_id, balance_account_id
        FROM quinzena_carga_items
        WHERE year=${year} AND month=${month} AND quinzena=${quinzena}
          AND status IN ('ok','forced_ok')
        ORDER BY cpf, id DESC`;

  if ((items as any[]).length === 0) {
    return NextResponse.json(
      { error: cpf ? 'Nenhuma carga ativa pra este CPF (não carregado ou já estornado)' : 'Nenhuma carga ativa nesta quinzena' },
      { status: 409 },
    );
  }

  // Mapa grupo→balance_id (pra perna grupo→pool)
  let groupBalance = new Map<string, string>();
  if (toPool) {
    try {
      const groups = await listCardGroups();
      for (const g of groups) groupBalance.set(g.id, g.balance_id);
    } catch (e) {
      if (e instanceof VexpayAuthError) {
        return NextResponse.json({ error: e.message }, { status: 502 });
      }
    }
  }

  const results: ReverseItemResult[] = [];

  for (const it of items as any[]) {
    const amount = Number(it.amount);
    const res: ReverseItemResult = {
      cpf: it.cpf, colaborador: it.colaborador, amount,
      estornado: false, estorno_tx: null, pool_tx: null,
    };
    results.push(res);

    if (!it.balance_account_id) {
      res.error = 'item sem balance_account_id — estorno manual no portal';
      continue;
    }

    // 1. DEBIT cartão → grupo (1 retry na janela de rate-limit por cartão)
    let debTx: string | null = null;
    for (let attempt = 0; attempt < 2 && debTx === null; attempt++) {
      if (attempt > 0) await sleep(65_000);
      try {
        const tr = await transfers([{ balance_account_id: it.balance_account_id, amount, type: 'DEBIT' }]);
        if (tr.callOk) {
          const okItem = tr.success.find((s) => s.balance_account_id === it.balance_account_id);
          if (okItem) {
            debTx = okItem.transaction_id;
            break;
          }
          const f = tr.failure.find((x) => x.balance_account_id === it.balance_account_id);
          if (f && isRateLimitCode(f.code) && attempt === 0) continue;
          res.error = f?.message ?? 'DEBIT recusado pela VExpenses';
          break;
        }
        if (isRateLimitCode(tr.callErrorCode) && attempt === 0) continue;
        res.error = tr.callError ?? 'falha na chamada de estorno';
        break;
      } catch (e) {
        if (e instanceof VexpayAuthError) {
          return NextResponse.json({ error: e.message, results }, { status: 502 });
        }
        res.error = `estorno falhou: ${String(e)}`;
      }
    }
    if (!debTx) continue; // res.error já preenchido
    res.estorno_tx = debTx;

    // 2. Grupo → pool (melhor esforço: se falhar, o valor fica livre no grupo)
    let poolTx: string | null = null;
    if (toPool) {
      const gBal = it.card_group_id ? groupBalance.get(it.card_group_id) : null;
      if (gBal) {
        try {
          await sleep(3000); // saldos cacheiam alguns segundos
          const w = await withdrawFromGroup(
            gBal, amount,
            `Estorno auto-carga ${quinzena}a QZ ${String(month).padStart(2, '0')}/${year} — ${it.colaborador}`,
          );
          if (w.ok) poolTx = w.transaction_id;
        } catch { /* fica no grupo — res.pool_tx null sinaliza */ }
      }
    }
    res.pool_tx = poolTx;
    res.estornado = true;

    await sql`
      UPDATE quinzena_carga_items SET
        status = 'estornado',
        estornado_at = NOW(), estornado_by = ${userEmail},
        estorno_tx = ${debTx}, estorno_pool_tx = ${poolTx}
      WHERE id = ${it.id}
    `;

    await logAudit(request, {
      action: 'quinzena.autocarga_estorno',
      entity_type: 'quinzena',
      entity_id: `${year}-${String(month).padStart(2, '0')}-Q${quinzena}`,
      details: {
        item_id: it.id, cpf: it.cpf, colaborador: it.colaborador, amount,
        estorno_tx: debTx, pool_tx: poolTx, by: userEmail, by_name: userName,
      },
    });

    if (all) await sleep(1200); // respiro anti-burst entre cartões
  }

  const estornados = results.filter((r) => r.estornado).length;
  const falhas = results.length - estornados;

  if (cpf) {
    const r = results[0];
    if (!r.estornado) {
      return NextResponse.json({ ok: false, error: r.error ?? 'estorno falhou', ...r }, { status: 502 });
    }
    return NextResponse.json({ ok: true, ...r });
  }
  return NextResponse.json({ ok: falhas === 0, estornados, falhas, results });
}
