import { NextRequest, NextResponse } from 'next/server';
import { ensureAuditTable, getAuditedReportIds } from '@/lib/audit-db';
import { getLaravelCookieString } from '@/lib/laravel-token';
import { getApiHeadersWithCookie, getApiUrl, vexpensesFetchWithRotation } from '@/lib/vexpenses-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const API_URL = getApiUrl();
const APP_URL = 'https://app.vexpenses.com';

const PENDING_STATUSES = ['ENVIADO'];

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'Origin': 'https://app.vexpenses.com',
  'Referer': 'https://app.vexpenses.com/admin/relatorio-acompanhamento-aprovacao',
};

function extractCookiesFromResponse(resp: Response, baseCookies: string): string {
  const setCookieHeaders = resp.headers.getSetCookie?.() || [];
  if (setCookieHeaders.length === 0) return baseCookies;
  const cookieMap = new Map<string, string>();
  for (const c of baseCookies.split(';')) {
    const trimmed = c.trim();
    if (trimmed) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) cookieMap.set(trimmed.substring(0, eqIdx), trimmed);
    }
  }
  for (const sc of setCookieHeaders) {
    const cookiePart = sc.split(';')[0].trim();
    if (cookiePart) {
      const eqIdx = cookiePart.indexOf('=');
      if (eqIdx > 0) cookieMap.set(cookiePart.substring(0, eqIdx), cookiePart);
    }
  }
  return Array.from(cookieMap.values()).join('; ');
}

