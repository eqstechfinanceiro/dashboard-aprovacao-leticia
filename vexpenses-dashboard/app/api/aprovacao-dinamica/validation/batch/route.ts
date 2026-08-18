import { NextRequest, NextResponse } from 'next/server';
import { validateBatch, ReportValidationSummary } from '@/lib/nf-validator';

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

    const result = await validateBatch(reportIds);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[NF Validation Batch] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
