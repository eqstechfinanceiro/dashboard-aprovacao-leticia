import { NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  try {
    if (!sql) {
      return NextResponse.json({ data: [] });
    }

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

    const rows = await sql`
      SELECT
        d.id,
        d.expense_id,
        d.duplicate_expense_id,
        d.dismissed_by,
        d.dismissed_by_email,
        d.note,
        d.is_duplicate,
        d.dismissed_at,
        e1.value AS expense_value,
        e1.report_id AS expense_report_id,
        r1.name AS expense_report_name,
        r1.user_name AS expense_user_name,
        e1.raw_data AS expense_raw_data,
        e2.value AS duplicate_value,
        e2.report_id AS duplicate_report_id,
        r2.name AS duplicate_report_name,
        r2.user_name AS duplicate_user_name,
        e2.raw_data AS duplicate_raw_data
      FROM nf_duplicate_dismissals d
      LEFT JOIN prestacao_expenses e1 ON d.expense_id = e1.id
      LEFT JOIN prestacao_reports r1 ON e1.report_id = r1.id
      LEFT JOIN prestacao_expenses e2 ON d.duplicate_expense_id = e2.id
      LEFT JOIN prestacao_reports r2 ON e2.report_id = r2.id
      ORDER BY d.dismissed_at DESC
    `;

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error('[Dismiss Logs] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}
