import { NextRequest, NextResponse } from 'next/server';
import { getApprovalIdMap, fetchHorusInconsistencies, summarizeHorus, HorusSummary } from '@/lib/horus';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reportIdsParam = searchParams.get('report_ids');
    if (!reportIdsParam) {
      return NextResponse.json({ error: 'report_ids is required' }, { status: 400 });
    }

    const reportIds = reportIdsParam
      .split(',')
      .map(id => parseInt(id.trim(), 10))
      .filter(id => !isNaN(id));

    if (reportIds.length === 0) {
      return NextResponse.json({ success: true, data: {} });
    }

    const approvalMap = await getApprovalIdMap();

    const result: Record<number, HorusSummary | { error: string }> = {};

    const batchSize = 5;
    for (let i = 0; i < reportIds.length; i += batchSize) {
      const batch = reportIds.slice(i, i + batchSize);
      const promises = batch.map(async (reportId) => {
        const approvalId = approvalMap.get(reportId);
        if (!approvalId) {
          result[reportId] = { error: 'approval_not_found' };
          return;
        }

        const horusData = await fetchHorusInconsistencies(approvalId);
        if (!horusData) {
          result[reportId] = { error: 'horus_unavailable' };
          return;
        }

        result[reportId] = summarizeHorus(horusData);
      });

      await Promise.all(promises);
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Hórus Batch] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
