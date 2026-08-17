import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }
  if (!API_KEY) {
    return NextResponse.json({ error: 'VEXPENSES_API_KEY not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const mode = body.mode || 'smart'; // 'smart' = only missing, 'all' = everything
  const concurrency = body.concurrency || 10;

  const db = sql;

  // 1. Determine which reports to process
  let reportIds: number[] = [];

  if (mode === 'smart') {
    // Only get reports that:
    // a) Have ENVIADO status (may have new expenses added)
    // b) Have APROVADO status but 0 expenses in DB (missing entirely)
    // c) Have APROVADO status but updated_at newer than last expense download
    const smartRows = await sql`
      SELECT r.id
      FROM prestacao_reports r
      LEFT JOIN (
        SELECT report_id, COUNT(*) as cnt, MAX(id) as max_eid
        FROM prestacao_expenses
        GROUP BY report_id
      ) e ON e.report_id = r.id
      WHERE (r.status ILIKE 'Enviado' AND COALESCE(e.cnt, 0) = 0)
         OR (r.status ILIKE 'Aprovado' AND COALESCE(e.cnt, 0) = 0)
         OR r.status ILIKE 'Enviado'
      ORDER BY r.id
    `;
    reportIds = smartRows.map((r: any) => r.id);

    // Also get APROVADO reports that have expenses but might be incomplete
    // (we can't easily tell, so include all ENVIADO + APROVADO with 0 expenses)
    const zeroExpenseRows = await sql`
      SELECT r.id
      FROM prestacao_reports r
      LEFT JOIN prestacao_expenses e ON e.report_id = r.id
      WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
        AND e.id IS NULL
      ORDER BY r.id
    `;
    const zeroIds = zeroExpenseRows.map((r: any) => r.id);
    // Merge unique
    const allIds = new Set([...reportIds, ...zeroIds]);
    reportIds = Array.from(allIds).sort((a, b) => a - b);
  } else {
    const allRows = await sql`SELECT id FROM prestacao_reports ORDER BY id`;
    reportIds = allRows.map((r: any) => r.id);
  }

  const total = reportIds.length;
  const startTime = Date.now();

  // 2. Process in batches
  let done = 0;
  let totalExpenses = 0;
  let errors: string[] = [];
  const BATCH = concurrency;

  for (let i = 0; i < reportIds.length; i += BATCH) {
    const batch = reportIds.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (rid) => {
        try {
          let resp = await fetch(`${API_URL}/v2/reports/${rid}?include=expenses`, {
            headers: { Authorization: API_KEY, Accept: 'application/json' },
            signal: AbortSignal.timeout(30000),
          });
          if (!resp.ok) {
            await new Promise(r => setTimeout(r, 500));
            resp = await fetch(`${API_URL}/v2/reports/${rid}?include=expenses`, {
              headers: { Authorization: API_KEY, Accept: 'application/json' },
              signal: AbortSignal.timeout(30000),
            });
            if (!resp.ok) return 0;
          }
          const data = await resp.json();
          const expenses = data.data?.expenses?.data || [];
          if (expenses.length === 0) return 0;

          // Insert in sub-batches of 50
          const SUB_BATCH = 50;
          for (let j = 0; j < expenses.length; j += SUB_BATCH) {
            const sub = expenses.slice(j, j + SUB_BATCH);
            const vgs: string[] = [];
            const params: any[] = [];
            let pIdx = 1;
            for (const e of sub) {
              const ph = Array.from({ length: 7 }, () => `$${pIdx++}`);
              vgs.push(`(${ph.join(', ')})`);
              params.push(e.id, rid, e.value, e.date || null, e.title || e.description || null, e.status || null, JSON.stringify(e));
            }
            const q = `INSERT INTO prestacao_expenses (id, report_id, value, date, description, status, raw_data)
              VALUES ${vgs.join(', ')}
              ON CONFLICT (id) DO UPDATE SET
                report_id = EXCLUDED.report_id, value = EXCLUDED.value, date = EXCLUDED.date,
                description = EXCLUDED.description, status = EXCLUDED.status, raw_data = EXCLUDED.raw_data`;
            await db.query(q, params);
          }
          return expenses.length;
        } catch (err: any) {
          errors.push(`Report ${rid}: ${err?.message || 'unknown'}`);
          return 0;
        }
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') totalExpenses += r.value;
    }
    done += batch.length;

    // Log progress
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = done / elapsed;
    const eta = (total - done) / rate;
    console.log(`[smart-download] ${done}/${total} (${(done/total*100).toFixed(1)}%) - ${totalExpenses} expenses - ${elapsed.toFixed(0)}s elapsed - ETA ${eta.toFixed(0)}s - ${errors.length} errors`);
  }

  const elapsed = (Date.now() - startTime) / 1000;

  return NextResponse.json({
    success: true,
    mode,
    reports_processed: done,
    total_reports: total,
    total_expenses: totalExpenses,
    errors: errors.slice(0, 50),
    error_count: errors.length,
    elapsed_seconds: elapsed,
  });
}
