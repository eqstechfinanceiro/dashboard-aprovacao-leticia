import { NextRequest, NextResponse } from 'next/server';
import { ensureAuditTable, getAuditResultsForReport } from '@/lib/audit-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: { reportId: string } }
) {
  try {
    const reportId = parseInt(params.reportId);

    if (isNaN(reportId)) {
      return NextResponse.json({ error: 'Invalid reportId' }, { status: 400 });
    }

    await ensureAuditTable();

    const results = await getAuditResultsForReport(reportId);

    const mapped = results.map(r => ({
      expense_id: r.expense_id,
      status: r.status,
      rules_triggered: r.rules_triggered,
      extracted_data: r.extracted_data,
      informed_data: r.informed_data,
      divergences: r.divergences,
      summary: r.summary,
      audited_at: r.audited_at,
    }));

    const approved = mapped.filter(e => e.status === 'APROVADO_BOT').length;
    const pending = mapped.filter(e => e.status === 'PENDENTE').length;
    const rejected = mapped.filter(e => e.status === 'REPROVADO').length;

    return NextResponse.json({
      success: true,
      data: {
        report_id: reportId,
        total_expenses: mapped.length,
        approved,
        pending,
        rejected,
        expenses: mapped,
      },
    });
  } catch (error) {
    console.error('[Audit Results API] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
