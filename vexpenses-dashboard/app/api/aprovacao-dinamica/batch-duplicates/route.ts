import { NextRequest, NextResponse } from 'next/server';
import { getBatchDuplicatesSince } from '@/lib/nf-validator';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const { sql } = await import('@/lib/neon');
    if (!sql) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const sinceYear = request.nextUrl.searchParams.get('since') || '2026';
    const sinceDate = `${sinceYear}-01-01`;

    const pairs = await getBatchDuplicatesSince(sinceDate);

    return NextResponse.json({
      success: true,
      data: {
        pairs,
        total: pairs.length,
      },
    });
  } catch (error) {
    console.error('[Batch Duplicates] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
