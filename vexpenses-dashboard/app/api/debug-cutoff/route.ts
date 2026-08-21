import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }

  // 1. Check column type
  const colType = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'extrato_movimentacao' AND column_name = 'data'
  `;

  // 2. Compare timestamp vs date cast for Taxa totals
  const withTimestamp = await sql`
    SELECT COUNT(*) as cnt, SUM(valor) as total
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND data <= '2026-07-31'
      AND tipo = 'Taxa'
  `;

  const withDateCast = await sql`
    SELECT COUNT(*) as cnt, SUM(valor) as total
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND data::date <= '2026-07-31'
      AND tipo = 'Taxa'
  `;

  // 3. Same for Transferência
  const transfTimestamp = await sql`
    SELECT COUNT(*) as cnt, SUM(valor) as total
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND data <= '2026-07-31'
      AND tipo = 'Transferência'
  `;

  const transfDateCast = await sql`
    SELECT COUNT(*) as cnt, SUM(valor) as total
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND data::date <= '2026-07-31'
      AND tipo = 'Transferência'
  `;

  // 4. ABNER tarifa count comparison
  const abnerTs = await sql`
    SELECT COUNT(*) as cnt, SUM(valor) as total
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND UPPER(usuario) = 'ABNER ANDRADE CAVALCANTE'
      AND tipo = 'Taxa'
      AND data <= '2026-07-31'
  `;

  const abnerDc = await sql`
    SELECT COUNT(*) as cnt, SUM(valor) as total
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND UPPER(usuario) = 'ABNER ANDRADE CAVALCANTE'
      AND tipo = 'Taxa'
      AND data::date <= '2026-07-31'
  `;

  // 5. What dates exist on July 31
  const july31Dates = await sql`
    SELECT data::text as d, COUNT(*) as cnt
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND data::text LIKE '2026-07-31%'
    GROUP BY data::text
    ORDER BY data::text
    LIMIT 5
  `;

  return NextResponse.json({
    col_type: colType[0],
    taxa_timestamp: withTimestamp[0],
    taxa_datecast: withDateCast[0],
    transf_timestamp: transfTimestamp[0],
    transf_datecast: transfDateCast[0],
    abner_ts: abnerTs[0],
    abner_dc: abnerDc[0],
    july31_dates: july31Dates,
  });
}

