import { NextRequest, NextResponse } from 'next/server';
import { sql, isDatabaseAvailable } from '@/lib/db/neon';
import { getPendingReports } from '@/lib/pipeline/pending-reports';
import { getFaturaValidationsByReports } from '@/lib/db/fatura-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const totalStart = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const approverId = searchParams.get('approver_id');
    const stepFilter = searchParams.get('step');

    // 1. Fetch pending reports (with filtering)
    const pendingResult = await getPendingReports({
      approverId,
      stepFilter,
      includeAudit: true,
    });

    const reportIds = pendingResult.reportIds;

    // 2. In parallel, fetch audit results, fatura validations, approvals and
    // live-verified bot step-skips (the tracking Excel can be stale — a report
    // the bot just skipped with 422 is definitely past step 1)
    const [auditResults, faturaValidations, approvals, botSkips] = await Promise.all([
      fetchAuditResultsForReports(reportIds),
      getFaturaValidationsByReports(reportIds),
      fetchApprovalsForReports(reportIds),
      fetchBotStepSkips(reportIds),
    ]);

    const totalDuration = Date.now() - totalStart;
    console.log(
      `[Init] Completed in ${totalDuration}ms — reports: ${pendingResult.reports.length}, audit: ${Object.keys(auditResults).length} reports, fatura: ${Object.keys(faturaValidations).length} reports, approvals: ${Object.keys(approvals).length} reports`
    );

    return NextResponse.json({
      success: true,
      data: {
        reports: pendingResult.reports,
        auditResults,
        faturaValidations,
        approvals,
        botStepSkips: botSkips,
      },
      from_cache: pendingResult.fromCache,
      timing_ms: totalDuration,
    });
  } catch (error) {
    console.error('[Init] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function fetchAuditResultsForReports(
  reportIds: number[]
): Promise<Record<number, any[]>> {
  if (!sql || !isDatabaseAvailable || reportIds.length === 0) return {};

  try {
    const rows = await sql`
      SELECT ar.report_id, ar.expense_id, ar.status, ar.summary
      FROM expense_audit_results ar
      WHERE ar.report_id = ANY(${reportIds})
        AND EXISTS (
          SELECT 1 FROM prestacao_expenses pe
          WHERE pe.report_id = ar.report_id AND pe.id = ar.expense_id
        )
      ORDER BY ar.report_id, ar.expense_id
    `;

    const byReport: Record<number, any[]> = {};
    for (const r of rows) {
      if (!byReport[r.report_id]) byReport[r.report_id] = [];
      byReport[r.report_id].push(r);
    }
    return byReport;
  } catch (error) {
    console.error('[Init] Error fetching audit results:', error);
    return {};
  }
}

/**
 * Report ids whose latest bot action was skipped_step — live-verified signal
 * that the report sits at an approval step where the bot can't act.
 */
async function fetchBotStepSkips(reportIds: number[]): Promise<number[]> {
  if (!sql || !isDatabaseAvailable || reportIds.length === 0) return [];
  try {
    const rows = await sql`
      SELECT DISTINCT ON (report_id) report_id, status
      FROM auto_approve_log
      WHERE report_id = ANY(${reportIds})
      ORDER BY report_id, created_at DESC
    `;
    return (rows as any[]).filter(r => r.status === 'skipped_step').map(r => r.report_id as number);
  } catch {
    return [];
  }
}

async function fetchApprovalsForReports(
  reportIds: number[]
): Promise<Record<number, any>> {
  if (!sql || !isDatabaseAvailable || reportIds.length === 0) return {};

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

    const rows = await sql`
      SELECT report_id, approver_name, approver_user_id, observation, approved_at
      FROM report_approvals
      WHERE report_id = ANY(${reportIds})
    `;

    const approvalsMap: Record<number, any> = {};
    for (const row of rows) {
      approvalsMap[row.report_id] = {
        approver_name: row.approver_name,
        approver_user_id: row.approver_user_id,
        observation: row.observation,
        approved_at: row.approved_at,
      };
    }
    return approvalsMap;
  } catch (error) {
    console.error('[Init] Error fetching approvals:', error);
    return {};
  }
}
