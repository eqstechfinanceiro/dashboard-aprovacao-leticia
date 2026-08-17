import { NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

let progress: { done: number; total: number; fixed: number; failed: number; errors: string[]; startTime: number; running: boolean } = {
  done: 0, total: 0, fixed: 0, failed: 0, errors: [], startTime: 0, running: false
};

export async function GET() {
  const elapsed = progress.startTime ? (Date.now() - progress.startTime) / 1000 : 0;
  const rate = progress.done > 0 ? progress.done / elapsed : 0;
  const eta = progress.done > 0 ? Math.round((progress.total - progress.done) / rate) : 0;
  return NextResponse.json({
    ...progress,
    elapsed_seconds: Math.round(elapsed),
    eta_seconds: eta,
    progress_pct: progress.total > 0 ? (progress.done / progress.total * 100).toFixed(1) + '%' : '0%',
  });
}

export async function POST() {
  if (!sql) return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  if (!API_KEY) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });

  const db = sql;

  // Get ALL APROVADO reports (non-FATURA) with 0 expenses
  const rows = await sql`
    SELECT r.id, r.name, r.user_name
    FROM prestacao_reports r
    LEFT JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.status ILIKE 'Aprovado'
      AND r.user_cpf IS NOT NULL
      AND NOT (r.name ILIKE '%FATURA%' OR r.name ILIKE '%CARTAO%' OR r.name ILIKE '%CARTÃO%')
    GROUP BY r.id, r.name, r.user_name
    HAVING COUNT(e.id) = 0
    ORDER BY r.id
  `;

  const reportIds = rows.map((r: any) => r.id);
  progress = { done: 0, total: reportIds.length, fixed: 0, failed: 0, errors: [], startTime: Date.now(), running: true };

  for (let i = 0; i < reportIds.length; i++) {
    const rid = reportIds[i];
    try {
      let resp = await fetch(`${API_URL}/v2/reports/${rid}?include=expenses`, {
        headers: { Authorization: API_KEY, Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) {
        await new Promise(r => setTimeout(r, 2000));
        resp = await fetch(`${API_URL}/v2/reports/${rid}?include=expenses`, {
          headers: { Authorization: API_KEY, Accept: 'application/json' },
          signal: AbortSignal.timeout(30000),
        });
        if (!resp.ok) {
          progress.failed++;
          progress.errors.push(`Report ${rid}: API ${resp.status}`);
          progress.done++;
          continue;
        }
      }
      const data = await resp.json();
      const expenses = data.data?.expenses?.data || [];
      if (expenses.length > 0) {
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
        progress.fixed++;
      }
    } catch (err: any) {
      progress.failed++;
      progress.errors.push(`Report ${rid}: ${err?.message || 'unknown'}`);
    }
    progress.done++;
    // Rate limit: 300ms between requests
    await new Promise(r => setTimeout(r, 300));
  }

  progress.running = false;
  return NextResponse.json({
    success: true,
    total: progress.total,
    fixed: progress.fixed,
    failed: progress.failed,
    errors: progress.errors.slice(0, 20),
    elapsed_seconds: Math.round((Date.now() - progress.startTime) / 1000),
  });
}
