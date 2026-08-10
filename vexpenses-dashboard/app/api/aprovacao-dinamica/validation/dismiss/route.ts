import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { expense_id, duplicate_expense_id, dismissed_by, dismissed_by_email, note, is_duplicate } = body;

    if (!expense_id || !duplicate_expense_id || !dismissed_by) {
      return NextResponse.json(
        { error: 'Missing required fields: expense_id, duplicate_expense_id, dismissed_by' },
        { status: 400 }
      );
    }

    if (!sql) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
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

    // Try insert, or update if either direction exists
    const existing = await sql`
      SELECT expense_id, duplicate_expense_id FROM nf_duplicate_dismissals
      WHERE (expense_id = ${expense_id} AND duplicate_expense_id = ${duplicate_expense_id})
         OR (expense_id = ${duplicate_expense_id} AND duplicate_expense_id = ${expense_id})
      LIMIT 1
    `;

    if (existing.length > 0) {
      const existingExpId = existing[0].expense_id;
      const existingDupId = existing[0].duplicate_expense_id;
      await sql`
        UPDATE nf_duplicate_dismissals SET
          dismissed_by = ${dismissed_by},
          dismissed_by_email = ${dismissed_by_email || null},
          note = ${note || null},
          is_duplicate = ${is_duplicate ?? false},
          dismissed_at = NOW()
        WHERE expense_id = ${existingExpId} AND duplicate_expense_id = ${existingDupId}
      `;
    } else {
      await sql`
        INSERT INTO nf_duplicate_dismissals (expense_id, duplicate_expense_id, dismissed_by, dismissed_by_email, note, is_duplicate)
        VALUES (${expense_id}, ${duplicate_expense_id}, ${dismissed_by}, ${dismissed_by_email || null}, ${note || null}, ${is_duplicate ?? false})
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Dismiss Duplicate] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get('report_id');

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

    let rows;
    if (reportId) {
      rows = await sql`
        SELECT d.expense_id, d.duplicate_expense_id, d.dismissed_by, d.dismissed_by_email, d.note, d.is_duplicate, d.dismissed_at
        FROM nf_duplicate_dismissals d
        JOIN prestacao_expenses pe ON (d.expense_id = pe.id OR d.duplicate_expense_id = pe.id)
        WHERE pe.report_id = ${parseInt(reportId)}
      `;
    } else {
      rows = await sql`
        SELECT expense_id, duplicate_expense_id, dismissed_by, dismissed_by_email, note, is_duplicate, dismissed_at
        FROM nf_duplicate_dismissals
      `;
    }

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error('[Dismiss Duplicate GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch dismissals' }, { status: 500 });
  }
}
