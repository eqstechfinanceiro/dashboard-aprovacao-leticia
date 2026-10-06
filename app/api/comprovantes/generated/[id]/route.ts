import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { sql } from '@/lib/db/neon';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/comprovantes/generated/<envioId> — stream do PDF gerado (split)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!sql) return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  const rows = await sql`SELECT generated_pdf_path, destino_filename FROM comprovantes_envios WHERE id = ${id}`;
  const path = rows[0]?.generated_pdf_path;
  if (!path || !existsSync(path)) {
    return NextResponse.json({ error: 'PDF gerado não encontrado' }, { status: 404 });
  }
  const buf = readFileSync(path);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${rows[0].destino_filename || 'comprovante.pdf'}"`,
    },
  });
}
