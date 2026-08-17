import { NextResponse } from 'next/server';
import { getBatchDuplicates } from '@/lib/nf-validator';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET() {
  try {
    const { sql } = await import('@/lib/neon');
    if (!sql) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    // Fetch all report IDs
    const reports = await sql`
      SELECT DISTINCT id FROM prestacao_reports ORDER BY id
    `;
    const reportIds = (reports as any[]).map(r => r.id);

    if (reportIds.length === 0) {
      return NextResponse.json({ success: true, data: { pairs: [], total: 0 } });
    }

    const pairs = await getBatchDuplicates(reportIds);

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
