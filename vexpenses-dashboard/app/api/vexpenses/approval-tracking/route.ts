import { NextRequest, NextResponse } from 'next/server';
import { apiCache } from '@/lib/neon-cache';

export const dynamic = 'force-dynamic';

const APP_URL = 'https://app.vexpenses.com';
const LARAVEL_TOKEN = process.env.VEXPENSES_LARAVEL_TOKEN || '';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'Origin': 'https://app.vexpenses.com',
  'Referer': 'https://app.vexpenses.com/admin/relatorio-acompanhamento-aprovacao',
};

const LARAVEL_SESSION = process.env.VEXPENSES_LARAVEL_SESSION || '';
const BROWSER_COOKIES = `laravel_token=${LARAVEL_TOKEN}; laravel_session=${LARAVEL_SESSION}; language=pt-BR`;

interface ExcelRow {
  reportId: string;
  reportName: string;
  status: string;
  owner: string;
  flowName: string;
  action: string;
  actor: string;
  step: number | null;
  comment: string | null;
  interactionDate: string | null;
  costCenter: string | null;
  createdAt: string | null;
  approvalDate: string | null;
  paymentDate: string | null;
  currency: string | null;
  value: string | null;
}

interface ApprovalHistoryEntry {
  action: string;
  actor: string;
  step: number | null;
  interactionDate: string | null;
}

interface ReportWithTracking {
  reportId: number;
  reportName: string;
  status: string;
  owner: string;
  flowName: string;
  regional: string;
  costCenter: string | null;
  value: number | null;
  currency: string;
  createdAt: string | null;
  currentStep: number;
  waitingStep: number;
  lastAction: string;
  lastActor: string;
  lastInteractionDate: string | null;
  daysSinceLastInteraction: number;
  history: ApprovalHistoryEntry[];
}

function parseRegional(flowName: string): string {
  const match = flowName.match(/\b([A-Z]{2})\b$/);
  if (match) return match[1];
  return flowName.replace(/^REGIONAL\s*/i, '').trim() || 'Outros';
}

function parseDateBR(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, day, month, year, hour, min, sec] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
}

