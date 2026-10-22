import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { checkTituloBordero, sa2ByCnpj } from '@/lib/conferencia/totvs';
import { EMPRESAS as EMPRESAS_TOTVS } from '@/lib/impacto/totvs';
import { ensureFiscalTables } from '@/lib/fiscal/fiscal-db';
import { fornecedorCodigoNota, lojaNota } from '@/lib/fiscal/bordero-monitor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BANCOS: Record<string, string> = {
  '001': 'Banco do Brasil', '033': 'Santander', '104': 'Caixa',
  '237': 'Bradesco', '341': 'Itaú', '748': 'Sicredi',
};

const withBancoNome = (bs: any[]) => bs.map((b) => ({ ...b, banco_nome: BANCOS[b.banco] || b.banco }));

// GET /api/fiscal/bordero?nota_id=<fiscal_nota_id>[&fresh=1]
// Responde se a NF está/esteve em borderô de pagamento (SEA + baixa SE2).
// Lê o cache fiscal_bordero_status (alimentado em batch pelo worker); sem
// cache ou com ?fresh=1 consulta o TOTVS ao vivo e já grava o resultado.
// `fornecedor` é o código SA2 — em notas de serviço a coluna guarda o nome,
// então o código vem de extra.fornecedor_cod (bug corrigido aqui e no batch).
export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 });
  await ensureFiscalTables();

  const id = parseInt(request.nextUrl.searchParams.get('nota_id') || request.nextUrl.searchParams.get('id') || '', 10);
  if (!id) return NextResponse.json({ error: 'nota_id obrigatório' }, { status: 400 });
  const fresh = request.nextUrl.searchParams.get('fresh') === '1';

  const rows = await sql`SELECT doc, serie, fornecedor, cnpj, tipo, extra FROM fiscal_notas WHERE id = ${id}`;
  if (!rows[0]) return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 });
  const n = rows[0];

  if (!fresh) {
    const cached = await sql`SELECT em_bordero, pago, borderos, checked_at FROM fiscal_bordero_status WHERE nota_id = ${id}`;
    if (cached[0]) {
      return NextResponse.json({
        em_bordero: cached[0].em_bordero,
        pago: cached[0].pago,
        borderos: withBancoNome(cached[0].borderos || []),
        checked_at: cached[0].checked_at,
        cached: true,
      });
    }
  }

  let loja = lojaNota(n);
  let fornec = fornecedorCodigoNota(n);
  const empresa = String((n.extra as any)?.empresa || '').trim().toUpperCase();
  // Fornecedor gravado como nome — resolve o código SA2 por CNPJ (o batch
  // faz o mesmo e já faz backfill do extra; aqui é o caminho ad-hoc).
  if (!fornec && /^\d{14}$/.test(String(n.cnpj || '').trim())) {
    const emps = empresa && EMPRESAS_TOTVS[empresa] ? [empresa] : Object.keys(EMPRESAS_TOTVS);
    for (const emp of emps) {
      const f = await sa2ByCnpj(EMPRESAS_TOTVS[emp], String(n.cnpj).trim());
      if (f) { fornec = f.cod; loja = loja || f.loja; break; }
    }
  }
  const borderos = await checkTituloBordero(String(n.doc), String(n.serie || ''), fornec, loja, empresa || undefined);

  const emBordero = borderos.length > 0;
  const pago = borderos.some((b) => !!b.baixa);
  await sql`
    INSERT INTO fiscal_bordero_status (nota_id, em_bordero, pago, borderos, checked_at)
    VALUES (${id}, ${emBordero}, ${pago}, ${JSON.stringify(borderos)}::jsonb, NOW())
    ON CONFLICT (nota_id) DO UPDATE SET
      em_bordero = EXCLUDED.em_bordero, pago = EXCLUDED.pago,
      borderos = EXCLUDED.borderos, checked_at = NOW(), check_error = NULL
  `;

  return NextResponse.json({
    em_bordero: emBordero,
    pago,
    borderos: withBancoNome(borderos),
    checked_at: new Date().toISOString(),
    cached: false,
  });
}
