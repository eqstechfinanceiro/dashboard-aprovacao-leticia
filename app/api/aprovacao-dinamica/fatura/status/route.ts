import { NextRequest, NextResponse } from 'next/server';
import { ensureFaturaTable, getFaturaValidationsForReport, getFaturaValidationsForReports } from '@/lib/fatura-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get('reportId');
    const reportIds = searchParams.get('reportIds');

    await ensureFaturaTable();

    if (reportIds) {
      const ids = reportIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (ids.length === 0) {
        return NextResponse.json({ error: 'No valid reportIds' }, { status: 400 });
      }
      const result = await getFaturaValidationsForReports(ids);
      return NextResponse.json({ success: true, data: result });
    }

    if (reportId) {
      const id = parseInt(reportId);
      if (isNaN(id)) {
        return NextResponse.json({ error: 'Invalid reportId' }, { status: 400 });
      }
      const validations = await getFaturaValidationsForReport(id);
      return NextResponse.json({ success: true, data: validations });
    }

    return NextResponse.json({ error: 'Provide reportId or reportIds parameter' }, { status: 400 });
  } catch (error) {
    console.error('[Fatura Status API] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
