// Data layer unificado — centraliza todas as chamadas à API VExpenses com cache automático
// Sempre retorna dados (do cache se API falhar), com refresh em background

import { apiCache } from '../db/neon-cache';
import { sql } from '../db/neon';
import { vexpensesRateLimiter } from './vexpenses-rate-limiter';
import { getNextValidCookie, markTokenCooldownById, clearTokenCache } from './vexpenses-token-validator';
import { getExcelWaitingStepMap } from './approval-excel';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
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
  REPORTS_REPROVADO: 15 * 60 * 1000,    // 15 min — match ENVIADO so resubmitted reports reappear promptly
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
export interface TeamMemberInfo { id: number; name: string; email: string }

export async function getTeamMembers(): Promise<TimingResult<{ memberIds: number[]; flowMap: [number, number][]; members: TeamMemberInfo[] }>> {
  return cachedFetch(
    CK.TEAM_MEMBERS,
    TTL.TEAM_MEMBERS,
    async () => {
      const memberIds: number[] = [];
      const flowMap: [number, number][] = [];
      const members: TeamMemberInfo[] = [];
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
            members.push({ id: m.id, name: m.name || '', email: (m.email || '').toLowerCase() });
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
      return { memberIds, flowMap, members };
    },
    'config'
  );
}

/**
 * Resolve which VExpenses approver id a manual dashboard approval should use.
 * If the logged-in dashboard user (by email) is an approver of the report's
 * CURRENT approval step, the approval goes out under their own VExpenses
 * identity. Otherwise it falls back to the default approver (Letícia 891904).
 */
export async function resolveApproverForUser(
  email: string | null | undefined,
  reportId: number,
  reportUserId: number | null,
  defaultApproverId = 891904
): Promise<{ id: number; name: string; own: boolean }> {
  const fallback = { id: defaultApproverId, name: 'Letícia Angenita', own: false };
  if (!email || !reportUserId) return fallback;
  try {
    const [team, flows, tracking] = await Promise.all([
      getTeamMembers(),
      getApprovalFlows(),
      getApprovalTracking(),
    ]);
    const members: TeamMemberInfo[] = team.data.members || [];
    const me = members.find(m => m.email === email.toLowerCase());
    if (!me) return fallback;

    const userFlowMap = new Map(team.data.flowMap);
    const flowId = userFlowMap.get(reportUserId);
    if (!flowId) return fallback;

    const stepMap = new Map((flows.data.stepApprovers.find(([id]) => id === flowId)?.[1] || []));
    const waiting = new Map(tracking.data.waitingStepMap);
    const currentStep = waiting.get(reportId);
    if (!currentStep) return fallback; // step unknown — don't attribute to a step-1 approver
    const stepApproverIds = stepMap.get(currentStep) || [];

    if (stepApproverIds.includes(me.id)) {
      return { id: me.id, name: me.name, own: true };
    }
    return fallback;
  } catch (e) {
    console.error('[ResolveApprover] failed:', e);
    return fallback;
  }
}

// === APPROVAL FLOWS ===
export async function getApprovalFlows(): Promise<TimingResult<{
  namesMap: [number, string][];
  stepApprovers: [number, [number, number[]][]][];
  // entrance_value per step order — steps with an entrance threshold only apply
  // to reports whose total value reaches it
  stepEntrances: [number, [number, number | null][]][];
}>> {
  return cachedFetch(
    CK.APPROVAL_FLOWS,
    TTL.APPROVAL_FLOWS,
    async () => {
      const response = await vexpensesApiFetch(
        `/v2/approval-flows?include=steps`,
        { signal: AbortSignal.timeout(30000) },
        5
      );
      if (!response.ok) return { namesMap: [], stepApprovers: [], stepEntrances: [] };

      const data = await response.json();
      const flows = data.data || [];
      const namesMap: [number, string][] = [];
      const stepApprovers: [number, [number, number[]][]][] = [];
      const stepEntrances: [number, [number, number | null][]][] = [];

      for (const flow of flows) {
        namesMap.push([flow.id, flow.description || `Flow ${flow.id}`]);
        const steps = flow.steps?.data || flow.steps || [];
        const stepList: [number, number[]][] = [];
        const entranceList: [number, number | null][] = [];
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
          entranceList.push([stepOrder, step.entrance_value != null ? Number(step.entrance_value) : null]);
        }
        stepApprovers.push([flow.id, stepList]);
        stepEntrances.push([flow.id, entranceList]);
      }
      return { namesMap, stepApprovers, stepEntrances };
    },
    'config'
  );
}

