import { NextRequest, NextResponse } from 'next/server';
import { apiCache } from '@/lib/neon-cache';

export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

export async function GET(request: NextRequest) {
  try {
    const cacheKey = 'approval-flows';

    const staleResult = await apiCache.getWithStale(cacheKey);

    if (staleResult.data) {
      console.log(`Cache ${staleResult.isStale ? 'stale' : 'fresh'} hit for approval-flows`);

      if (staleResult.shouldRefresh) {
        refreshCacheInBackground(cacheKey);
      }

      return NextResponse.json(staleResult.data);
    }

    console.log('Cache miss for approval-flows');

    const response = await fetch(`${API_URL}/v2/approval-flows?paginate=false`, {
      headers: {
        'Authorization': API_KEY,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();

    await apiCache.set(cacheKey, data, 30 * 60 * 1000);

    return NextResponse.json(data);

  } catch (error) {
    console.error('Error fetching approval flows:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch approval flows';

    if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
      return NextResponse.json(
        { error: 'API timeout' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

async function refreshCacheInBackground(cacheKey: string) {
  try {
    console.log(`[Background Refresh] Refreshing approval-flows`);

    const response = await fetch(`${API_URL}/v2/approval-flows?paginate=false`, {
      headers: {
        'Authorization': API_KEY,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      console.error(`[Background Refresh] Failed to refresh approval-flows: ${response.status}`);
      return;
    }

    const data = await response.json();
    await apiCache.set(cacheKey, data, 30 * 60 * 1000);

    console.log(`[Background Refresh] Successfully refreshed: approval-flows`);
  } catch (error) {
    console.error(`[Background Refresh] Error refreshing approval-flows:`, error);
  }
}
