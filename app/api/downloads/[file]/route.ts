import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, existsSync, statSync } from 'fs';
import { Readable } from 'stream';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Arquivos baixáveis ficam fora de public/ — só usuários autenticados baixam
// (o zip da extensão carrega o secret de sync do token).
const DIR = path.join(process.cwd(), 'private-downloads');
const ALLOWED: Record<string, string> = {
  'Aery-Setup-1.0.0.exe': 'application/vnd.microsoft.portable-executable',
  'aery-extension.zip': 'application/zip',
};
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// Planilhas de quinzena geradas pelo fechamento de um clique
const GENERATED_XLSX = /^controle_\d{4}_\d{2}_Q[12](?:_[a-z0-9]+)?\.xlsx$/;

export async function GET(_req: NextRequest, { params }: { params: { file: string } }) {
  const name = params.file;
  const type = ALLOWED[name] ?? (GENERATED_XLSX.test(name) ? XLSX_TYPE : undefined);
  if (!type) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const file = path.join(DIR, name);
  if (!existsSync(file)) return NextResponse.json({ error: 'Arquivo indisponível' }, { status: 404 });

  const webStream = Readable.toWeb(createReadStream(file));
  return new NextResponse(webStream as ReadableStream, {
    headers: {
      'Content-Type': type,
      'Content-Length': String(statSync(file).size),
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  });
}
