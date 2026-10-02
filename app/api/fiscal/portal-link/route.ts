import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { eqsGetFornecedorByCnpj, eqsGetProcessoRecno } from '@/lib/fiscal/eqs-portal';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PORTAL_BASE = 'https://portal.eqsengenharia.com.br';

// GET /api/fiscal/portal-link?id=<fiscal_nota_id>
// Resolve o NDSRECNO do processo de pagamento no Protheus (doc + fornecedor)
// e redireciona pro deep link da nota no portal EQS:
//   /compras/processo-pagamento/nota/manutencao/:NDSRECNO
// O recno resolvido é cacheado em extra.recno pra não repetir a consulta.
export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 });

  const id = parseInt(request.nextUrl.searchParams.get('id') || '', 10);
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const rows = await sql`SELECT doc, cnpj, extra FROM fiscal_notas WHERE id = ${id}`;
  if (!rows[0]) return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 });

  const nota = rows[0];
  let recno = (nota.extra as any)?.recno as string | undefined;

  if (!recno) {
    const cnpj = String(nota.cnpj || '').replace(/\D/g, '');
    const doc = String(nota.doc || '').trim();
    if (!/^\d{14}$/.test(cnpj) || !doc) {
      return NextResponse.json({ error: 'Nota sem CNPJ/número suficiente pra localizar no portal' }, { status: 422 });
    }
    try {
      const fornec = await eqsGetFornecedorByCnpj(cnpj);
      if (!fornec) return NextResponse.json({ error: 'Fornecedor não encontrado no Protheus' }, { status: 404 });
      recno = (await eqsGetProcessoRecno(doc, fornec.cod)) || undefined;
    } catch (e) {
      return NextResponse.json({ error: `Portal EQS indisponível: ${(e as Error).message}` }, { status: 502 });
    }
    if (!recno) {
      return NextResponse.json({ error: 'Processo não encontrado no portal para essa nota' }, { status: 404 });
    }
    // Cacheia o recno pra próximas chamadas serem um redirect direto
    await sql`UPDATE fiscal_notas SET extra = coalesce(extra, '{}'::jsonb) || ${JSON.stringify({ recno })}::jsonb WHERE id = ${id}`;
  }

  return NextResponse.redirect(`${PORTAL_BASE}/compras/processo-pagamento/nota/manutencao/${recno}`, 302);
}
