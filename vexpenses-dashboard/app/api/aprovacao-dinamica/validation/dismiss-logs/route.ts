import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
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

    await sql`
      ALTER TABLE nf_duplicate_dismissals ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN NOT NULL DEFAULT false
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
        e.value AS expense_value,
        e.report_id AS expense_report_id,
        r.name AS expense_report_name,
        r.user_name AS expense_user_name,
        e.raw_data AS expense_raw_data,
        de.value AS duplicate_value,
        de.report_id AS duplicate_report_id,
        dr.name AS duplicate_report_name,
        dr.user_name AS duplicate_user_name,
        de.raw_data AS duplicate_raw_data
      FROM nf_duplicate_dismissals d
      LEFT JOIN prestacao_expenses e ON d.expense_id = e.id
      LEFT JOIN prestacao_reports r ON e.report_id = r.id
      LEFT JOIN prestacao_expenses de ON d.duplicate_expense_id = de.id
      LEFT JOIN prestacao_reports dr ON de.report_id = dr.id
      ORDER BY d.dismissed_at DESC
    `;

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error('[Dismiss Logs GET] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
