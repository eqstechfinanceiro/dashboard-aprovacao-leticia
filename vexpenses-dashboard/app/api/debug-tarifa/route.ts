import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }

  // 1. Check if our DB has duplicate rows that DISTINCT ON would remove
  const rawVsDeduped = await sql`
    WITH raw_count AS (
      SELECT COUNT(*) as cnt
      FROM extrato_movimentacao
      WHERE is_snapshot = FALSE AND data <= '2026-07-31' AND tipo = 'Taxa'
    ),
    deduped_count AS (
      SELECT COUNT(*) as cnt FROM (
        SELECT DISTINCT ON (
          UPPER(usuario), data, tipo, valor,
          COALESCE(NULLIF(codigo_transacao, ''), hora::text)
        )
          1
        FROM extrato_movimentacao
        WHERE is_snapshot = FALSE AND data <= '2026-07-31' AND tipo = 'Taxa'
        ORDER BY UPPER(usuario), data, tipo, valor,
          COALESCE(NULLIF(codigo_transacao, ''), hora::text)
      ) d
    )
    SELECT (SELECT cnt FROM raw_count) as raw, (SELECT cnt FROM deduped_count) as deduped
  `;

  // 2. Check Taxa + Estorno de taxa combined
  const taxaPlusEstorno = await sql`
    SELECT tipo, COUNT(*) as cnt, SUM(valor) as total
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND data <= '2026-07-31'
      AND (tipo = 'Taxa' OR tipo = 'Estorno de taxa' OR tipo = 'Pendência de taxa')
    GROUP BY tipo
    ORDER BY cnt DESC
  `;

  // 3. ABNER: compare raw vs deduped, and check for Estorno de taxa
  const abnerAllTaxaLike = await sql`
    SELECT tipo, COUNT(*) as cnt, SUM(valor) as total
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND UPPER(usuario) = 'ABNER ANDRADE CAVALCANTE'
      AND data <= '2026-07-31'
      AND (tipo = 'Taxa' OR tipo = 'Estorno de taxa' OR tipo ILIKE '%taxa%')
    GROUP BY tipo
    ORDER BY cnt DESC
  `;

  // 4. ABNER: check for duplicate codigo_transacao
  const abnerDupes = await sql`
    SELECT codigo_transacao, COUNT(*) as cnt
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND UPPER(usuario) = 'ABNER ANDRADE CAVALCANTE'
      AND tipo = 'Taxa'
      AND data <= '2026-07-31'
      AND codigo_transacao IS NOT NULL
    GROUP BY codigo_transacao
    HAVING COUNT(*) > 1
    LIMIT 10
  `;

  // 5. ABNER: raw count vs deduped count
  const abnerRawVsDeduped = await sql`
    WITH raw AS (
      SELECT COUNT(*) as cnt
      FROM extrato_movimentacao
      WHERE is_snapshot = FALSE
        AND UPPER(usuario) = 'ABNER ANDRADE CAVALCANTE'
        AND tipo = 'Taxa'
        AND data <= '2026-07-31'
    ),
    deduped AS (
      SELECT COUNT(*) as cnt FROM (
        SELECT DISTINCT ON (
          UPPER(usuario), data, tipo, valor,
          COALESCE(NULLIF(codigo_transacao, ''), hora::text)
        )
          1
        FROM extrato_movimentacao
        WHERE is_snapshot = FALSE
          AND UPPER(usuario) = 'ABNER ANDRADE CAVALCANTE'
          AND tipo = 'Taxa'
          AND data <= '2026-07-31'
        ORDER BY UPPER(usuario), data, tipo, valor,
          COALESCE(NULLIF(codigo_transacao, ''), hora::text)
      ) d
    )
    SELECT (SELECT cnt FROM raw) as raw, (SELECT cnt FROM deduped) as deduped
  `;

  return NextResponse.json({
    raw_vs_deduped: rawVsDeduped[0],
    taxa_plus_estorno: taxaPlusEstorno,
    abner_all_taxa_like: abnerAllTaxaLike,
    abner_dupes: abnerDupes,
    abner_raw_vs_deduped: abnerRawVsDeduped[0],
  });
}
