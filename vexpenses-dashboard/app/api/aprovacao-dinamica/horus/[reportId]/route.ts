import { NextRequest, NextResponse } from 'next/server';
import { getApprovalIdMap, fetchHorusInconsistencies } from '@/lib/horus';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(
  _request: NextRequest,
  { params }: { params: { reportId: string } }
) {
  try {
    const reportId = parseInt(params.reportId, 10);
    if (!reportId) {
      return NextResponse.json({ error: 'Invalid reportId' }, { status: 400 });
    }

    const approvalMap = await getApprovalIdMap();
    const approvalId = approvalMap.get(reportId);

    if (!approvalId) {
      return NextResponse.json({
        success: true,
        data: null,
        error: 'approval_not_found',
      });
    }

    const horusData = await fetchHorusInconsistencies(approvalId);

    if (!horusData) {
      return NextResponse.json({
        success: true,
        data: null,
        error: 'horus_unavailable',
      });
    }

    return NextResponse.json({
      success: true,
      data: horusData,
    });
  } catch (error) {
    console.error('[Hórus] Error fetching inconsistencies:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
