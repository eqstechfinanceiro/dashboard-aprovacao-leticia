import { NextRequest, NextResponse } from 'next/server';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { BANCO_NOME } from '@/lib/comprovantes/cnab';
import { uploadsRoot } from '@/lib/comprovantes/uploads';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Detecta banco do TXT pelo header CNAB (pos 0-2). */
function detectTxt(buffer: Buffer): string | null {
  const first = buffer.toString('latin1').split(/\r?\n/)[0] || '';
  const code = first.slice(0, 3);
  return BANCO_NOME[code] || null;
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'form-data inválido' }, { status: 400 });

  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: 'nenhum arquivo' }, { status: 400 });

  const uploadId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const dir = join(uploadsRoot(), uploadId);
  mkdirSync(dir, { recursive: true });

  const out: { name: string; size: number; kind: 'pdf' | 'txt' | 'outro'; banco?: string | null }[] = [];
  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    const name = file.name.replace(/[\\/]/g, '_');
    const upper = name.toUpperCase();
    const kind = upper.endsWith('.PDF') ? 'pdf' : upper.endsWith('.TXT') ? 'txt' : 'outro';
    const info: (typeof out)[number] = { name, size: buf.length, kind };
    if (kind === 'txt') info.banco = detectTxt(buf);
    writeFileSync(join(dir, name), buf);
    out.push(info);
  }

  return NextResponse.json({ uploadId, dir, files: out });
}
