import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureTesRegrasTable, normCnpj } from '@/lib/fiscal/tes-regras';

export const dynamic = 'force-dynamic';

/**
 * GET /api/fiscal/tes-regras/lookup?cnpj=12345678000190&empresa=EQS
 *
 * Endpoint consumido pelo Lince (autenticado via x-lince-tes-secret no
 * middleware). Devolve TODAS as regras ativas do fornecedor em uma única
 * query — o bot cacheia por ~60s, então uma NF de 200 itens custa 1 request.
 *
 * Resposta: { regras: { "PRODUTO": "408", ... } } — chaves já vêm
 * normalizadas (upper, trim). O bot aplica lstrip('0') nos dois lados.
 */
export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'DB não disponível' }, { status: 503 });
  await ensureTesRegrasTable();
  const p = request.nextUrl.searchParams;
  const cnpj = normCnpj(p.get('cnpj') || '');
  const empresa = (p.get('empresa') || '').trim().toUpperCase();
  if (!cnpj) return NextResponse.json({ error: 'cnpj obrigatório' }, { status: 400 });

  const r = await sql.query(
    `SELECT produto, tes FROM lince_tes_regras
     WHERE ativo AND fornecedor_cnpj = $1 AND (empresa = $2 OR empresa = '*')`,
    [cnpj, empresa || ''],
  );
  const regras: Record<string, string> = {};
  for (const row of r.rows) {
    if (row.produto && row.tes) regras[String(row.produto).trim().toUpperCase()] = String(row.tes).trim().toUpperCase();
  }
  return NextResponse.json({ regras, total: r.rowCount }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
