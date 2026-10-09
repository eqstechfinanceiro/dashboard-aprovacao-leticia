import { NextRequest, NextResponse } from 'next/server';
import { SP_SITES, fileExists, listFiles } from '@/lib/comprovantes/sharepoint';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET ?path=<caminho relativo no site /comprovantes>
//   arquivo → { exists: bool }; pasta → { files: [...] }
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path é obrigatório' }, { status: 400 });

  const site = SP_SITES.destino;
  try {
    if (path.toLowerCase().endsWith('.pdf')) {
      const exists = await fileExists(site, path);
      return NextResponse.json({ path, exists });
    }
    const files = await listFiles(site, path);
    return NextResponse.json({ path, files: files.map((f) => ({ name: f.name, size: f.size })) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
