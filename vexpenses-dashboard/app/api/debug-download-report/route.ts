import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }

  const reportId = request.nextUrl.searchParams.get('reportId') || '10912854';

  try {
    // 1. Call VExpenses API
    const resp = await fetch(`${API_URL}/v2/reports/${reportId}?include=expenses`, {
      headers: { Authorization: API_KEY, Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      return NextResponse.json({ error: `API returned ${resp.status}` }, { status: 500 });
    }

    const data = await resp.json();
    const expenses = data.data?.expenses?.data || [];

    // 2. Check current DB state
    const beforeRows = await sql`
      SELECT COUNT(*) as count, COALESCE(SUM(value), 0) as total
      FROM prestacao_expenses WHERE report_id = ${reportId}
    `;

    // 3. Try inserting in smaller batches
    const BATCH = 50;
    let inserted = 0;
    let errors: string[] = [];

    for (let i = 0; i < expenses.length; i += BATCH) {
      const batch = expenses.slice(i, i + BATCH);
      try {
        const valueGroups: string[] = [];
        const params: any[] = [];
        let pIdx = 1;
        for (const e of batch) {
          const placeholders = Array.from({ length: 7 }, () => `$${pIdx++}`);
          valueGroups.push(`(${placeholders.join(', ')})`);
          params.push(e.id, Number(reportId), e.value, e.date || null, e.title || e.description || null, e.status || null, JSON.stringify(e));
        }
        const query = `INSERT INTO prestacao_expenses (id, report_id, value, date, description, status, raw_data)
          VALUES ${valueGroups.join(', ')}
          ON CONFLICT (id) DO UPDATE SET
            report_id = EXCLUDED.report_id, value = EXCLUDED.value, date = EXCLUDED.date,
            description = EXCLUDED.description, status = EXCLUDED.status, raw_data = EXCLUDED.raw_data`;
        await sql.query(query, params);
        inserted += batch.length;
      } catch (err: any) {
        errors.push(`Batch ${i}-${i + BATCH}: ${err.message}`);
      }
    }

    // 4. Check after
    const afterRows = await sql`
      SELECT COUNT(*) as count, COALESCE(SUM(value), 0) as total
      FROM prestacao_expenses WHERE report_id = ${reportId}
    `;

    return NextResponse.json({
      reportId,
      apiExpenseCount: expenses.length,
      before: beforeRows[0],
      after: afterRows[0],
      inserted,
      errors,
      sampleExpense: expenses[0] ? {
        id: expenses[0].id,
        value: expenses[0].value,
        date: expenses[0].date,
        title: expenses[0].title,
      } : null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
