import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureServicoDocsTable, syncServicoDocs } from '@/lib/fiscal/servico-docs';

export const dynamic = 'force-dynamic';

// GET /api/fiscal/servico-docs?nota_id= — lista os anexos do portal de uma nota.
export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 });
  await ensureServicoDocsTable();
  const notaId = parseInt(request.nextUrl.searchParams.get('nota_id') || '', 10);
  if (!notaId) return NextResponse.json({ error: 'nota_id obrigatório' }, { status: 400 });
  const docs = await sql`
    SELECT id, nota_id, arquivo_id, nome, tipo, size, created_at
    FROM fiscal_notas_docs WHERE nota_id = ${notaId}
    ORDER BY (tipo = 'G') DESC, id`;
  return NextResponse.json({ docs });
}

// POST /api/fiscal/servico-docs { nota_id?, force?, limit? }
// Busca TODOS os documentos do processo no portal EQS e anexa à nota — resolve
// o caso em que o runner baixou só um boleto e a nota real ficou no portal.
export async function POST(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 });
  let body: { nota_id?: number; force?: boolean; limit?: number } = {};
  try { body = await request.json(); } catch {}
  const resumo = await syncServicoDocs({
    notaId: body.nota_id || undefined,
    force: !!body.force,
    limit: body.nota_id ? 1 : Math.min(body.limit ?? 10, 50),
  });
  return NextResponse.json(resumo);
}
