import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname.includes('vexpenses') && !parsedUrl.hostname.includes('amazonaws') && !parsedUrl.hostname.includes('cloudfront')) {
      return NextResponse.json({ error: 'Invalid domain' }, { status: 403 });
    }

    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://app.vexpenses.com/',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!resp.ok) {
      return NextResponse.json({ error: `Fetch failed: ${resp.status}` }, { status: resp.status });
    }

    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await resp.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
