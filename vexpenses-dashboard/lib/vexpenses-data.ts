// Data layer unificado — centraliza todas as chamadas à API VExpenses com cache automático
// Sempre retorna dados (do cache se API falhar), com refresh em background

import { apiCache } from './neon-cache';
import { sql } from './neon';
import { vexpensesRateLimiter, rateLimitedFetch } from './vexpenses-rate-limiter';
import { getNextValidCookie, markTokenCooldownById, clearTokenCache } from './vexpenses-token-validator';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const APP_URL = 'https://app.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY;

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'Origin': 'https://app.vexpenses.com',
  'Referer': 'https://app.vexpenses.com',
};

// TTL constants
export const TTL = {
  REPORTS_ENVIADO: 15 * 60 * 1000,      // 15 min
  REPORTS_REPROVADO: 60 * 60 * 1000,    // 1 hour
  TEAM_MEMBERS: 24 * 60 * 60 * 1000,    // 24 hours
  APPROVAL_FLOWS: 24 * 60 * 60 * 1000,  // 24 hours
  APPROVAL_TRACKING: 10 * 60 * 1000,    // 10 min
  REPORT_EXPENSES: 5 * 60 * 1000,       // 5 min per report
};

// Cache keys
const CK = {
  REPORTS_ENVIADO: 'vexpenses-data:reports-enviado',
  REPORTS_REPROVADO: 'vexpenses-data:reports-reprovado',
  TEAM_MEMBERS: 'vexpenses-data:team-members',
  APPROVAL_FLOWS: 'vexpenses-data:approval-flows',
  APPROVAL_TRACKING: 'vexpenses-data:approval-tracking',
};

interface TimingResult<T> {
  data: T;
  fromCache: boolean;
  isStale: boolean;
  durationMs: number;
}

// Core fetch with rate limiting, auth, retry, and error handling
async function vexpensesApiFetch(
  path: string,
  options: RequestInit = {},
  priority = 0
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  const isV2 = path.includes('/v2/');
  const isV3 = path.includes('/v3/');

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...BROWSER_HEADERS,
    ...(options.headers as Record<string, string> || {}),
  };

  if (isV2) {
    if (API_KEY) headers['Authorization'] = API_KEY;
  } else if (isV3) {
    const cookie = await getNextValidCookie();
    if (cookie) {
      headers['Cookie'] = cookie;
      const xsrf = cookie.match(/XSRF-TOKEN=([^;]+)/);
      if (xsrf) headers['X-XSRF-TOKEN'] = decodeURIComponent(xsrf[1]);
    }
  } else {
    if (API_KEY) headers['Authorization'] = API_KEY;
    const cookie = await getNextValidCookie();
    if (cookie) {
      headers['Cookie'] = cookie;
      const xsrf = cookie.match(/XSRF-TOKEN=([^;]+)/);
      if (xsrf) headers['X-XSRF-TOKEN'] = decodeURIComponent(xsrf[1]);
    }
  }

  return vexpensesRateLimiter.enqueue(
    async () => {
      const response = await fetch(url, { ...options, headers, cache: 'no-store' });

      if (response.status === 429) {
        console.log(`[VExpensesData] 429 for ${path} — pausing rate limiter`);
        vexpensesRateLimiter.pause(60_000);
        if (headers['Cookie']) markTokenCooldownById(headers['Cookie']);
        throw new Error(`429 Rate Limited: ${path}`);
      }

      if (response.status === 401 || response.status === 403) {
        console.log(`[VExpensesData] ${response.status} for ${path}`);
        if (headers['Cookie']) markTokenCooldownById(headers['Cookie']);
        // Don't clear all tokens on v2 403 (WAF block, not auth issue)
        if (isV3 || (!isV2 && !isV3)) {
          clearTokenCache();
        }
        throw new Error(`${response.status} Forbidden: ${path}`);
      }

      return response;
    },
    priority
  );
}

