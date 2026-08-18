import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

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

    const BATCH_SIZE = 2;
    let consecutive403 = 0;

    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      const batch = toFetch.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (id) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const resp = await fetch(`${API_URL}/v2/reports/${id}?include=expenses`, {
              headers: { 'Authorization': API_KEY, 'Accept': 'application/json' },
              signal: AbortSignal.timeout(30000),
            });
            if (resp.ok) {
              const data = await resp.json();
              const expenses = data.data?.expenses?.data || [];
              counts[id] = expenses.length;
              countsCache.set(id, { count: expenses.length, ts: Date.now() });
              consecutive403 = 0;
              return;
            }
            if (resp.status === 403) {
              consecutive403++;
              const backoff = Math.min(2000 * Math.pow(2, attempt), 10000);
              console.log(`[Expense Counts] 403 on report ${id}, attempt ${attempt + 1}, waiting ${backoff}ms`);
              await sleep(backoff);
              continue;
            }
            return;
          } catch {
            return;
          }
        }
      });
      await Promise.all(promises);

      if (consecutive403 >= 4) {
        console.log(`[Expense Counts] Too many 403s (${consecutive403}), stopping early`);
        break;
      }

      if (i + BATCH_SIZE < toFetch.length) {
        await sleep(500);
      }
    }

    return NextResponse.json({ success: true, data: counts });
  } catch (error) {
    console.error('[Expense Counts] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
