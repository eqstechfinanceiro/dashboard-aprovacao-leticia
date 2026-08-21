import { NextRequest, NextResponse } from 'next/server';
import { validateReport } from '@/lib/nf-validator';

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

    const validation = await validateReport(reportId);

    if (!validation) {
      return NextResponse.json({
        success: true,
        data: null,
        error: 'no_data',
      });
    }

    return NextResponse.json({
      success: true,
      data: validation,
    });
  } catch (error) {
    console.error('[NF Validation] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
