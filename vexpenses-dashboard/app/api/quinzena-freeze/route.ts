import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

// ---- POST: Freeze a quinzena (save permanent snapshot) ----

export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados nao configurado' }, { status: 503 });
  }

  let body: {
    year: number;
    month: number;
    quinzena: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalido' }, { status: 400 });
  }

  const { year, month, quinzena } = body;

  if (!year || !month || !quinzena || ![1, 2].includes(quinzena)) {
    return NextResponse.json(
      { error: 'Parametros invalidos: year, month, quinzena obrigatorios' },
      { status: 400 }
    );
  }

  try {
    // Check if already frozen
    const existing = await sql`
      SELECT COUNT(*) as cnt FROM quinzena_frozen_snapshots
      WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
    `;
    if (Number(existing[0].cnt) > 0) {
      return NextResponse.json(
        { error: 'Esta quinzena ja esta congelada' },
        { status: 409 }
      );
    }

    // Get user info from middleware headers
    const userEmail = request.headers.get('x-user-email') || 'unknown';

    // Fetch the calculated data from quinzena-complete API logic
    // We need to call the same calculation logic — simplest is to fetch internally
    const baseUrl = new URL(request.url).origin;
    const apiRes = await fetch(
      `${baseUrl}/api/quinzena-complete?year=${year}&month=${month}&quinzena=${quinzena}`,
      { headers: { cookie: request.headers.get('cookie') || '' } }
    );

    if (!apiRes.ok) {
      return NextResponse.json(
        { error: 'Falha ao calcular dados para congelar' },
        { status: 500 }
      );
    }

    const apiData = await apiRes.json();

    if (!apiData.data || apiData.data.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum dado para congelar' },
        { status: 400 }
      );
    }

    // Insert all rows into frozen_snapshots
    let inserted = 0;
    for (const row of apiData.data) {
      await sql`
        INSERT INTO quinzena_frozen_snapshots (
          year, month, quinzena, cpf,
          colaborador, situacao, status_cartao,
          regional, centro_custo, gestor, diretor,
          carga, transferencia, tarifa, prestacao,
          saldo_prestacao, saldo_cartao, saldo_final,
          saldo_reembolsar, col_qz, adiantamento, obs,
          carga_parcial, reembolso, carga_final,
          reembolso_multiplier, frozen_by
        ) VALUES (
          ${year}, ${month}, ${quinzena}, ${row.cpf},
          ${row.colaborador}, ${row.situacao}, ${row.status_cartao},
          ${row.regional}, ${row.centro_custo}, ${row.gestor}, ${row.diretor},
          ${row.carga}, ${row.transferencia}, ${row.tarifa}, ${row.prestacao},
          ${row.saldo_prestacao}, ${row.saldo_cartao}, ${row.saldo_final},
          ${row.saldo_reembolsar},
          ${row.col_qz_manual ?? null},
          ${row.adiantamento},
          ${row.obs},
          ${row.carga_parcial}, ${row.reembolso}, ${row.carga_final},
          ${apiData.reembolso_multiplier},
          ${userEmail}
        )
        ON CONFLICT (year, month, quinzena, cpf) DO NOTHING
      `;
      inserted++;
    }

    return NextResponse.json({
      ok: true,
      frozen: true,
      rows_frozen: inserted,
      period: { year, month, quinzena },
      frozen_by: userEmail,
    });
  } catch (error) {
    console.error('[freeze] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao congelar', detail: String(error) },
      { status: 500 }
    );
  }
}

// ---- DELETE: Unfreeze a quinzena (remove frozen snapshot) ----

export async function DELETE(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados nao configurado' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') ?? '0');
  const month = parseInt(searchParams.get('month') ?? '0');
  const quinzena = parseInt(searchParams.get('quinzena') ?? '0');

  if (!year || !month || !quinzena || ![1, 2].includes(quinzena)) {
    return NextResponse.json(
      { error: 'Parametros invalidos: year, month, quinzena obrigatorios' },
      { status: 400 }
    );
  }

  try {
    const result = await sql`
      DELETE FROM quinzena_frozen_snapshots
      WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
      RETURNING cpf
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Quinzena nao estava congelada' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      unfrozen: true,
      rows_removed: result.length,
      period: { year, month, quinzena },
    });
  } catch (error) {
    console.error('[unfreeze] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao descongelar', detail: String(error) },
      { status: 500 }
    );
  }
}

// ---- GET: Check freeze status ----

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados nao configurado' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') ?? '0');
  const month = parseInt(searchParams.get('month') ?? '0');
  const quinzena = parseInt(searchParams.get('quinzena') ?? '0');

  if (!year || !month || !quinzena) {
    return NextResponse.json(
      { error: 'Parametros invalidos: year, month, quinzena obrigatorios' },
      { status: 400 }
    );
  }

  try {
    const rows = await sql`
      SELECT COUNT(*) as cnt, MIN(frozen_at) as frozen_at
      FROM quinzena_frozen_snapshots
      WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
    `;

    const isFrozen = Number(rows[0].cnt) > 0;

    return NextResponse.json({
      is_frozen: isFrozen,
      frozen_at: rows[0]?.frozen_at ?? null,
      rows: Number(rows[0]?.cnt ?? 0),
    });
  } catch (error) {
    console.error('[freeze-status] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao verificar status', detail: String(error) },
      { status: 500 }
    );
  }
}