async function fetchApprovalTrackingSteps(): Promise<{ steps: Map<number, number>; rejected: Set<number>; approvedLastAction: Set<number> }> {
  const baseCookies = await getLaravelCookieString();
  if (!baseCookies) {
    console.log('[Pending] No Laravel token available, skipping approval-tracking');
    return { steps: new Map(), rejected: new Set(), approvedLastAction: new Set() };
  }

  let sessionCookies = baseCookies;

  // Step 1: GET admin page to extract CSRF token
  const pageResp = await fetch(`${APP_URL}/admin/relatorio-acompanhamento-aprovacao`, {
    headers: { ...BROWSER_HEADERS, 'Cookie': sessionCookies },
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
  });
  sessionCookies = extractCookiesFromResponse(pageResp, sessionCookies);

  let html: string;
  if (pageResp.status >= 300 && pageResp.status < 400) {
    const location = pageResp.headers.get('location');
    if (!location) throw new Error('Admin page redirect without location');
    const redirectUrl = location.startsWith('http') ? location : `${APP_URL}${location}`;
    if (redirectUrl.includes('/login')) {
      console.log('[Pending] Laravel token expired (login redirect on admin page)');
      return { steps: new Map(), rejected: new Set(), approvedLastAction: new Set() };
    }
    const retryResp = await fetch(redirectUrl, {
      headers: { ...BROWSER_HEADERS, 'Cookie': sessionCookies },
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    });
    sessionCookies = extractCookiesFromResponse(retryResp, sessionCookies);
    html = await retryResp.text();
  } else if (pageResp.ok) {
    html = await pageResp.text();
  } else {
    console.log('[Pending] Admin page returned', pageResp.status);
    return { steps: new Map(), rejected: new Set(), approvedLastAction: new Set() };
  }

  const csrfMatch = html.match(/name=["']_token["'].*?value=["']([^"']+)["']/);
  if (!csrfMatch) {
    console.log('[Pending] Could not extract CSRF token');
    return { steps: new Map(), rejected: new Set(), approvedLastAction: new Set() };
  }
  const csrfToken = csrfMatch[1];

  // Step 2: POST to Excel endpoint
  const now = new Date();
  const startDate = '01/01/2025';
  const endDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  const formData = new URLSearchParams();
  formData.append('_token', csrfToken);
  formData.append('status[]', 'ENVIADO');
  formData.append('startDate', startDate);
  formData.append('endDate', endDate);

  const excelResp = await fetch(`${APP_URL}/admin/relatorio-acompanhamento-aprovacao/excel`, {
    method: 'POST',
    headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': sessionCookies },
    body: formData.toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(120000),
  });

  let arrayBuffer: ArrayBuffer;
  if (excelResp.status >= 300 && excelResp.status < 400) {
    const location = excelResp.headers.get('location');
    if (!location) throw new Error('Excel redirect without location');
    const redirectUrl = location.startsWith('http') ? location : `${APP_URL}${location}`;
    const redirectCookies = extractCookiesFromResponse(excelResp, sessionCookies);
    const retryResp = await fetch(redirectUrl, {
      method: 'POST',
      headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': redirectCookies },
      body: formData.toString(),
      redirect: 'manual',
      signal: AbortSignal.timeout(120000),
    });
    if (!retryResp.ok) {
      console.log('[Pending] Excel endpoint (after redirect) returned', retryResp.status);
      return { steps: new Map(), rejected: new Set(), approvedLastAction: new Set() };
    }
    arrayBuffer = await retryResp.arrayBuffer();
  } else if (excelResp.ok) {
    arrayBuffer = await excelResp.arrayBuffer();
  } else {
    console.log('[Pending] Excel endpoint returned', excelResp.status);
    return { steps: new Map(), rejected: new Set(), approvedLastAction: new Set() };
  }

  // Step 3: Parse Excel with SheetJS
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

  if (rows.length < 2) return { steps: new Map(), rejected: new Set(), approvedLastAction: new Set() };

  // Step 4: Group by reportId, find last action, determine waitingStep
  const reportsMap = new Map<string, any[]>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;
    const reportId = String(row[0]);
    if (!reportsMap.has(reportId)) reportsMap.set(reportId, []);
    reportsMap.get(reportId)!.push(row);
  }

  const waitingStepMap = new Map<number, number>();
  for (const [reportId, reportRows] of reportsMap) {
    const lastRow = reportRows[reportRows.length - 1];
    const action = String(lastRow[5] || '');
    const step = lastRow[7] ? parseInt(String(lastRow[7]), 10) : null;

    let waitingStep = 1;
    if (action === 'Aprovado' && step !== null) {
      waitingStep = step + 1;
    } else if (action === 'Enviado') {
      waitingStep = 1;
    } else if (action === 'Reaberto') {
      waitingStep = 0;
    }

    waitingStepMap.set(parseInt(reportId, 10), waitingStep);
  }

  const rejectedIds = new Set<number>();
  const approvedLastAction = new Set<number>();
  for (const [reportId, reportRows] of reportsMap) {
    const lastRow = reportRows[reportRows.length - 1];
    const action = String(lastRow[5] || '');
    if (action === 'Reprovado' || action === 'Reprovado pelo administrador') {
      rejectedIds.add(parseInt(reportId, 10));
    } else if (action === 'Aprovado') {
      approvedLastAction.add(parseInt(reportId, 10));
    }
  }

  console.log(`[Pending] Approval-tracking: ${waitingStepMap.size} reports parsed, ${rejectedIds.size} rejected, ${approvedLastAction.size} approved-last-action`);
  return { steps: waitingStepMap, rejected: rejectedIds, approvedLastAction };
}

export async function GET(request: NextRequest) {
  try {
    await ensureAuditTable();

    const { searchParams } = new URL(request.url);
    const includeAudit = searchParams.get('include_audit') === 'true';
    const approverId = searchParams.get('approver_id');
    const stepFilter = searchParams.get('step'); // '1' = only step 1 (awaiting first approval)

    // Fetch approval-tracking data (from admin Excel) for real waitingStep per report
    const trackingData = await fetchApprovalTrackingSteps();
    const waitingStepMap = trackingData.steps;
    const rejectedIds = trackingData.rejected;
    const approvedLastActionIds = trackingData.approvedLastAction;

    let allReports: any[] = [];
    const seenReportIds = new Set<number>();

    for (const status of PENDING_STATUSES) {
      try {
        let page = 1;
        while (page <= 20) {
          const response = await vexpensesFetchWithRotation(
            `/v2/reports/status/${status}?include=user,expenses&per_page=100&page=${page}`,
            { signal: AbortSignal.timeout(120000) },
            3
          );

          if (response.ok) {
            const data = await response.json();
            const reports = data.data || [];
            let newCount = 0;
            for (const r of reports) {
              if (!seenReportIds.has(r.id)) {
                seenReportIds.add(r.id);
                allReports.push(r);
                newCount++;
              }
            }
            console.log(`[Pending] Fetched ${reports.length} reports for status ${status} (page ${page}), ${newCount} new unique`);
            // If no new unique reports, we've exhausted the data (v2 API ignores pagination)
            if (newCount === 0 || reports.length === 0) break;
            page++;
          } else {
            console.log(`[Pending] Status ${response.status} for reports/status/${status}`);
            break;
          }
        }
      } catch (err) {
        console.log(`[Pending] Error fetching status ${status}:`, err);
      }
    }
    console.log(`[Pending] Total unique reports: ${allReports.length}`);

    // Fetch REPROVADO reports to identify stale ENVIADO entries
    // (v2 /status/ENVIADO sometimes includes reports that are already rejected)
    // APROVADO is skipped — 6974+ reports is too expensive to fetch,
    // and the approve route already checks individual report status before approving.
    const staleFromOtherStatuses = new Set<number>();
    try {
      let page = 1;
      const staleSeenIds = new Set<number>();
      while (page <= 5) {
        const response = await vexpensesFetchWithRotation(
          `/v2/reports/status/REPROVADO?per_page=100&page=${page}`,
          { signal: AbortSignal.timeout(30000) },
          3
        );
        if (response.ok) {
          const data = await response.json();
          const reports = data.data || [];
          let newCount = 0;
          for (const r of reports) {
            if (!staleSeenIds.has(r.id)) {
              staleSeenIds.add(r.id);
              staleFromOtherStatuses.add(r.id);
              newCount++;
            }
          }
          console.log(`[Pending] Fetched ${reports.length} REPROVADO reports (page ${page}), ${newCount} new unique`);
          if (newCount === 0 || reports.length === 0) break;
          page++;
        } else {
          break;
        }
      }
    } catch (err) {
      console.log('[Pending] Error fetching REPROVADO for stale check:', err);
    }

    // Build user_id → approval_flow_id mapping from team-members (paginated)
    const userFlowMap = new Map<number, number>();
    const flowNamesMap = new Map<number, string>();
    const eqsMemberIds = new Set<number>();
    try {
      let page = 1;
      const tmSeenIds = new Set<number>();
      while (page <= 20) {
        const tmResp = await vexpensesFetchWithRotation(
          `/v2/team-members?per_page=100&page=${page}`,
          { signal: AbortSignal.timeout(30000) },
          3
        );
        if (tmResp.ok) {
          const tmData = await tmResp.json();
          const members = tmData.data || [];
          let newCount = 0;
          for (const m of members) {
            if (!tmSeenIds.has(m.id)) {
              tmSeenIds.add(m.id);
              eqsMemberIds.add(m.id);
              if (m.approval_flow_id) {
                userFlowMap.set(m.id, m.approval_flow_id);
              }
              newCount++;
            }
          }
          console.log(`[Pending] Fetched ${members.length} team-members (page ${page}), ${newCount} new unique`);
          if (newCount === 0 || members.length === 0) break;
          page++;
        } else {
          break;
        }
      }
    } catch (err) {
      console.log('[Pending] Error fetching team-members:', err);
    }

    // Filter reports to only include EQS team members
    if (eqsMemberIds.size > 0) {
      const beforeCount = allReports.length;
      allReports = allReports.filter((r: any) => eqsMemberIds.has(r.user_id));
      console.log(`[Pending] Filtered to EQS members: ${beforeCount} -> ${allReports.length} reports (${eqsMemberIds.size} EQS members)`);
    }

    // If approver_id is provided, find which flows/steps that user is an approver in
    // Map: flow_id -> Map<step_order, Set<approver_id>>
    const flowStepApprovers = new Map<number, Map<number, Set<number>>>();
    let hasApproverFilter = false;
    if (approverId) {
      hasApproverFilter = true;
    }
    try {
      const flowsResp = await vexpensesFetchWithRotation(
        `/v2/approval-flows?include=steps`,
        { signal: AbortSignal.timeout(30000) },
        3
      );
      if (flowsResp.ok) {
        const flowsData = await flowsResp.json();
        const flows = flowsData.data || [];

        for (const flow of flows) {
          flowNamesMap.set(flow.id, flow.description || `Flow ${flow.id}`);
          const steps = flow.steps?.data || flow.steps || [];
          const stepMap = new Map<number, Set<number>>();
          for (const step of steps) {
            const stepOrder = step.order || 1;
            const approverSet = new Set<number>();
            const groups = step.groups?.data || step.groups || [];
            for (const g of groups) {
              const approvers = g.approvers || [];
              for (const a of approvers) {
                approverSet.add(parseInt(a, 10));
              }
            }
            stepMap.set(stepOrder, approverSet);
          }
          flowStepApprovers.set(flow.id, stepMap);
        }
      }
    } catch (err) {
      console.log('[Pending] Error fetching approval flows:', err);
    }

    let auditedIds: Set<number> = new Set();
    if (includeAudit) {
      auditedIds = await getAuditedReportIds();
    }

    // Filter out stale reports:
    // 1. Reports that appear in APROVADO/REPROVADO v2 lists (v2 ENVIADO list is stale)
    // 2. Reports that the admin Excel shows as rejected (also stale in v2)
    // Reports with Excel "Aprovado" at step N are NOT filtered — they're partially approved,
    // still pending at step N+1, and the v2 API correctly keeps them as ENVIADO.
    const v2IdSet = new Set(allReports.map((r: any) => r.id));
    const staleIds = new Set<number>(rejectedIds);
    for (const id of staleFromOtherStatuses) {
      if (v2IdSet.has(id)) {
        staleIds.add(id);
      }
    }
    if (staleIds.size > 0) {
      const beforeCount = allReports.length;
      allReports = allReports.filter((r: any) => !staleIds.has(r.id));
      console.log(`[Pending] Filtered ${beforeCount - allReports.length} stale reports (v2-status=${staleFromOtherStatuses.size}, excel-rejected=${rejectedIds.size})`);
    }

    // Filter out fully-approved reports that v2 still shows as ENVIADO (stale).
    // A report is fully approved if:
    // - Its last action in the admin Excel is "Aprovado" (approvedLastActionIds)
    // - AND its waitingStep exceeds the max step of its approval flow (all steps done)
    // This avoids fetching the 6974+ APROVADO reports from v2 — we use the Excel data we already have.
    {
      const fullyApprovedIds = new Set<number>();
      for (const r of allReports) {
        if (!approvedLastActionIds.has(r.id)) continue;
        const userId = r.user_id;
        const flowId = userId ? userFlowMap.get(userId) : undefined;
        if (!flowId) continue;
        const stepMap = flowStepApprovers.get(flowId);
        if (!stepMap || stepMap.size === 0) continue;
        const maxStep = Math.max(...stepMap.keys());
        const waitingStep = waitingStepMap.has(r.id) ? waitingStepMap.get(r.id)! : 1;
        if (waitingStep > maxStep) {
          fullyApprovedIds.add(r.id);
        }
      }
      if (fullyApprovedIds.size > 0) {
        const beforeCount = allReports.length;
        allReports = allReports.filter((r: any) => !fullyApprovedIds.has(r.id));
        console.log(`[Pending] Filtered ${beforeCount - allReports.length} fully-approved reports (v2 stale ENVIADO, Excel confirmed Aprovado)`);
      }
    }

    // NOTE: Individual status verification (265 API calls) was here and caused >60s load times.
    // Removed — we rely on the REPROVADO bulk filter + approval-tracking data to catch stale reports.
    // The approve route also checks individual status before approving, so this is safe to skip.

    // Build result with approval flow info
    let result = allReports.map((r: any) => {
      const userId = r.user_id;
      const flowId = userId ? userFlowMap.get(userId) : undefined;
      const waitingStep = waitingStepMap.has(r.id) ? waitingStepMap.get(r.id)! : 1;
      const expenseCount = r.expenses?.data?.length ?? r.expenses?.length ?? 0;
      return {
        id: r.id,
        description: r.description,
        status: r.status,
        user: r.user?.data || null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        audited: auditedIds.has(r.id),
        approval_flow_id: flowId || null,
        approval_flow_name: flowId ? (flowNamesMap.get(flowId) || `Flow ${flowId}`) : null,
        approval_stage_id: r.approval_stage_id || null,
        approval_date: r.approval_date || null,
        current_step: waitingStep,
        expense_count: expenseCount,
      };
    });

    // Filter by approver: only show reports where the approver is in the CURRENT waiting step
    if (hasApproverFilter && approverId) {
      const approverIdNum = parseInt(approverId, 10);
      result = result.filter(r => {
        if (!r.approval_flow_id) return false;
        const stepMap = flowStepApprovers.get(r.approval_flow_id);
        if (!stepMap) return false;
        const approverSet = stepMap.get(r.current_step);
        if (!approverSet) return false;
        return approverSet.has(approverIdNum);
      });
    }

    // Filter by step if requested
    if (stepFilter === '1') {
      result = result.filter(r => r.current_step === 1);
    }

    return NextResponse.json({
      success: true,
      data: result,
      total: result.length,
    });
  } catch (error) {
    console.error('[Aprovacao Dinamica] Error fetching pending:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
