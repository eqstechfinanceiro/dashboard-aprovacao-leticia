import { NextRequest, NextResponse } from 'next/server';
import { getApiHeadersWithCookie, getApiUrl } from '@/lib/api/vexpenses-client';
import { invalidateCache, resolveApproverForUser } from '@/lib/api/vexpenses-data';
import { AUTH_COOKIE, verifyToken } from '@/lib/auth/auth';
import { sql } from '@/lib/db/neon';
import { logAudit } from '@/lib/db/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { report_id, comment, expenses } = body;

    if (!report_id) {
      return NextResponse.json(
        { error: 'report_id is required' },
        { status: 400 }
      );
    }

    const token = request.cookies.get(AUTH_COOKIE)?.value;
    const session = token ? await verifyToken(token) : null;
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Resolve the report owner's id so we can check whether the logged-in
    // user is a valid approver for the report's current step.
    let reportUserId: number | null = null;
    if (sql) {
      try {
        const r = await sql`SELECT user_id FROM prestacao_reports WHERE id = ${report_id} LIMIT 1`;
        reportUserId = r[0]?.user_id ?? null;
      } catch { /* fall through — resolution falls back to default */ }
    }

    const resolved = await resolveApproverForUser(session?.email, report_id, reportUserId);
    const DEFAULT_APPROVER = 891904;

    const expensesPayload = (expenses && typeof expenses === 'object') ? expenses : {};
    const doReject = async (approverId: number) => fetch(`${getApiUrl()}/v2/reports/${report_id}/approve`, {
      method: 'POST',
      headers: await getApiHeadersWithCookie({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        approver: approverId,
        comment: comment || 'Reprovado pelo bot de auditoria - violação da política corporativa',
        expenses: expensesPayload,
      }),
      signal: AbortSignal.timeout(30000),
      cache: 'no-store',
    });

    let response = await doReject(resolved.id);
    if (!response.ok && resolved.own && resolved.id !== DEFAULT_APPROVER) {
      const text = await response.clone().text().catch(() => '');
      if (response.status === 422 && text.includes('not an approver in this step')) {
        response = await doReject(DEFAULT_APPROVER);
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Reject] API error ${response.status}:`, errorText);
      return NextResponse.json(
        { error: `API error ${response.status}: ${errorText.slice(0, 300)}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    try {
      await invalidateCache();
      await invalidateCache(`vexpenses-data:report-expenses:${report_id}`);
    } catch (cacheErr) {
      console.error('[Reject] Cache invalidation failed (non-fatal):', cacheErr);
    }

    await logAudit(request, {
      action: 'relatorio.reject',
      entity_type: 'report',
      entity_id: report_id,
      details: {
        comment: comment || 'Reprovado pelo bot de auditoria - violação da política corporativa',
        session_user: session.email,
      },
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Reject API] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
