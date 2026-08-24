import { NextRequest, NextResponse } from 'next/server';
import { getFaturaValidationsByReport } from '@/lib/fatura-db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const reportId = request.nextUrl.searchParams.get('reportId');
  if (!reportId) {
    return NextResponse.json({ error: 'reportId is required' }, { status: 400 });
  }

  try {
    const validations = await getFaturaValidationsByReport(parseInt(reportId, 10));
    return NextResponse.json({ data: validations });
  } catch (error: any) {
    console.error('[Fatura Status] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