// === APPROVAL TRACKING (live step derivation) ===
// The v2 report history feed only emits `approved` for the FINAL approval —
// intermediate step approvals emit no event at all (they only bump updated_at
// and replace approval_stage_id). So the current step is derived from two
// signals, whichever is stronger:
//   1. Stage transitions: each new approval_stage_id instance since the last
//      `sent` event = +1 step (persisted per report, incremental).
//   2. The admin approval-tracking Excel (lib/api/approval-excel.ts) — gives
//      the absolute step, fixing reports already mid-flow before tracking
//      started. Optional overlay: missing Excel never hides or downgrades.
// Every history event bumps updated_at → per-report state is fingerprinted
// and only re-derived when updated_at changes.

interface ReportStepState {
  updatedAt: string;
  step: number;
  rejected: boolean;
  approvedLast: boolean;
  /** timestampEvento of the last `sent` — discriminates submission rounds. */
  sentKey?: string;
  /** Distinct approval_stage_id values observed since sentKey. */
  stageSeq?: number[];
}

const REPORT_STEP_CK_PREFIX = 'vexpenses-data:report-step:';
const REPORT_STEP_TTL = 24 * 60 * 60 * 1000; // 24h — updated_at fingerprint keeps it honest

interface ParsedHistory {
  sentKey: string | null;
  approvedCount: number;
  rejected: boolean;
  approvedLast: boolean;
}

function parseHistory(events: any[]): ParsedHistory {
  const sorted = [...events].sort((a, b) =>
    String(a?.timestampEvento || '').localeCompare(String(b?.timestampEvento || ''))
  );
  const last = sorted[sorted.length - 1]?.evento;
  if (last === 'disapproved' || last === 'disapproved_by_admin' || last === 'reprovado') {
    return { sentKey: null, approvedCount: 0, rejected: true, approvedLast: false };
  }
  if (last === 'reopen' || last === 'reaberto') {
    // Reopened for editing, not resubmitted — still ENVIADO in the list = stale.
    return { sentKey: null, approvedCount: 0, rejected: true, approvedLast: false };
  }
  let lastSentIdx = -1;
  sorted.forEach((e, i) => { if (e?.evento === 'sent') lastSentIdx = i; });
  let approvals = 0;
  sorted.forEach((e, i) => { if (i > lastSentIdx && e?.evento === 'approved') approvals++; });
  return {
    sentKey: lastSentIdx >= 0 ? String(sorted[lastSentIdx].timestampEvento || '') : null,
    approvedCount: approvals,
    rejected: false,
    approvedLast: last === 'approved',
  };
}

/**
 * Merge a fresh history+stage observation into the persisted state.
 * `applicableOrders` = the flow's step orders the report can actually traverse
 * (entrance_value-gated steps excluded by report value); position → order.
 */
function mergeStepState(
  prev: ReportStepState | undefined,
  parsed: ParsedHistory,
  curStageId: number | null,
  applicableOrders: number[],
  excelStep?: number | null
): Omit<ReportStepState, 'updatedAt'> {
  if (parsed.rejected) {
    return { step: 0, rejected: true, approvedLast: false, sentKey: parsed.sentKey ?? prev?.sentKey ?? undefined, stageSeq: prev?.stageSeq };
  }
  let stageSeq = prev?.stageSeq ? [...prev.stageSeq] : [];
  let position: number;
  if (!parsed.sentKey || prev?.sentKey !== parsed.sentKey) {
    // New submission round (or first observation): restart the stage sequence
    // at the current stage instance.
    stageSeq = curStageId != null ? [curStageId] : [];
    position = Math.max(1, 1 + parsed.approvedCount);
  } else {
    if (curStageId != null && !stageSeq.includes(curStageId)) stageSeq.push(curStageId);
    position = Math.max(stageSeq.length || 1, 1 + parsed.approvedCount);
  }
  // Excel knows the absolute step — pad the observed stage sequence with
  // sentinels so future transitions keep counting from the right position
  // even between Excel refreshes.
  if (excelStep != null && excelStep > position) {
    while (stageSeq.length < excelStep) stageSeq.unshift(-stageSeq.length - 1);
    position = excelStep;
  }
  const orders = applicableOrders.length ? applicableOrders : [1, 2, 3, 4, 5];
  const step = orders[Math.min(position, orders.length) - 1] ?? position;
  return { step, rejected: false, approvedLast: parsed.approvedLast, sentKey: parsed.sentKey ?? undefined, stageSeq };
}

