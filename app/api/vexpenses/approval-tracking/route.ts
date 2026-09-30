import { NextRequest, NextResponse } from 'next/server';
import { apiCache } from '@/lib/db/neon-cache';
import { getScopeForRequest, normalizeName } from '@/lib/auth/scope';
import { fetchApprovalTrackingExcel } from '@/lib/api/approval-excel';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const cacheKey = 'approval-tracking';
    const scope = await getScopeForRequest(request);

    const staleResult = await apiCache.getWithStale(cacheKey);

    if (staleResult.data) {
      console.log(`Cache ${staleResult.isStale ? 'stale' : 'fresh'} hit for ${cacheKey}`);

      if (staleResult.shouldRefresh) {
        refreshCacheInBackground(cacheKey);
      }

      const d = staleResult.data as any;
      if (scope && Array.isArray(d.data)) {
        const filtered = d.data.filter((r: any) => r.owner && scope.names.has(normalizeName(String(r.owner))));
        return NextResponse.json({ ...d, data: filtered, count: filtered.length });
      }
      return NextResponse.json(d);
    }

    console.log(`Cache miss for ${cacheKey}`);

    const reports = await fetchApprovalTrackingExcel();

    const result = { data: reports, count: reports.length, cached_at: new Date().toISOString() };

    await apiCache.set(cacheKey, result, 5 * 60 * 1000);

    if (scope) {
      const filtered = reports.filter((r: any) => r.owner && scope.names.has(normalizeName(String(r.owner))));
      return NextResponse.json({ ...result, data: filtered, count: filtered.length });
    }
    return NextResponse.json(result);

  } catch (error) {
    console.error('Error fetching approval tracking:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch approval tracking';

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
    console.log(`[Background Refresh] Refreshing ${cacheKey}`);

    const reports = await fetchApprovalTrackingExcel();
    const result = { data: reports, count: reports.length, cached_at: new Date().toISOString() };

    await apiCache.set(cacheKey, result, 5 * 60 * 1000);

    console.log(`[Background Refresh] Successfully refreshed: ${cacheKey}`);
  } catch (error) {
    console.error(`[Background Refresh] Error refreshing ${cacheKey}:`, error);
  }
}
