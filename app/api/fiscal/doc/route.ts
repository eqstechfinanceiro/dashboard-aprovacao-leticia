import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, existsSync, statSync } from 'fs';
import { Readable } from 'stream';
import path from 'path';
import { sql } from '@/lib/db/neon';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DIR = path.join(process.cwd(), 'private-downloads');

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.xml': 'application/xml',
};

// GET /api/fiscal/doc?id=<fiscal_nota_id>
// Serve o documento-fonte (XML da NF ou PDF da NFS) que a automação anexou —
// é a evidência que o fiscal usa pra decidir se o lançamento está certo.
// Inline (não attachment): abre no navegador.
export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 });

  const id = parseInt(request.nextUrl.searchParams.get('id') || '', 10);
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const rows = await sql`SELECT doc_path, doc_nome FROM fiscal_notas WHERE id = ${id}`;
  const docPath = rows[0]?.doc_path as string | undefined;
  const docNome = (rows[0]?.doc_nome as string) || 'documento';
  if (!docPath || !docPath.startsWith('fiscal/')) {
    return NextResponse.json({ error: 'Documento não anexado' }, { status: 404 });
  }

  const file = path.join(DIR, docPath);
  if (!existsSync(file)) {
    return NextResponse.json({ error: 'Arquivo indisponível' }, { status: 404 });
  }

  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const webStream = Readable.toWeb(createReadStream(file));
  return new NextResponse(webStream as ReadableStream, {
    headers: {
      'Content-Type': type,
      'Content-Length': String(statSync(file).size),
      'Content-Disposition': `inline; filename="${docNome}"`,
    },
  });
}
