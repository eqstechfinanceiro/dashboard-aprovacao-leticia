import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureTesRegrasTable } from '@/lib/fiscal/tes-regras';

export const dynamic = 'force-dynamic';

/**
 * GET /api/fiscal/tes-regras/lookup?empresa=EQS
 *
 * Config completa da parametrização TES em UM request — o Lince cacheia
 * ~60s e resolve todos os itens em memória (zero latência por item):
 *
 *   { cnpjs: [...],            // fornecedores da lista (CNPJ do emit do XML)
 *     produtos: [...],         // códigos canônicos (upper, sem zeros à esq.)
 *     mapa: { "405": "449" } } // TES calculada → TES crédito ICMS
 */
export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'DB não disponível' }, { status: 503 });
  await ensureTesRegrasTable();
  const empresa = (request.nextUrl.searchParams.get('empresa') || '').trim().toUpperCase();

  const [forns, prods, mapa] = await Promise.all([
    sql.query(
      `SELECT DISTINCT cnpj FROM lince_tes_fornecedores
       WHERE ativo AND cnpj IS NOT NULL AND cnpj <> ''
         AND (empresa = $1 OR empresa = '*')`,
      [empresa]),
    sql.query(`SELECT produto FROM lince_tes_produtos WHERE ativo`),
    sql.query(
      `SELECT tes_origem, tes_destino FROM lince_tes_mapa
       WHERE ativo AND (empresa = $1 OR empresa = '*')`,
      [empresa]),
  ]);
  return NextResponse.json(
    {
      cnpjs: forns.rows.map((r: any) => r.cnpj),
      produtos: prods.rows.map((r: any) => r.produto),
      mapa: Object.fromEntries(mapa.rows.map((r: any) => [r.tes_origem, r.tes_destino])),
      totais: { fornecedores: forns.rowCount, produtos: prods.rowCount, mapeamentos: mapa.rowCount },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
