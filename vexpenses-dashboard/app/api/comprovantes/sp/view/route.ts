import { NextRequest, NextResponse } from 'next/server';
import { downloadFile } from '@/lib/comprovantes/sharepoint';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// GET ?url=<serverRelativeUrl> — stream do PDF do SharePoint para visualização inline
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url é obrigatória' }, { status: 400 });
  if (!url.startsWith('/')) return NextResponse.json({ error: 'url inválida' }, { status: 400 });

  try {
    const buf = await downloadFile(url);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${url.split('/').pop()}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
