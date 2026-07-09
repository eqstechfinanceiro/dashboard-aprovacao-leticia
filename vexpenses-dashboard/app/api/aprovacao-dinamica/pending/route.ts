import { NextRequest, NextResponse } from 'next/server';
import { ensureAuditTable, getAuditedReportIds } from '@/lib/audit-db';
import { getLaravelCookieString } from '@/lib/laravel-token';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';
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

async function fetchApprovalTrackingSteps(): Promise<Map<number, number>> {
  const baseCookies = await getLaravelCookieString();
  if (!baseCookies) {
    console.log('[Pending] No Laravel token available, skipping approval-tracking');
    return new Map();
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
      return new Map();
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
    return new Map();
  }

  const csrfMatch = html.match(/name=["']_token["'].*?value=["']([^"']+)["']/);
  if (!csrfMatch) {
    console.log('[Pending] Could not extract CSRF token');
    return new Map();
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
      return new Map();
    }
    arrayBuffer = await retryResp.arrayBuffer();
  } else if (excelResp.ok) {
    arrayBuffer = await excelResp.arrayBuffer();
  } else {
    console.log('[Pending] Excel endpoint returned', excelResp.status);
    return new Map();
  }

  // Step 3: Parse Excel with SheetJS
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

  if (rows.length < 2) return new Map();

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

  console.log(`[Pending] Approval-tracking: ${waitingStepMap.size} reports parsed`);
  return waitingStepMap;
}

export async function GET(request: NextRequest) {
  try {
    await ensureAuditTable();

    const { searchParams } = new URL(request.url);
    const includeAudit = searchParams.get('include_audit') === 'true';
    const approverId = searchParams.get('approver_id');
    const stepFilter = searchParams.get('step'); // '1' = only step 1 (awaiting first approval)

    // Fetch approval-tracking data (from admin Excel) for real waitingStep per report
    const waitingStepMap = await fetchApprovalTrackingSteps();

    const allReports: any[] = [];

    for (const status of PENDING_STATUSES) {
      try {
        const response = await fetch(`${API_URL}/v2/reports/status/${status}?include=user`, {
          headers: {
            'Authorization': API_KEY,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(120000),
        });

        if (response.ok) {
          const data = await response.json();
          const reports = data.data || [];
          allReports.push(...reports);
        } else {
          console.log(`[Pending] Status ${response.status} for reports/status/${status}`);
        }
      } catch (err) {
        console.log(`[Pending] Error fetching status ${status}:`, err);
      }
    }

    // Build user_id → approval_flow_id mapping from team-members
    const userFlowMap = new Map<number, number>();
    const flowNamesMap = new Map<number, string>();
    try {
      const tmResp = await fetch(`${API_URL}/v2/team-members?per_page=500`, {
        headers: { 'Authorization': API_KEY, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      if (tmResp.ok) {
        const tmData = await tmResp.json();
        const members = tmData.data || [];
        for (const m of members) {
          if (m.approval_flow_id) {
            userFlowMap.set(m.id, m.approval_flow_id);
          }
        }
      }
    } catch (err) {
      console.log('[Pending] Error fetching team-members:', err);
    }

    // If approver_id is provided, find which flows/steps that user is an approver in
    // Map: flow_id -> Map<step_order, Set<approver_id>>
    const flowStepApprovers = new Map<number, Map<number, Set<number>>>();
    let hasApproverFilter = false;
    if (approverId) {
      hasApproverFilter = true;
    }
    try {
      const flowsResp = await fetch(`${API_URL}/v2/approval-flows?include=steps`, {
        headers: { 'Authorization': API_KEY, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      if (flowsResp.ok) {
        const flowsData = await flowsResp.json();
        const flows = flowsData.data || [];
        const approverIdNum = approverId ? parseInt(approverId, 10) : null;

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
        if (approverIdNum) {
          const flowsWhereApprover = Array.from(flowStepApprovers.entries())
            .filter(([, stepMap]) => {
              for (const approverSet of stepMap.values()) {
                if (approverSet.has(approverIdNum)) return true;
              }
              return false;
            })
            .map(([fid]) => fid);
          console.log(`[Pending] Approver ${approverId} is approver in flows:`, flowsWhereApprover);
        }
      }
    } catch (err) {
      console.log('[Pending] Error fetching approval flows:', err);
    }

    let auditedIds: Set<number> = new Set();
    if (includeAudit) {
      auditedIds = await getAuditedReportIds();
    }

    // Build result with approval flow info
    let result = allReports.map((r: any) => {
      const userId = r.user_id;
      const flowId = userId ? userFlowMap.get(userId) : undefined;
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
        current_step: waitingStepMap.get(r.id) || 1,
      };
    });

    // Filter by approver: only show reports where the approver is in the CURRENT waiting step
    if (hasApproverFilter && approverId) {
      const approverIdNum = parseInt(approverId, 10);
      const beforeCount = result.length;
      result = result.filter(r => {
        if (!r.approval_flow_id) return false;
        const stepMap = flowStepApprovers.get(r.approval_flow_id);
        if (!stepMap) return false;
        const approverSet = stepMap.get(r.current_step);
        if (!approverSet) return false;
        return approverSet.has(approverIdNum);
      });
      console.log(`[Pending] Approver filter: ${beforeCount} -> ${result.length} (approverId=${approverIdNum})`);
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