// Generic cached fetch with stale-while-revalidate
async function cachedFetch<T>(
  cacheKey: string,
  ttl: number,
  fetcher: () => Promise<T>,
  dataType = 'reports'
): Promise<TimingResult<T>> {
  const start = Date.now();
  const stale = await apiCache.getWithStale<T>(cacheKey);

  if (stale.data) {
    const isStale = stale.isStale;
    console.log(`[VExpensesData] Cache ${isStale ? 'stale' : 'fresh'} hit: ${cacheKey}`);

    if (stale.shouldRefresh) {
      // Background refresh — don't block the response
      fetcher()
        .then(async (data) => {
          if (data && (!Array.isArray(data) || data.length > 0)) {
            await apiCache.set(cacheKey, data, ttl, dataType);
            console.log(`[VExpensesData] Background refresh saved: ${cacheKey}`);
          }
        })
        .catch(err => console.log(`[VExpensesData] Background refresh failed for ${cacheKey}:`, err));
    }

    return {
      data: stale.data,
      fromCache: true,
      isStale,
      durationMs: Date.now() - start,
    };
  }

  // No cache — fetch synchronously (with 30s timeout to avoid Next.js 60s kill)
  console.log(`[VExpensesData] Cache miss: ${cacheKey}, fetching...`);
  try {
    const fetchPromise = fetcher();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Fetch timeout for ${cacheKey}`)), 30000)
    );
    const data = await Promise.race([fetchPromise, timeoutPromise]);
    if (data && (!Array.isArray(data) || data.length > 0)) {
      await apiCache.set(cacheKey, data, ttl, dataType);
    }
    return {
      data,
      fromCache: false,
      isStale: false,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    // Last resort: try to get ANY cached data (even expired)
    try {
      const result = await sql`SELECT cache_data FROM api_cache WHERE cache_key = ${cacheKey} LIMIT 1`;
      if (result && result.length > 0) {
        const entry = result[0].cache_data;
        console.log(`[VExpensesData] Using last-known data for ${cacheKey} (API failed)`);
        return {
          data: entry.data,
          fromCache: true,
          isStale: true,
          durationMs: Date.now() - start,
        };
      }
    } catch {
      // ignore
    }
    // If no cached data at all, return empty default instead of throwing
    console.log(`[VExpensesData] No cache and API failed for ${cacheKey}, returning empty default`);
    const emptyDefault = (Array.isArray([]) ? [] : {}) as T;
    return {
      data: emptyDefault,
      fromCache: false,
      isStale: false,
      durationMs: Date.now() - start,
    };
  }
}

// === REPORTS ENVIADO (pending reports) ===
export async function getReportsEnviado(): Promise<TimingResult<any[]>> {
  return cachedFetch<any[]>(
    CK.REPORTS_ENVIADO,
    TTL.REPORTS_ENVIADO,
    async () => {
      const reports: any[] = [];
      const seenIds = new Set<number>();
      let page = 1;
      while (page <= 20) {
        const response = await vexpensesApiFetch(
          `/v2/reports/status/ENVIADO?include=user&per_page=100&page=${page}`,
          { signal: AbortSignal.timeout(120000) },
          10 // high priority
        );
        if (!response.ok) break;
        const data = await response.json();
        const batch = data.data || [];
        let newCount = 0;
        for (const r of batch) {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id);
            reports.push(r);
            newCount++;
          }
        }
        console.log(`[VExpensesData] Reports ENVIADO page ${page}: ${batch.length} fetched, ${newCount} new. Total: ${reports.length}`);
        if (batch.length < 100 || newCount === 0) break;
        page++;
      }
      return reports;
    },
    'reports'
  );
}

// === REPORTS REPROVADO (for stale check) ===
export async function getReportsReprovado(): Promise<TimingResult<number[]>> {
  return cachedFetch<number[]>(
    CK.REPORTS_REPROVADO,
    TTL.REPORTS_REPROVADO,
    async () => {
      const staleIds: number[] = [];
      const seenIds = new Set<number>();
      let page = 1;
      while (page <= 5) {
        const response = await vexpensesApiFetch(
          `/v2/reports/status/REPROVADO?per_page=100&page=${page}`,
          { signal: AbortSignal.timeout(30000) },
          5 // lower priority
        );
        if (!response.ok) break;
        const data = await response.json();
        const batch = data.data || [];
        let newCount = 0;
        for (const r of batch) {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id);
            staleIds.push(r.id);
            newCount++;
          }
        }
        if (newCount === 0 || batch.length === 0) break;
        page++;
      }
      return staleIds;
    },
    'reports'
  );
}

// === TEAM MEMBERS ===
export async function getTeamMembers(): Promise<TimingResult<{ memberIds: number[]; flowMap: [number, number][] }>> {
  return cachedFetch(
    CK.TEAM_MEMBERS,
    TTL.TEAM_MEMBERS,
    async () => {
      const memberIds: number[] = [];
      const flowMap: [number, number][] = [];
      const seenIds = new Set<number>();
      let page = 1;
      while (page <= 20) {
        const response = await vexpensesApiFetch(
          `/v2/team-members?per_page=100&page=${page}`,
          { signal: AbortSignal.timeout(30000) },
          5
        );
        if (!response.ok) break;
        const data = await response.json();
        const batch = data.data || [];
        let newCount = 0;
        for (const m of batch) {
          if (!seenIds.has(m.id)) {
            seenIds.add(m.id);
            memberIds.push(m.id);
            if (m.approval_flow_id) {
              flowMap.push([m.id, m.approval_flow_id]);
            }
            newCount++;
          }
        }
        console.log(`[VExpensesData] Team members page ${page}: ${batch.length} fetched, ${newCount} new. Total: ${memberIds.length}`);
        if (newCount === 0 || batch.length === 0) break;
        page++;
      }
      return { memberIds, flowMap };
    },
    'config'
  );
}

// === APPROVAL FLOWS ===
export async function getApprovalFlows(): Promise<TimingResult<{ namesMap: [number, string][]; stepApprovers: [number, [number, number[]][]][] }>> {
  return cachedFetch(
    CK.APPROVAL_FLOWS,
    TTL.APPROVAL_FLOWS,
    async () => {
      const response = await vexpensesApiFetch(
        `/v2/approval-flows?include=steps`,
        { signal: AbortSignal.timeout(30000) },
        5
      );
      if (!response.ok) return { namesMap: [], stepApprovers: [] };

      const data = await response.json();
      const flows = data.data || [];
      const namesMap: [number, string][] = [];
      const stepApprovers: [number, [number, number[]][]][] = [];

      for (const flow of flows) {
        namesMap.push([flow.id, flow.description || `Flow ${flow.id}`]);
        const steps = flow.steps?.data || flow.steps || [];
        const stepList: [number, number[]][] = [];
        for (const step of steps) {
          const stepOrder = step.order || 1;
          const approverSet: number[] = [];
          const groups = step.groups?.data || step.groups || [];
          for (const g of groups) {
            const approvers = g.approvers || [];
            for (const a of approvers) {
              approverSet.push(parseInt(a, 10));
            }
          }
          stepList.push([stepOrder, approverSet]);
        }
        stepApprovers.push([flow.id, stepList]);
      }
      return { namesMap, stepApprovers };
    },
    'config'
  );
}

// === APPROVAL TRACKING (Excel scraping from app.vexpenses.com) ===
export async function getApprovalTracking(): Promise<TimingResult<{
  waitingStepMap: [number, number][];
  rejectedIds: number[];
  approvedLastActionIds: number[];
}>> {
  return cachedFetch(
    CK.APPROVAL_TRACKING,
    TTL.APPROVAL_TRACKING,
    async () => {
      const cookie = await getNextValidCookie();
      if (!cookie) return { waitingStepMap: [], rejectedIds: [], approvedLastActionIds: [] };

      let sessionCookies = cookie;

      // Step 1: GET admin page to extract CSRF token
      const pageResp = await rateLimitedFetch(`${APP_URL}/admin/relatorio-acompanhamento-aprovacao`, {
        headers: {
          ...BROWSER_HEADERS,
          'Cookie': sessionCookies,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': 'https://app.vexpenses.com/admin/relatorio-acompanhamento-aprovacao',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(30000),
      }, 8);

      // Update cookies from response
      const setCookies = pageResp.headers.getSetCookie?.() || [];
      for (const sc of setCookies) {
        const match = sc.match(/^([^=]+)=([^;]+)/);
        if (match) {
          const [, name, value] = match;
          if (name === 'laravel_token') sessionCookies = sessionCookies.replace(/laravel_token=[^;]+/, `laravel_token=${value}`);
          if (name === 'laravel_session') {
            if (sessionCookies.includes('laravel_session=')) {
              sessionCookies = sessionCookies.replace(/laravel_session=[^;]+/, `laravel_session=${value}`);
            } else {
              sessionCookies += `; laravel_session=${value}`;
            }
          }
        }
      }

      if (pageResp.status >= 300 && pageResp.status < 400) {
        const location = pageResp.headers.get('location') || '';
        if (location.includes('/login')) {
          markTokenCooldownById(cookie);
          return { waitingStepMap: [], rejectedIds: [], approvedLastActionIds: [] };
        }
      }

      const html = await pageResp.text();

      // Extract CSRF token from HTML
      const csrfMatch = html.match(/name=["']_token["'].*?value=["']([^"']+)["']/);
      const csrfToken = csrfMatch ? csrfMatch[1] : null;

      if (!csrfToken) {
        console.log('[VExpensesData] Could not extract CSRF token from admin page');
        return { waitingStepMap: [], rejectedIds: [], approvedLastActionIds: [] };
      }

      // Step 2: POST to Excel endpoint with date range
      const now = new Date();
      const startDate = '01/01/2025';
      const endDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

      const formData = new URLSearchParams();
      formData.append('_token', csrfToken);
      formData.append('status[]', 'ENVIADO');
      formData.append('startDate', startDate);
      formData.append('endDate', endDate);

      const excelResp = await rateLimitedFetch(`${APP_URL}/admin/relatorio-acompanhamento-aprovacao/excel`, {
        method: 'POST',
        headers: {
          ...BROWSER_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': sessionCookies,
        },
        body: formData.toString(),
        redirect: 'manual',
        signal: AbortSignal.timeout(120000),
      }, 8);

      let excelBuffer: ArrayBuffer;
      if (excelResp.status >= 300 && excelResp.status < 400) {
        const location = excelResp.headers.get('location') || '';
        if (location.includes('/login')) {
          markTokenCooldownById(cookie);
          return { waitingStepMap: [], rejectedIds: [], approvedLastActionIds: [] };
        }
        const redirectUrl = location.startsWith('http') ? location : `${APP_URL}${location}`;
        const retryResp = await rateLimitedFetch(redirectUrl, {
          method: 'POST',
          headers: {
            ...BROWSER_HEADERS,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': sessionCookies,
          },
          body: formData.toString(),
          redirect: 'manual',
          signal: AbortSignal.timeout(120000),
        }, 8);
        if (!retryResp.ok) {
          console.log(`[VExpensesData] Excel endpoint (after redirect) returned ${retryResp.status}`);
          return { waitingStepMap: [], rejectedIds: [], approvedLastActionIds: [] };
        }
        excelBuffer = await retryResp.arrayBuffer();
      } else if (excelResp.ok) {
        excelBuffer = await excelResp.arrayBuffer();
      } else {
        console.log(`[VExpensesData] Excel endpoint returned ${excelResp.status}`);
        return { waitingStepMap: [], rejectedIds: [], approvedLastActionIds: [] };
      }

      // Step 3: Parse Excel
      const { parseApprovalTrackingExcelAsync } = await import('./excel-parser');
      const parsed = await parseApprovalTrackingExcelAsync(excelBuffer);

      console.log(`[VExpensesData] Approval-tracking parsed: ${parsed.waitingStepMap.length} steps, ${parsed.rejectedIds.length} rejected, ${parsed.approvedLastActionIds.length} approved-last-action`);
      return parsed;
    },
    'reports'
  );
}

// === REPORT EXPENSES (per report, cached individually) ===
export async function getReportExpenses(reportId: number): Promise<TimingResult<any[]>> {
  const cacheKey = `vexpenses-data:report-expenses:${reportId}`;
  return cachedFetch<any[]>(
    cacheKey,
    TTL.REPORT_EXPENSES,
    async () => {
      const response = await vexpensesApiFetch(
        `/v2/reports/${reportId}?include=expenses.expense_type,expenses.costs_center,expenses.payment_method,user`,
        { signal: AbortSignal.timeout(30000) },
        3
      );
      if (!response.ok) return [];
      const data = await response.json();
      const report = data.data;
      if (!report) return [];
      const expenses = report.expenses?.data || [];
      return expenses.map((e: any) => ({
        id: e.id,
        expense_id: e.expense_id,
        title: e.title,
        value: parseFloat(e.value) || 0,
        date: e.date,
        observation: e.observation,
        receipt_url: e.reicept_url || e.receipt_url || '',
        rejected: e.rejected,
        expense_type: e.expense_type?.data || null,
        costs_center: e.costs_center?.data || null,
        payment_method: e.payment_method?.data || null,
      }));
    },
    'reports'
  );
}

// === HEALTH CHECK ===
export async function getSystemHealth(): Promise<{
  rateLimiter: ReturnType<typeof vexpensesRateLimiter.getStats>;
  cache: { total: number; expired: number; byType: Record<string, number> };
  tokens: { total: number; active: number; inCooldown: number; invalid: number };
}> {
  const { getTokenStats } = await import('./vexpenses-token-validator');
  const tokenStats = await getTokenStats();
  const cacheStats = await apiCache.getStats();
  return {
    rateLimiter: vexpensesRateLimiter.getStats(),
    cache: cacheStats,
    tokens: {
      total: tokenStats.total,
      active: tokenStats.active,
      inCooldown: tokenStats.inCooldown,
      invalid: tokenStats.invalid,
    },
  };
}

// === INVALIDATE CACHE ===
export async function invalidateCache(key?: string): Promise<void> {
  if (key) {
    await apiCache.delete(key);
    console.log(`[VExpensesData] Cache invalidated: ${key}`);
  } else {
    // Invalidate all vexpenses-data keys
    for (const k of Object.values(CK)) {
      await apiCache.delete(k);
    }
    console.log('[VExpensesData] All caches invalidated');
  }
}
