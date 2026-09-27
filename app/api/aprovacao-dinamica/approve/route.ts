import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { getApiHeadersWithCookie, getApiUrl } from '@/lib/api/vexpenses-client';
import { invalidateCache, resolveApproverForUser } from '@/lib/api/vexpenses-data';
import { AUTH_COOKIE, verifyToken } from '@/lib/auth/auth';
import { logAudit } from '@/lib/db/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { report_id, approver_name, observation, comment } = body;

    if (!report_id) {
      return NextResponse.json(
        { error: 'report_id is required' },
        { status: 400 }
      );
    }

    // The logged-in dashboard user who clicked "aprovar"
    const token = request.cookies.get(AUTH_COOKIE)?.value;
    const session = token ? await verifyToken(token) : null;
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const sessionEmail = session.email || null;
    const sessionName = session.name || approver_name || 'approver';

    const apiComment = comment || (observation ? `Aprovado via dashboard por ${sessionName}. Observação: ${observation}` : `Aprovado via dashboard por ${sessionName}`);

    // Fetch report expenses from VExpenses API to include in approve payload
    const expensesResponse = await fetch(
      `${getApiUrl()}/v2/reports/${report_id}?include=expenses`,
      {
        headers: await getApiHeadersWithCookie(),
        signal: AbortSignal.timeout(30000),
        cache: 'no-store',
      }
    );

    let expensesPayload: Record<string, boolean> = {};
    let reportUserId: number | null = null;
    if (expensesResponse.ok) {
      const expensesData = await expensesResponse.json();
      const reportStatus = expensesData.data?.status;
      if (reportStatus && reportStatus !== 'ENVIADO') {
        const statusMsg = reportStatus === 'APROVADO'
          ? 'Este relatório já foi aprovado.'
          : reportStatus === 'REPROVADO'
            ? 'Este relatório foi reprovado.'
            : `Este relatório não está mais com status ENVIADO (atual: ${reportStatus}).`;
        return NextResponse.json(
          { error: statusMsg + ' Atualize a lista de pendências.' },
          { status: 409 }
        );
      }
      reportUserId = expensesData.data?.user_id ?? null;
      const expenses = expensesData.data?.expenses?.data || [];
      for (const exp of expenses) {
        expensesPayload[String(exp.id)] = true;
      }
    }

    // Resolve who the approval is recorded as in VExpenses: the logged-in
    // user's own approver id when they're a valid approver of the report's
    // current step, otherwise the default (Letícia 891904).
    const resolved = await resolveApproverForUser(sessionEmail, report_id, reportUserId);
    const DEFAULT_APPROVER = 891904;

    const doApprove = async (approverId: number) => fetch(`${getApiUrl()}/v2/reports/${report_id}/approve`, {
      method: 'POST',
      headers: await getApiHeadersWithCookie({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ approver: approverId, comment: apiComment, expenses: expensesPayload }),
      signal: AbortSignal.timeout(30000),
      cache: 'no-store',
    });

    const isNotApprover = (status: number, text: string) =>
      status === 422 && text.includes('not an approver in this step');

    let response = await doApprove(resolved.id);
    let usedApprover = resolved;

    // Tracking can be stale — if their own id was rejected as not-in-step,
    // retry once with the default approver before giving up.
    if (!response.ok && resolved.own && resolved.id !== DEFAULT_APPROVER) {
      const text = await response.clone().text().catch(() => '');
      if (isNotApprover(response.status, text)) {
        response = await doApprove(DEFAULT_APPROVER);
        usedApprover = { id: DEFAULT_APPROVER, name: 'Letícia Angenita', own: false };
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Approve] API error ${response.status}:`, errorText);

      // Parse VExpenses error to provide structured feedback
      let errorType = 'api_error';
      let userMessage = `API error ${response.status}: ${errorText.slice(0, 500)}`;
      try {
        const parsed = JSON.parse(errorText);
        const approverError = parsed.data?.errors?.approver;
        if (approverError && approverError.some((e: string) => e.includes('not an approver in this step'))) {
          errorType = 'not_approver_in_step';
          userMessage = 'Este relatório não está mais na etapa de aprovação esperada. A lista será atualizada automaticamente.';
        }
      } catch { /* keep default error */ }

      if (errorType === 'api_error' && errorText.includes('not an approver in this step')) {
        errorType = 'not_approver_in_step';
        userMessage = 'Este relatório não está mais na etapa de aprovação esperada. A lista será atualizada automaticamente.';
      }

      return NextResponse.json(
        { error: userMessage, error_type: errorType },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (sql) {
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS report_approvals (
            report_id INT PRIMARY KEY,
            approver_name TEXT,
            approver_user_id INT,
            observation TEXT,
            approved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `;
        await sql`
          INSERT INTO report_approvals (report_id, approver_name, approver_user_id, observation)
          VALUES (${report_id}, ${usedApprover.name}, ${usedApprover.id}, ${(observation ? observation + ' · ' : '') + 'clique: ' + sessionName})
          ON CONFLICT (report_id) DO UPDATE SET
            approver_name = EXCLUDED.approver_name,
            approver_user_id = EXCLUDED.approver_user_id,
            observation = EXCLUDED.observation,
            approved_at = NOW()
        `;
      } catch (dbErr) {
        console.error('[Approve] DB error (non-fatal):', dbErr);
      }
    }

    // Invalidate pending-list caches so the approval reflects for all users immediately
    try {
      await invalidateCache();
      await invalidateCache(`vexpenses-data:report-expenses:${report_id}`);
    } catch (cacheErr) {
      console.error('[Approve] Cache invalidation failed (non-fatal):', cacheErr);
    }

    await logAudit(request, {
      action: 'relatorio.approve',
      entity_type: 'report',
      entity_id: report_id,
      details: {
        approved_as: { id: usedApprover.id, name: usedApprover.name, own: usedApprover.own },
        session_user: sessionName,
        observation: observation || null,
      },
    });

    return NextResponse.json({
      success: true,
      data,
      approved_as: { id: usedApprover.id, name: usedApprover.name, own: usedApprover.own },
    });
  } catch (error) {
    console.error('[Approve API] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
