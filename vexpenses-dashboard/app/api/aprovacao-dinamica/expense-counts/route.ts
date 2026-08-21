import { NextRequest, NextResponse } from 'next/server';
import { vexpensesFetchWithRotation } from '@/lib/vexpenses-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const countsCache = new Map<number, { count: number; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reportIds = searchParams.get('ids');

    if (!reportIds) {
      return NextResponse.json({ success: true, data: {} });
    }

    const ids = reportIds.split(',').map(id => parseInt(id.trim(), 10)).filter(Boolean);
    const now = Date.now();
    const counts: Record<number, number> = {};
    const toFetch: number[] = [];

    for (const id of ids) {
      const cached = countsCache.get(id);
      if (cached && now - cached.ts < CACHE_TTL_MS) {
        counts[id] = cached.count;
      } else {
        toFetch.push(id);
      }
    }

    const BATCH_SIZE = 5;

    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      const batch = toFetch.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (id) => {
        try {
          const resp = await vexpensesFetchWithRotation(
            `/v2/reports/${id}?include=expenses.expense_type,expenses.costs_center,expenses.payment_method,user`,
            { signal: AbortSignal.timeout(30000) },
            3
          );
          if (resp.ok) {
            const data = await resp.json();
            const expenses = data.data?.expenses?.data || [];
            counts[id] = expenses.length;
            countsCache.set(id, { count: expenses.length, ts: Date.now() });
          }
        } catch {}
      });
      await Promise.all(promises);

      if (i + BATCH_SIZE < toFetch.length) {
        await sleep(300);
      }
    }

    return NextResponse.json({ success: true, data: counts });
  } catch (error) {
    console.error('[Expense Counts] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
