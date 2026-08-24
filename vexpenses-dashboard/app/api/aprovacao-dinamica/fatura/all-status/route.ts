import { NextResponse } from 'next/server';
import { getFaturaValidationsByReports } from '@/lib/fatura-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const allMap = await getFaturaValidationsByReports([]);
    return NextResponse.json({ data: allMap });
  } catch (error: any) {
    console.error('[Fatura All Status] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
