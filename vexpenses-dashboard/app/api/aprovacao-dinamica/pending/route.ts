import { NextRequest, NextResponse } from 'next/server';
import { getPendingReports } from '@/lib/pending-reports';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeAudit = searchParams.get('include_audit') === 'true';
    const approverId = searchParams.get('approver_id');
    const stepFilter = searchParams.get('step');

    const result = await getPendingReports({
      approverId,
      stepFilter,
      includeAudit,
    });

    console.log(
      `[Pending] Data layer timings: reports=${result.timings.reports}ms, reprovado=${result.timings.reprovado}ms, team=${result.timings.team}ms, flows=${result.timings.flows}ms, tracking=${result.timings.tracking}ms`
    );

    return NextResponse.json({
      success: true,
      data: result.reports,
      total: result.reports.length,
      from_cache: result.fromCache,
      timing_ms: result.timings.total,
    });
  } catch (error) {
    console.error('[Aprovacao Dinamica] Error fetching pending:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
