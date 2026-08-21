import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }

  // 1. All distinct tipos containing 'taxa' (case-insensitive)
  const taxaLike = await sql`
    SELECT tipo, COUNT(*) as cnt, SUM(valor) as total
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND data <= '2026-07-31'
      AND tipo ILIKE '%taxa%'
    GROUP BY tipo
    ORDER BY cnt DESC
  `;

  // 2. All distinct tipos in the DB
  const allTipos = await sql`
    SELECT tipo, COUNT(*) as cnt, SUM(valor) as total
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND data <= '2026-07-31'
    GROUP BY tipo
    ORDER BY cnt DESC
  `;

  // 3. Transferência sign split
  const transfSplit = await sql`
    SELECT
      COUNT(*) FILTER(WHERE valor > 0) as pos_cnt,
      COUNT(*) FILTER(WHERE valor < 0) as neg_cnt,
      SUM(valor) FILTER(WHERE valor > 0) as pos_sum,
      SUM(valor) FILTER(WHERE valor < 0) as neg_sum
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND data <= '2026-07-31'
      AND tipo = 'Transferência'
  `;

  return NextResponse.json({
    taxa_like: taxaLike,
    all_tipos: allTipos,
    transf_split: transfSplit[0],
  });
}
