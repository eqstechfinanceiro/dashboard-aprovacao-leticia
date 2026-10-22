import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureFiscalTables } from '@/lib/fiscal/fiscal-db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BANCOS: Record<string, string> = {
  '001': 'Banco do Brasil', '033': 'Santander', '104': 'Caixa',
  '237': 'Bradesco', '341': 'Itaú', '748': 'Sicredi',
};

// GET /api/borderos/notas[?todas=1]
// Fila do contas a pagar: notas com PROBLEMA (erro confirmado, falha técnica
// ou cancelamento) cujo título está em borderô — ou já foi pago — aguardando
// remoção/estorno. Nota pendente/em dia em borderô é fluxo normal e fica fora.
//   fila     → (em_bordero OR pago) AND status-problema AND sem confirmação
//              manual AND sem remoção detectada
//   ?todas=1 → todas as linhas do cache (contexto completo, incl. saudáveis)
export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 });
  await ensureFiscalTables();

  const todas = request.nextUrl.searchParams.get('todas') === '1';
  const q = (request.nextUrl.searchParams.get('q') || '').trim().toLowerCase();

  const rows = await sql`
    SELECT n.id AS nota_id, n.tipo, n.doc, n.serie, n.filial, n.fornecedor, n.cnpj,
           n.valor, n.emissao::text, n.chave_acesso, n.review_status, n.erro_tipo,
           n.extra, n.cancelled_by, n.cancelled_at,
           bs.em_bordero, bs.pago, bs.borderos, bs.checked_at,
           bs.remocao_confirmada_at, bs.remocao_confirmada_by, bs.removida_detectada_at
    FROM fiscal_bordero_status bs
    JOIN fiscal_notas n ON n.id = bs.nota_id
    WHERE (bs.em_bordero OR bs.pago OR
           (${todas} AND (bs.remocao_confirmada_at IS NOT NULL OR bs.removida_detectada_at IS NOT NULL)))
      AND (${todas} OR (bs.remocao_confirmada_at IS NULL
                        AND bs.removida_detectada_at IS NULL
                        AND n.review_status IN ('falha_tecnica','confirmado_erro','cancelado')))
      AND (${q} = '' OR lower(n.doc) LIKE ${'%' + q + '%'}
           OR lower(COALESCE(n.fornecedor, '')) LIKE ${'%' + q + '%'}
           OR lower(COALESCE(n.chave_acesso, '')) LIKE ${'%' + q + '%'})
    ORDER BY
      CASE WHEN (bs.em_bordero OR bs.pago) AND bs.remocao_confirmada_at IS NULL AND bs.removida_detectada_at IS NULL
           AND n.review_status IN ('falha_tecnica','confirmado_erro','cancelado') THEN 0 ELSE 1 END,
      bs.pago ASC, bs.checked_at DESC
    LIMIT 500
  `;

  const resumo = await sql`
    SELECT
      COUNT(*) FILTER (WHERE (bs.em_bordero OR bs.pago)
                       AND bs.remocao_confirmada_at IS NULL AND bs.removida_detectada_at IS NULL
                       AND n.review_status IN ('falha_tecnica','confirmado_erro','cancelado'))::int AS na_fila,
      COUNT(*) FILTER (WHERE bs.pago AND bs.remocao_confirmada_at IS NULL AND bs.removida_detectada_at IS NULL
                       AND n.review_status IN ('falha_tecnica','confirmado_erro','cancelado'))::int AS pagas_na_fila,
      COUNT(*) FILTER (WHERE bs.em_bordero)::int AS total_em_bordero,
      COUNT(*) FILTER (WHERE bs.em_bordero AND bs.remocao_confirmada_at IS NULL AND bs.removida_detectada_at IS NULL
                       AND n.review_status IN ('falha_tecnica','confirmado_erro','cancelado'))::int AS em_bordero_na_fila,
      COUNT(*) FILTER (WHERE bs.pago)::int AS total_pagas,
      COUNT(*) FILTER (WHERE bs.remocao_confirmada_at IS NOT NULL OR bs.removida_detectada_at IS NOT NULL)::int AS resolvidas,
      MAX(bs.checked_at) AS ultima_verificacao
    FROM fiscal_bordero_status bs
    JOIN fiscal_notas n ON n.id = bs.nota_id
  `;

  return NextResponse.json({
    notas: rows.map((r: any) => ({
      ...r,
      borderos: (r.borderos || []).map((b: any) => ({ ...b, banco_nome: BANCOS[b.banco] || b.banco })),
    })),
    resumo: resumo[0] || null,
  });
}
