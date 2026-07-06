import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reportIds = searchParams.get('ids');

    if (!reportIds) {
      return NextResponse.json({ success: true, data: {} });
    }

    const ids = reportIds.split(',').map(id => parseInt(id.trim(), 10)).filter(Boolean);

    // Batch fetch expense counts - fetch reports with expenses included but only count them
    // Do 5 at a time to avoid overwhelming the API
    const BATCH_SIZE = 5;
    const counts: Record<number, number> = {};

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (id) => {
        try {
          const resp = await fetch(`${API_URL}/v2/reports/${id}?include=expenses`, {
            headers: { 'Authorization': API_KEY, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(30000),
          });
          if (resp.ok) {
            const data = await resp.json();
            const expenses = data.data?.expenses?.data || [];
            counts[id] = expenses.length;
          }
        } catch {
          // skip on error
        }
      });
      await Promise.all(promises);
    }

    return NextResponse.json({ success: true, data: counts });
  } catch (error) {
    console.error('[Expense Counts] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
