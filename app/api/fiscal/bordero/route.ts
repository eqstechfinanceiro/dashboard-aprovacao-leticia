import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { checkTituloBordero } from '@/lib/conferencia/totvs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BANCOS: Record<string, string> = {
  '001': 'Banco do Brasil', '033': 'Santander', '104': 'Caixa',
  '237': 'Bradesco', '341': 'Itaú', '748': 'Sicredi',
};

// GET /api/fiscal/bordero?nota_id=<fiscal_nota_id>
// Consulta a SEA (títulos enviados ao banco) + baixa SE2 no TOTVS e responde
// se a NF está/esteve em borderô de pagamento — número, data, banco e se já
// baixou (paga). Usado na nota expandida pra avisar que uma nota com erro
// já entrou em pagamento (correção fora do fluxo normal).
export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 });

  const id = parseInt(request.nextUrl.searchParams.get('nota_id') || request.nextUrl.searchParams.get('id') || '', 10);
  if (!id) return NextResponse.json({ error: 'nota_id obrigatório' }, { status: 400 });

  const rows = await sql`SELECT doc, serie, fornecedor, extra FROM fiscal_notas WHERE id = ${id}`;
  if (!rows[0]) return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 });

  const n = rows[0];
  const loja = String((n.extra as any)?.f1_loja || (n.extra as any)?.loja || '').trim();
  const borderos = await checkTituloBordero(String(n.doc), String(n.serie || ''), String(n.fornecedor || ''), loja);

  return NextResponse.json({
    em_bordero: borderos.length > 0,
    pago: borderos.some((b) => !!b.baixa),
    borderos: borderos.map((b) => ({ ...b, banco_nome: BANCOS[b.banco] || b.banco })),
  });
}