export async function getApprovalTracking(reports?: any[]): Promise<TimingResult<{
  waitingStepMap: [number, number][];
  rejectedIds: number[];
  approvedLastActionIds: number[];
  unknownIds: number[];
}>> {
  return cachedFetch(
    CK.APPROVAL_TRACKING,
    TTL.APPROVAL_TRACKING,
    async () => {
      const reportList = reports ?? (await getReportsEnviado()).data ?? [];

      // An empty list means the reports fetch failed upstream — never let it
      // produce (and cache) a valid-looking empty tracking result.
      if (reportList.length === 0) {
        throw new Error('Approval tracking: report list unavailable (empty ENVIADO list)');
      }

      // Flow + member data for entrance_value-aware step ordering
      const [teamRes, flowsRes] = await Promise.all([getTeamMembers(), getApprovalFlows()]);
      const userFlowMap = new Map(teamRes.data.flowMap);
      const entranceMap = new Map((flowsRes.data.stepEntrances || []) as [number, [number, number | null][]][]);

      // Report values (entrance thresholds are value-based) — sum synced expenses
      const valueMap = new Map<number, number>();
      try {
        const ids = reportList.map((r: any) => r.id);
        if (ids.length > 0) {
          const rows = await sql`
            SELECT report_id, COALESCE(SUM(value), 0)::float AS v
            FROM prestacao_expenses WHERE report_id = ANY(${ids})
            GROUP BY report_id
          `;
          for (const row of rows as any[]) valueMap.set(row.report_id, row.v);
        }
      } catch (e) {
        console.log('[VExpensesData] expense value lookup failed:', e);
      }

      const applicableOrdersFor = (r: any): number[] => {
        const flowId = userFlowMap.get(r.user_id);
        const entrances = flowId ? entranceMap.get(flowId) : undefined;
        if (!entrances || entrances.length === 0) return [1, 2, 3, 4, 5];
        const v = valueMap.get(r.id) ?? 0;
        const orders = entrances
          .filter(([, e]) => e == null || v >= e)
          .map(([o]) => o)
          .sort((a, b) => a - b);
        return orders.length ? orders : entrances.map(([o]) => o).sort((a, b) => a - b);
      };

      // Absolute step overlay from the admin Excel — optional: when the Laravel
      // session is dead we still track transitions, we just can't seed
      // reports that were already mid-flow when tracking began.
      let excelStepMap: Map<number, number> | null = null;
      try {
        excelStepMap = await getExcelWaitingStepMap();
      } catch (e) {
        console.log('[VExpensesData] Excel step overlay unavailable:', (e as Error)?.message);
      }

      // Bulk-load previously derived states (fingerprinted by updated_at)
      const states = new Map<number, ReportStepState>();
      try {
        const rows = await sql`
          SELECT cache_key, cache_data FROM api_cache
          WHERE cache_key LIKE ${REPORT_STEP_CK_PREFIX + '%'}
        `;
        for (const row of rows as any[]) {
          const id = parseInt(String(row.cache_key).slice(REPORT_STEP_CK_PREFIX.length), 10);
          const state = (row.cache_data?.data ?? row.cache_data) as ReportStepState;
          if (state && typeof state.step === 'number') states.set(id, state);
        }
      } catch (e) {
        console.log('[VExpensesData] report-step cache read failed:', e);
      }

      const toFetch = reportList.filter(r => states.get(r.id)?.updatedAt !== (r.updated_at || ''));

      // Fetch histories for new/changed reports via the shared rate limiter.
      // Each derived state is persisted immediately — progress survives timeouts.
      let fetched = 0, failed = 0;
      await Promise.all(toFetch.map(r =>
        // Long timeout: requests queue behind the shared 5 req/s rate limiter —
        // a cold backfill of ~150 reports needs >30s of queue time alone.
        vexpensesApiFetch(`/v2/reports/${r.id}?include=history`, { signal: AbortSignal.timeout(120000) }, 4)
          .then(async resp => {
            if (!resp.ok) { failed++; return; }
            const data = await resp.json();
            const history = data?.data?.history;
            const events = Array.isArray(history) ? history : (history?.data || []);
            const parsed = parseHistory(events);
            const merged = mergeStepState(
              states.get(r.id), parsed,
              data?.data?.approval_stage_id ?? null,
              applicableOrdersFor(r),
              excelStepMap?.get(r.id)
            );
            const state: ReportStepState = { updatedAt: r.updated_at || '', ...merged };
            states.set(r.id, state);
            fetched++;
            await apiCache.set(`${REPORT_STEP_CK_PREFIX}${r.id}`, state, REPORT_STEP_TTL, 'reports');
          })
          .catch(() => { failed++; })
      ));

      if (toFetch.length > 0 && fetched === 0 && states.size === 0) {
        throw new Error(`Approval tracking: all ${toFetch.length} history fetches failed`);
      }

      const waitingStepMap: [number, number][] = [];
      const rejectedIds: number[] = [];
      const approvedLastActionIds: number[] = [];
      const unknownIds: number[] = [];
      let staleStateReuse = 0;
      let excelApplied = 0;
      for (const r of reportList) {
        const s = states.get(r.id);
        if (!s) {
          // No derived state (first run or failed fetch) — the Excel overlay
          // still knows the report's absolute step; prefer it over "unknown".
          const ex = excelStepMap?.get(r.id);
          if (ex != null && ex > 0) { waitingStepMap.push([r.id, ex]); excelApplied++; }
          else if (ex === 0) { rejectedIds.push(r.id); }
          else unknownIds.push(r.id);
          continue;
        }
        const fingerprintMismatch = s.updatedAt !== (r.updated_at || '');
        if (s.rejected) {
          const ex = excelStepMap?.get(r.id);
          if (ex != null) {
            if (ex === 0) { rejectedIds.push(r.id); continue; }
            // Excel says it's back in the approval flow (e.g. reenviado) —
            // trust it over a cached rejection.
            waitingStepMap.push([r.id, ex]);
            excelApplied++;
            continue;
          }
          if (fingerprintMismatch) {
            // The report changed since this state was derived but the refetch
            // failed — it may have been reopened+resent. Never hide a report
            // on a stale rejection; surface it as unknown instead.
            unknownIds.push(r.id);
            staleStateReuse++;
            continue;
          }
          rejectedIds.push(r.id);
          continue;
        }
        let step = s.step;
        const ex = excelStepMap?.get(r.id);
        if (ex != null) {
          if (ex === 0) { rejectedIds.push(r.id); continue; }
          if (ex > step) { step = ex; }
          excelApplied++;
        }
        if (fingerprintMismatch) {
          // Fetch failed but an older derivation exists — probably still valid
          // (updated_at also bumps on non-step changes like expense edits).
          staleStateReuse++;
        }
        waitingStepMap.push([r.id, step]);
        if (s.approvedLast) approvedLastActionIds.push(r.id);
      }

      const trackingResult = { waitingStepMap, rejectedIds, approvedLastActionIds, unknownIds };
      console.log(
        `[VExpensesData] Approval-tracking derived: ${waitingStepMap.length} steps, ` +
        `${rejectedIds.length} rejected/reopened, ${approvedLastActionIds.length} approved-last, ` +
        `${unknownIds.length} unknown (${toFetch.length} fetched, ${failed} failed, ` +
        `${staleStateReuse} stale-reused, excel=${excelStepMap ? excelApplied + ' applied' : 'unavailable'})`
      );
      // Persist the aggregate inside the fetcher too — when the outer
      // cachedFetch 30s race times out its own apiCache.set never runs, but
      // per-report states are already saved so this keeps progress alive.
      try {
        await apiCache.set(CK.APPROVAL_TRACKING, trackingResult, TTL.APPROVAL_TRACKING, 'reports');
      } catch (e) {
        console.log('[VExpensesData] tracking aggregate persist failed:', e);
      }
      return trackingResult;
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
