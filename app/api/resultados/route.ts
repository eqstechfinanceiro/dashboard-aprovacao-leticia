import { NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import { ensureAuditTable } from '@/lib/audit-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    if (!sql) {
      return NextResponse.json({
        success: true,
        data: {
          fechamento: { totalReports: 0, totalExpenses: 0, totalSyncs: 0, lastSync: null, reportsByStatus: {} },
          aprovacaoDinamica: {
            totalAudited: 0,
            approvedByBot: 0,
            pendingReview: 0,
            rejectedByBot: 0,
            approvedByHuman: 0,
            rejectedByHuman: 0,
            analyzeLater: 0,
            totalReportsApproved: 0,
            auditByDay: [],
          },
          duplicates: {
            totalDetected: 0,
            confirmedDuplicates: 0,
            dismissedAsNotDuplicate: 0,
            recentDismissals: [],
          },
        },
      });
    }

    await ensureAuditTable();

    // --- Fechamento metrics ---
    let fechamentoMetrics = {
      totalReports: 0,
      totalExpenses: 0,
      totalSyncs: 0,
      lastSync: null as string | null,
      reportsByStatus: {} as Record<string, number>,
    };

    try {
      const reportCountRows = await sql`
        SELECT COUNT(*)::int as count FROM prestacao_reports
      `;
      fechamentoMetrics.totalReports = reportCountRows[0]?.count || 0;

      const expenseCountRows = await sql`
        SELECT COUNT(*)::int as count FROM prestacao_expenses
      `;
      fechamentoMetrics.totalExpenses = expenseCountRows[0]?.count || 0;

      const syncCountRows = await sql`
        SELECT COUNT(*)::int as count FROM sync_log
      `;
      fechamentoMetrics.totalSyncs = syncCountRows[0]?.count || 0;

      const lastSyncRows = await sql`
        SELECT synced_at::text as synced_at FROM sync_log ORDER BY synced_at DESC LIMIT 1
      `;
      fechamentoMetrics.lastSync = lastSyncRows[0]?.synced_at || null;

      const statusRows = await sql`
        SELECT status, COUNT(*)::int as count
        FROM prestacao_reports
        GROUP BY status
      `;
      for (const row of statusRows) {
        fechamentoMetrics.reportsByStatus[row.status] = row.count;
      }
    } catch (e) {
      console.error('[Resultados] Fechamento metrics error:', e);
    }

    // --- Aprovação Dinâmica metrics ---
    let aprovacaoMetrics = {
      totalAudited: 0,
      approvedByBot: 0,
      pendingReview: 0,
      rejectedByBot: 0,
      approvedByHuman: 0,
      rejectedByHuman: 0,
      analyzeLater: 0,
      totalReportsApproved: 0,
      auditByDay: [] as { date: string; count: number }[],
    };

    try {
      const auditRows = await sql`
        SELECT status, COUNT(*)::int as count
        FROM expense_audit_results
        GROUP BY status
      `;
      for (const row of auditRows) {
        aprovacaoMetrics.totalAudited += row.count;
        switch (row.status) {
          case 'APROVADO_BOT': aprovacaoMetrics.approvedByBot = row.count; break;
          case 'PENDENTE': aprovacaoMetrics.pendingReview = row.count; break;
          case 'REPROVADO': aprovacaoMetrics.rejectedByBot = row.count; break;
          case 'APROVADO_HUMANO': aprovacaoMetrics.approvedByHuman = row.count; break;
          case 'REPROVADO_HUMANO': aprovacaoMetrics.rejectedByHuman = row.count; break;
          case 'ANALISAR_DEPOIS': aprovacaoMetrics.analyzeLater = row.count; break;
        }
      }

      const approvalCountRows = await sql`
        SELECT COUNT(*)::int as count FROM report_approvals
      `;
      aprovacaoMetrics.totalReportsApproved = approvalCountRows[0]?.count || 0;

      const auditByDayRows = await sql`
        SELECT DATE(audited_at) as date, COUNT(*)::int as count
        FROM expense_audit_results
        WHERE audited_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(audited_at)
        ORDER BY date
      `;
      aprovacaoMetrics.auditByDay = auditByDayRows.map((r: any) => ({
        date: r.date ? new Date(r.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '',
        count: r.count,
      }));
    } catch (e) {
      console.error('[Resultados] Aprovação metrics error:', e);
    }

    // --- Duplicate detection metrics ---
    let duplicateMetrics = {
      totalDetected: 0,
      confirmedDuplicates: 0,
      dismissedAsNotDuplicate: 0,
      recentDismissals: [] as any[],
    };

    try {
      await sql`
        CREATE TABLE IF NOT EXISTS nf_duplicate_dismissals (
          id SERIAL PRIMARY KEY,
          expense_id BIGINT NOT NULL,
          duplicate_expense_id BIGINT NOT NULL,
          dismissed_by TEXT NOT NULL,
          dismissed_by_email TEXT,
          note TEXT,
          is_duplicate BOOLEAN NOT NULL DEFAULT false,
          dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(expense_id, duplicate_expense_id)
        )
      `;

      const dupTotalRows = await sql`
        SELECT COUNT(*)::int as count FROM nf_duplicate_dismissals
      `;
      duplicateMetrics.totalDetected = dupTotalRows[0]?.count || 0;

      const dupConfirmedRows = await sql`
        SELECT COUNT(*)::int as count FROM nf_duplicate_dismissals WHERE is_duplicate = true
      `;
      duplicateMetrics.confirmedDuplicates = dupConfirmedRows[0]?.count || 0;

      const dupDismissedRows = await sql`
        SELECT COUNT(*)::int as count FROM nf_duplicate_dismissals WHERE is_duplicate = false
      `;
      duplicateMetrics.dismissedAsNotDuplicate = dupDismissedRows[0]?.count || 0;

      const recentRows = await sql`
        SELECT
          d.expense_id,
          d.duplicate_expense_id,
          d.dismissed_by,
          d.is_duplicate,
          d.note,
          d.dismissed_at::text as dismissed_at,
          e1.value AS expense_value,
          r1.name AS expense_report_name,
          r1.user_name AS expense_user_name,
          e2.value AS duplicate_value,
          r2.name AS duplicate_report_name,
          r2.user_name AS duplicate_user_name
        FROM nf_duplicate_dismissals d
        LEFT JOIN prestacao_expenses e1 ON d.expense_id = e1.id
        LEFT JOIN prestacao_reports r1 ON e1.report_id = r1.id
        LEFT JOIN prestacao_expenses e2 ON d.duplicate_expense_id = e2.id
        LEFT JOIN prestacao_reports r2 ON e2.report_id = r2.id
        ORDER BY d.dismissed_at DESC
        LIMIT 10
      `;
      duplicateMetrics.recentDismissals = recentRows;
    } catch (e) {
      console.error('[Resultados] Duplicate metrics error:', e);
    }

    return NextResponse.json({
      success: true,
      data: {
        fechamento: fechamentoMetrics,
        aprovacaoDinamica: aprovacaoMetrics,
        duplicates: duplicateMetrics,
      },
    });
  } catch (error) {
    console.error('[Resultados API] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
