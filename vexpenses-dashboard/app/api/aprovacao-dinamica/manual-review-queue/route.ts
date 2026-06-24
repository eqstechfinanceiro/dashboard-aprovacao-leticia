import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    if (!sql) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get('report_id');

    let rows: any[];

    if (reportId) {
      rows = await sql`
        SELECT
          ear.report_id,
          ear.expense_id,
          ear.status,
          ear.extracted_data::text as extracted_data,
          ear.informed_data::text as informed_data,
          ear.divergences::text as divergences,
          ear.rules_triggered::text as rules_triggered,
          ear.summary,
          ear.audited_by
        FROM expense_audit_results ear
        WHERE ear.status IN ('PENDENTE', 'REPROVADO')
          AND ear.report_id = ${parseInt(reportId)}
        ORDER BY ear.expense_id
      `;
    } else {
      rows = await sql`
        SELECT
          ear.report_id,
          ear.expense_id,
          ear.status,
          ear.extracted_data::text as extracted_data,
          ear.informed_data::text as informed_data,
          ear.divergences::text as divergences,
          ear.rules_triggered::text as rules_triggered,
          ear.summary,
          ear.audited_by
        FROM expense_audit_results ear
        WHERE ear.status IN ('PENDENTE', 'REPROVADO')
        ORDER BY ear.report_id, ear.expense_id
      `;
    }

    const items = rows.map((r: any) => ({
      report_id: r.report_id,
      expense_id: r.expense_id,
      status: r.status,
      extracted_data: r.extracted_data ? JSON.parse(r.extracted_data) : null,
      informed_data: r.informed_data ? JSON.parse(r.informed_data) : null,
      divergences: r.divergences ? JSON.parse(r.divergences) : [],
      rules_triggered: r.rules_triggered ? JSON.parse(r.rules_triggered) : [],
      summary: r.summary,
      audited_by: r.audited_by,
    }));

    return NextResponse.json({
      success: true,
      data: items,
      total: items.length,
    });
  } catch (error) {
    console.error('[Manual Review Queue] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
