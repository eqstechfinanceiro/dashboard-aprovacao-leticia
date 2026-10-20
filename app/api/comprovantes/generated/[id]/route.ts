import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { sql } from '@/lib/db/neon';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/comprovantes/generated/<envioId>[?doc=guia] — stream do PDF gerado
// (split) ou, com doc=guia, da guia FGTS baixada do portal na identificação.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!sql) return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  const isGuia = req.nextUrl.searchParams.get('doc') === 'guia';
  const rows = isGuia
    ? await sql`SELECT meta->'portal'->>'guiaPath' AS path, meta->'portal'->>'guia' AS nome FROM comprovantes_envios WHERE id = ${id}`
    : await sql`SELECT generated_pdf_path AS path, destino_filename AS nome FROM comprovantes_envios WHERE id = ${id}`;
  const path = rows[0]?.path;
  if (!path || !existsSync(path)) {
    return NextResponse.json({ error: isGuia ? 'guia não encontrada' : 'PDF gerado não encontrado' }, { status: 404 });
  }
  const buf = readFileSync(path);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${rows[0].nome || (isGuia ? 'guia.pdf' : 'comprovante.pdf')}"`,
    },
  });
}
