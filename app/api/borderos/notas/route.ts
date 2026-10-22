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
// Fila do contas a pagar: notas com erro/cancelamento cujo título está em
// borderô aguardando remoção. Sem o batch do worker nada entra aqui — a
// listagem é 100% leitura do cache fiscal_bordero_status.
//   fila     → (em_bordero OR pago-sem-borderô) AND sem confirmação manual
//              AND sem remoção detectada — paga direto também é acionável
//              (correção exige estorno + devolução pro entrada)
//   ?todas=1 → inclui removidas/confirmadas (histórico da fila)
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
    WHERE (${todas} OR ((bs.em_bordero OR bs.pago) AND bs.remocao_confirmada_at IS NULL AND bs.removida_detectada_at IS NULL))
      AND (${q} = '' OR lower(n.doc) LIKE ${'%' + q + '%'}
           OR lower(COALESCE(n.fornecedor, '')) LIKE ${'%' + q + '%'}
           OR lower(COALESCE(n.chave_acesso, '')) LIKE ${'%' + q + '%'})
    ORDER BY
      CASE WHEN (bs.em_bordero OR bs.pago) AND bs.remocao_confirmada_at IS NULL AND bs.removida_detectada_at IS NULL THEN 0 ELSE 1 END,
      bs.pago ASC, bs.checked_at DESC
    LIMIT 500
  `;

  const resumo = await sql`
    SELECT
      COUNT(*) FILTER (WHERE (em_bordero OR pago) AND remocao_confirmada_at IS NULL AND removida_detectada_at IS NULL)::int AS na_fila,
      COUNT(*) FILTER (WHERE pago AND remocao_confirmada_at IS NULL AND removida_detectada_at IS NULL)::int AS pagas_na_fila,
      MAX(checked_at) AS ultima_verificacao
    FROM fiscal_bordero_status
  `;

  return NextResponse.json({
    notas: rows.map((r: any) => ({
      ...r,
      borderos: (r.borderos || []).map((b: any) => ({ ...b, banco_nome: BANCOS[b.banco] || b.banco })),
    })),
    resumo: resumo[0] || { na_fila: 0, pagas_na_fila: 0, ultima_verificacao: null },
  });
}
