import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { Readable } from 'stream';
import path from 'path';
import { sql } from '@/lib/db/neon';
import { danfeHtml } from '@/lib/fiscal/danfe-html';
import { eqsGetDanfePdf } from '@/lib/fiscal/eqs-portal';

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

  const rows = await sql`SELECT doc_path, doc_nome, chave_acesso, doc, tipo FROM fiscal_notas WHERE id = ${id}`;
  if (!rows[0]) return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 });
  const docNome = (rows[0]?.doc_nome as string) || 'documento';
  let docPath = rows[0]?.doc_path as string | undefined;

  // Sem evidência local: tenta o DANFE do Protheus/SEFAZ pela chave de acesso
  // (o portal EQS já tem o certificado — não precisamos dele aqui). Se vier,
  // salva como evidência definitiva da nota pra não depender do portal depois.
  if ((!docPath || !docPath.startsWith('fiscal/')) && /^\d{44}$/.test(String(rows[0].chave_acesso || ''))) {
    try {
      const pdf = await eqsGetDanfePdf(String(rows[0].chave_acesso));
      if (pdf) {
        const rel = `fiscal/eqs-danfe-${id}.pdf`;
        mkdirSync(path.join(DIR, 'fiscal'), { recursive: true });
        writeFileSync(path.join(DIR, rel), pdf);
        const nome = `danfe-${rows[0].doc || id}.pdf`;
        await sql`UPDATE fiscal_notas SET doc_path = ${rel}, doc_nome = ${nome} WHERE id = ${id} AND (doc_path IS NULL OR doc_path = '')`;
        docPath = rel;
        return new NextResponse(new Uint8Array(pdf), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': String(pdf.length),
            'Content-Disposition': `inline; filename="${nome}"`,
          },
        });
      }
    } catch {
      // Portal indisponível: cai no 404 abaixo
    }
  }

  if (!docPath || !docPath.startsWith('fiscal/')) {
    return NextResponse.json({ error: 'Documento não anexado' }, { status: 404 });
  }

  const file = path.join(DIR, docPath);
  if (!existsSync(file)) {
    return NextResponse.json({ error: 'Arquivo indisponível' }, { status: 404 });
  }

  const ext = path.extname(file).toLowerCase();

  // XML de NF-e: renderiza como DANFE legível (HTML). ?raw=1 devolve o XML puro.
  if (ext === '.xml' && request.nextUrl.searchParams.get('raw') !== '1') {
    return new NextResponse(danfeHtml(readFileSync(file, 'utf-8')), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${docNome.replace(/\.xml$/i, '')}.html"`,
      },
    });
  }

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
