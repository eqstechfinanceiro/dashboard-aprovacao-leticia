import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { isAutocargaAllowedEmail } from '@/lib/autocarga/allowlist';
import { ensureAutocargaSchema } from '@/lib/autocarga/tables';

export const dynamic = 'force-dynamic';

// GET /api/quinzena-autocarga/status?year&month&quinzena
// Estado da auto-carga pro período: se o usuário pode operar, última run e o
// status por CPF (badges da tabela). Não 403 — a UI precisa do can_autocarga.
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados nao configurado' }, { status: 503 });
  }
  await ensureAutocargaSchema();

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') ?? '0');
  const month = parseInt(searchParams.get('month') ?? '0');
  const quinzena = parseInt(searchParams.get('quinzena') ?? '0');
  if (!year || !month || ![1, 2].includes(quinzena)) {
    return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 });
  }

  const email = request.headers.get('x-user-email');
  const canAutocarga = isAutocargaAllowedEmail(email);

  try {
    const runs = await sql`
      SELECT id, status, triggered_by_email, triggered_by_name,
             pool_before::text, pool_after::text,
             total_planned::text, total_loaded::text,
             items_ok, items_failed, items_blocked, items_forced,
             error, started_at, finished_at
      FROM quinzena_carga_runs
      WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
      ORDER BY id DESC LIMIT 1
    `;
    const run = runs[0] ?? null;

    // Último estado por CPF (entre todas as runs do período)
    const itemRows = await sql`
      SELECT DISTINCT ON (cpf)
        cpf, colaborador, amount::text, status, block_reason,
        transaction_id, forced, forced_by, executed_at
      FROM quinzena_carga_items
      WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
      ORDER BY cpf, id DESC
    `;
    const items: Record<string, unknown> = {};
    for (const r of itemRows as any[]) {
      items[r.cpf] = {
        status: r.status,
        amount: parseFloat(r.amount),
        block_reason: r.block_reason,
        transaction_id: r.transaction_id,
        forced: r.forced,
        forced_by: r.forced_by,
        executed_at: r.executed_at,
      };
    }

    return NextResponse.json(
      {
        can_autocarga: canAutocarga,
        run: run
          ? {
              ...run,
              pool_before: run.pool_before ? parseFloat(run.pool_before) : null,
              pool_after: run.pool_after ? parseFloat(run.pool_after) : null,
              total_planned: run.total_planned ? parseFloat(run.total_planned) : null,
              total_loaded: run.total_loaded ? parseFloat(run.total_loaded) : null,
            }
          : null,
        items,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[autocarga/status]', e);
    return NextResponse.json({ error: 'Erro ao consultar status', detail: String(e) }, { status: 500 });
  }
}
