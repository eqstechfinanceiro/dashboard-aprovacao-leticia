import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const reportId = request.nextUrl.searchParams.get('reportId');
  if (!reportId) {
    return NextResponse.json({ error: 'reportId is required' }, { status: 400 });
  }
  return NextResponse.json({ data: [] });
}