function parseValueBR(valueStr: string | null): number | null {
  if (!valueStr) return null;
  const cleaned = valueStr.replace(/\./g, '').replace(',', '.');
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

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

async function fetchApprovalTracking(): Promise<ReportWithTracking[]> {
  if (!LARAVEL_TOKEN) throw new Error('VEXPENSES_LARAVEL_TOKEN not configured');

  let csrfToken: string;
  let sessionCookies: string = BROWSER_COOKIES;

  // Step 1: GET admin page to extract CSRF token and session cookies
  const pageResp = await fetch(`${APP_URL}/admin/relatorio-acompanhamento-aprovacao`, {
    headers: {
      ...BROWSER_HEADERS,
      'Cookie': sessionCookies,
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
  });

  // Capture any cookies from the response (e.g. laravel_session, XSRF-TOKEN)
  sessionCookies = extractCookiesFromResponse(pageResp, sessionCookies);

  if (pageResp.status >= 300 && pageResp.status < 400) {
    const location = pageResp.headers.get('location');
    if (!location) {
      throw new Error(`Admin page returned redirect ${pageResp.status} without location`);
    }
    const redirectUrl = location.startsWith('http') ? location : `${APP_URL}${location}`;

    if (redirectUrl.includes('/login')) {
      throw new Error(
        'VEXPENSES_LARAVEL_TOKEN is expired or invalid. Admin page redirected to /login. ' +
        'Please capture a fresh laravel_token from the browser: ' +
        'F12 > Application > Cookies > app.vexpenses.com > laravel_token, ' +
        'then update the VEXPENSES_LARAVEL_TOKEN in vexpenses-dashboard/.env'
      );
    }

    const retryResp = await fetch(redirectUrl, {
      headers: {
        ...BROWSER_HEADERS,
        'Cookie': sessionCookies,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    });

    sessionCookies = extractCookiesFromResponse(retryResp, sessionCookies);

    if (!retryResp.ok && retryResp.status >= 300) {
      const isLoginRedirect = redirectUrl.includes('/login');
      throw new Error(
        isLoginRedirect
          ? `VEXPENSES_LARAVEL_TOKEN is expired or invalid. Admin page redirected to /login. Please capture a fresh laravel_token from the browser (F12 > Application > Cookies > app.vexpenses.com > laravel_token).`
          : `Redirect to ${redirectUrl} returned ${retryResp.status}`
      );
    }

    const html = await retryResp.text();
    const csrfMatch = html.match(/name=["']_token["'].*?value=["']([^"']+)["']/);
    if (!csrfMatch) {
      throw new Error('Could not extract CSRF token from admin page (after redirect)');
    }
    csrfToken = csrfMatch[1];
  } else if (pageResp.ok) {
    const html = await pageResp.text();
    const csrfMatch = html.match(/name=["']_token["'].*?value=["']([^"']+)["']/);
    if (!csrfMatch) {
      throw new Error('Could not extract CSRF token from admin page');
    }
    csrfToken = csrfMatch[1];
  } else {
    throw new Error(`Failed to load admin page: ${pageResp.status}`);
  }

    // Step 2: POST to Excel endpoint — send all cookies captured from GET
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
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': sessionCookies,
      },
      body: formData.toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(120000),
  });

  // Handle redirect for POST (Laravel may redirect after processing)
  if (excelResp.status >= 300 && excelResp.status < 400) {
    const location = excelResp.headers.get('location');
    if (location) {
      const redirectUrl = location.startsWith('http') ? location : `${APP_URL}${location}`;
      const redirectCookies = extractCookiesFromResponse(excelResp, sessionCookies);
      const retryExcelResp = await fetch(redirectUrl, {
        method: 'POST',
        headers: {
          ...BROWSER_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': redirectCookies,
        },
        body: formData.toString(),
        redirect: 'manual',
        signal: AbortSignal.timeout(120000),
      });

      if (!retryExcelResp.ok) {
        throw new Error(`Excel endpoint (after redirect) returned ${retryExcelResp.status}`);
      }

      const arrayBuffer = await retryExcelResp.arrayBuffer();
      return await parseExcelBuffer(arrayBuffer);
    }
    throw new Error(`Excel endpoint returned redirect ${excelResp.status} without location`);
  }

  if (!excelResp.ok) {
    const bodyText = await excelResp.text().catch(() => '');
    throw new Error(`Excel endpoint returned ${excelResp.status}: ${bodyText.substring(0, 200)}`);
  }

  const arrayBuffer = await excelResp.arrayBuffer();
  return await parseExcelBuffer(arrayBuffer);
}

async function parseExcelBuffer(arrayBuffer: ArrayBuffer): Promise<ReportWithTracking[]> {
  // Step 3: Parse .xls with SheetJS
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

  if (rows.length < 2) {
    return [];
  }

  // Step 4: Transform rows and group by reportId
  const reportsMap = new Map<string, ExcelRow[]>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;

    const excelRow: ExcelRow = {
      reportId: String(row[0] || ''),
      reportName: String(row[1] || ''),
      status: String(row[2] || ''),
      owner: String(row[3] || ''),
      flowName: String(row[4] || ''),
      action: String(row[5] || ''),
      actor: String(row[6] || ''),
      step: row[7] ? parseInt(String(row[7]), 10) : null,
      comment: row[8] ? String(row[8]) : null,
      interactionDate: row[9] ? String(row[9]) : null,
      costCenter: row[10] ? String(row[10]) : null,
      createdAt: row[11] ? String(row[11]) : null,
      approvalDate: row[12] ? String(row[12]) : null,
      paymentDate: row[13] ? String(row[13]) : null,
      currency: row[14] ? String(row[14]) : 'BRL',
      value: row[15] ? String(row[15]) : null,
    };

    if (!reportsMap.has(excelRow.reportId)) {
      reportsMap.set(excelRow.reportId, []);
    }
    reportsMap.get(excelRow.reportId)!.push(excelRow);
  }

  // Step 5: Build structured report objects
  const reports: ReportWithTracking[] = [];

  for (const [reportId, rows] of reportsMap) {
    const lastRow = rows[rows.length - 1];
    const firstRow = rows[0];

    // Determine current waiting step
    let waitingStep = 1;
    if (lastRow.action === 'Aprovado' && lastRow.step !== null) {
      waitingStep = lastRow.step + 1;
    } else if (lastRow.action === 'Enviado') {
      waitingStep = 1;
    } else if (lastRow.action === 'Reaberto') {
      waitingStep = 0; // needs to be resent
    }

    const lastDate = parseDateBR(lastRow.interactionDate);
    const now = new Date();
    const daysSinceLastInteraction = lastDate
      ? Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const history: ApprovalHistoryEntry[] = rows.map(r => ({
      action: r.action,
      actor: r.actor,
      step: r.step,
      interactionDate: r.interactionDate,
    }));

    reports.push({
      reportId: parseInt(reportId, 10),
      reportName: lastRow.reportName,
      status: lastRow.status,
      owner: lastRow.owner,
      flowName: lastRow.flowName,
      regional: parseRegional(lastRow.flowName),
      costCenter: lastRow.costCenter,
      value: parseValueBR(lastRow.value),
      currency: lastRow.currency || 'BRL',
      createdAt: firstRow.createdAt,
      currentStep: lastRow.step ?? 0,
      waitingStep,
      lastAction: lastRow.action,
      lastActor: lastRow.actor,
      lastInteractionDate: lastRow.interactionDate,
      daysSinceLastInteraction,
      history,
    });
  }

  return reports;
}

export async function GET(request: NextRequest) {
  try {
    const cacheKey = 'approval-tracking';

    const staleResult = await apiCache.getWithStale(cacheKey);

    if (staleResult.data) {
      console.log(`Cache ${staleResult.isStale ? 'stale' : 'fresh'} hit for ${cacheKey}`);

      if (staleResult.shouldRefresh) {
        refreshCacheInBackground(cacheKey);
      }

      return NextResponse.json(staleResult.data);
    }

    console.log(`Cache miss for ${cacheKey}`);

    const reports = await fetchApprovalTracking();

    const result = { data: reports, count: reports.length, cached_at: new Date().toISOString() };

    await apiCache.set(cacheKey, result, 5 * 60 * 1000);

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

    const reports = await fetchApprovalTracking();
    const result = { data: reports, count: reports.length, cached_at: new Date().toISOString() };

    await apiCache.set(cacheKey, result, 5 * 60 * 1000);

    console.log(`[Background Refresh] Successfully refreshed: ${cacheKey}`);
  } catch (error) {
    console.error(`[Background Refresh] Error refreshing ${cacheKey}:`, error);
  }
}
