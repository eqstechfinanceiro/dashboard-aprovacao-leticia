import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import { getApiHeadersWithCookie, getApiUrl } from '@/lib/vexpenses-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { report_id, approver_id, approver_name, observation, comment } = body;

    if (!report_id) {
      return NextResponse.json(
        { error: 'report_id is required' },
        { status: 400 }
      );
    }

    if (!approver_id) {
      return NextResponse.json(
        { error: 'approver_id is required' },
        { status: 400 }
      );
    }

    const apiComment = comment || (observation ? `Aprovado via dashboard por ${approver_name || 'approver'}. Observação: ${observation}` : `Aprovado via dashboard por ${approver_name || 'approver'}`);

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
      const expenses = expensesData.data?.expenses?.data || [];
      for (const exp of expenses) {
        expensesPayload[String(exp.id)] = true;
      }
    }

    const payload: any = {
      approver: approver_id,
      comment: apiComment,
      expenses: expensesPayload,
    };

    const response = await fetch(`${getApiUrl()}/v2/reports/${report_id}/approve`, {
      method: 'POST',
      headers: await getApiHeadersWithCookie({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
      cache: 'no-store',
    });

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
          VALUES (${report_id}, ${approver_name || 'unknown'}, ${approver_id}, ${observation || null})
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

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Approve API] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
