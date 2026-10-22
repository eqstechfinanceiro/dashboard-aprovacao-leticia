import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { revalidarServicos } from '@/lib/fiscal/servico-validar';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// POST /api/fiscal/servico-revalidar { nota_ids?: number[], limit?: number, fetch_docs?: boolean }
// Revalida notas de serviço pendentes/em falha técnica server-side:
// extrai texto de TODOS os anexos do processo (pdfjs — tolerante onde o
// PyPDF2 do runner morria) e confere doc+valor em qualquer anexo; PDF-imagem
// cai pra conferência por metadados do processo (wsrprocpag), sem OCR.
export async function POST(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 });
  let body: { nota_ids?: number[]; nota_id?: number; limit?: number; fetch_docs?: boolean } = {};
  try { body = await request.json(); } catch {}
  const notaIds = Array.isArray(body.nota_ids) && body.nota_ids.length
    ? body.nota_ids.map((x) => parseInt(String(x), 10)).filter((x) => Number.isFinite(x))
    : body.nota_id
      ? [parseInt(String(body.nota_id), 10)]
      : undefined;
  const resumo = await revalidarServicos({
    notaIds,
    limit: notaIds?.length ? notaIds.length : Math.min(body.limit ?? 15, 50),
    fetchDocs: body.fetch_docs !== false,
  });
  return NextResponse.json(resumo);
}
