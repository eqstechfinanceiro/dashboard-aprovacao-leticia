import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

// Global progress tracker
let progress: { done: number; total: number; fixed: number; failed: number; errors: string[]; startTime: number; running: boolean } = {
  done: 0, total: 0, fixed: 0, failed: 0, errors: [], startTime: 0, running: false
};

export async function GET() {
  if (!sql) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }

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

export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }
  if (!API_KEY) {
    return NextResponse.json({ error: 'VEXPENSES_API_KEY not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const concurrency = body.concurrency || 1;
  const db = sql;

  // Get all ENVIADO reports (non-FATURA) + APROVADO with 0 expenses
  const rows = await sql`
    SELECT r.id, r.name, r.status, r.user_name
    FROM prestacao_reports r
    WHERE r.status ILIKE 'Enviado'
      AND NOT (r.name ILIKE '%FATURA%' OR r.name ILIKE '%CARTAO%' OR r.name ILIKE '%CARTÃO%')
    ORDER BY r.id
  `;

  const reportIds: number[] = rows.map((r: any) => r.id);
  const uniqueIds = Array.from(new Set(reportIds)).sort((a, b) => a - b);

  // Initialize progress
  progress = {
    done: 0,
    total: uniqueIds.length,
    fixed: 0,
    failed: 0,
    errors: [],
    startTime: Date.now(),
    running: true,
  };

  const BATCH = concurrency;

  for (let i = 0; i < uniqueIds.length; i += BATCH) {
    const batch = uniqueIds.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (rid) => {
        try {
          // Get current count
          const before = await sql`
            SELECT COUNT(*) as cnt FROM prestacao_expenses WHERE report_id = ${rid}
          `;
          const beforeCount = Number(before[0].cnt);

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
              progress.errors.push(`Report ${rid}: API returned ${resp.status}`);
              return;
            }
          }
          const data = await resp.json();
          const expenses = data.data?.expenses?.data || [];
          if (expenses.length === 0) return;

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

          const after = await sql`
            SELECT COUNT(*) as cnt FROM prestacao_expenses WHERE report_id = ${rid}
          `;
          const afterCount = Number(after[0].cnt);
          if (afterCount > beforeCount) {
            progress.fixed++;
          }
        } catch (err: any) {
          progress.failed++;
          progress.errors.push(`Report ${rid}: ${err?.message || 'unknown'}`);
        }
      })
    );

    progress.done += batch.length;
    // Rate limit: wait 500ms between batches
    await new Promise(r => setTimeout(r, 500));
    const elapsed = (Date.now() - progress.startTime) / 1000;
    const rate = progress.done / elapsed;
    const eta = Math.round((progress.total - progress.done) / rate);
    console.log(`[fix-enviado] ${progress.done}/${progress.total} (${(progress.done/progress.total*100).toFixed(1)}%) fixed=${progress.fixed} failed=${progress.failed} elapsed=${Math.round(elapsed)}s eta=${eta}s`);
  }

  progress.running = false;
  const elapsed = (Date.now() - progress.startTime) / 1000;

  return NextResponse.json({
    success: true,
    total: progress.total,
    fixed: progress.fixed,
    failed: progress.failed,
    errors: progress.errors.slice(0, 20),
    elapsed_seconds: Math.round(elapsed),
  });
}
