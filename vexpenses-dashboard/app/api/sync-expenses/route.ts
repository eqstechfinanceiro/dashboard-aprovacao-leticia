import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

interface SyncProgress {
  status: 'idle' | 'running' | 'done' | 'error';
  total: number;
  processed: number;
  synced: number;
  deleted_expenses: number;
  inserted_expenses: number;
  updated_expenses: number;
  unchanged: number;
  errors: number;
  errorList: string[];
  startedAt: number;
  lastUpdate: number;
  currentReport: string;
  recentChanges: { report_id: number; report_name: string; action: string; count: number; value: number }[];
}

let progress: SyncProgress = {
  status: 'idle',
  total: 0,
  processed: 0,
  synced: 0,
  deleted_expenses: 0,
  inserted_expenses: 0,
  updated_expenses: 0,
  unchanged: 0,
  errors: 0,
  errorList: [],
  startedAt: 0,
  lastUpdate: 0,
  currentReport: '',
  recentChanges: [],
};

export async function GET() {
  const elapsed = progress.startedAt > 0 ? (Date.now() - progress.startedAt) / 1000 : 0;
  const remaining = progress.processed > 0
    ? (elapsed / progress.processed) * (progress.total - progress.processed)
    : 0;

  return NextResponse.json({
    ...progress,
    elapsed_seconds: Math.round(elapsed),
    eta_seconds: Math.round(remaining),
    progress_pct: progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0,
  });
}

export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }

  if (progress.status === 'running') {
    return NextResponse.json({ error: 'Sync already running', progress });
  }

  const body = await request.json().catch(() => ({}));
  const limit = body.limit || 0; // 0 = all
  const delayMs = body.delay || 300; // delay between API calls

  // Get all APROVADO/ENVIADO non-FATURA reports
  const reports = await sql`
    SELECT DISTINCT r.id, r.name, r.status, r.user_cpf
    FROM prestacao_reports r
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
      AND NOT (r.name ILIKE '%FATURA%' OR r.name ILIKE '%CARTAO%' OR r.name ILIKE '%CARTÃO%')
    ORDER BY r.id
  `;

  const toProcess = limit > 0 ? reports.slice(0, limit) : reports;

  progress = {
    status: 'running',
    total: toProcess.length,
    processed: 0,
    synced: 0,
    deleted_expenses: 0,
    inserted_expenses: 0,
    updated_expenses: 0,
    unchanged: 0,
    errors: 0,
    errorList: [],
    startedAt: Date.now(),
    lastUpdate: Date.now(),
    currentReport: '',
    recentChanges: [],
  };

  // Run async
  (async () => {
    for (let i = 0; i < toProcess.length; i++) {
      if (progress.status !== 'running') break;

      const report = toProcess[i] as any;
      progress.currentReport = `#${report.id} ${report.name} (${report.status})`;

      try {
        // 1. Fetch from VExpenses API
        const resp = await fetch(`${API_URL}/v2/reports/${report.id}?include=expenses`, {
          headers: { Authorization: API_KEY, Accept: 'application/json' },
          signal: AbortSignal.timeout(30000),
        });

        if (!resp.ok) {
          if (resp.status === 429) {
            // Rate limited - wait longer
            progress.errorList.push(`Report ${report.id}: 429 rate limited, waiting 10s`);
            await new Promise(r => setTimeout(r, 10000));
            i--; // retry same report
            continue;
          }
          progress.errors++;
          progress.errorList.push(`Report ${report.id}: API returned ${resp.status}`);
          progress.processed++;
          progress.lastUpdate = Date.now();
          await new Promise(r => setTimeout(r, delayMs));
          continue;
        }

        const data = await resp.json();
        const apiExpenses = data.data?.expenses?.data || [];
        const apiIds = new Set(apiExpenses.map((e: any) => e.id));

        // 2. Get current DB expenses
        const dbExpenses = await sql`
          SELECT id, value, raw_data
          FROM prestacao_expenses
          WHERE report_id = ${report.id}
        `;
        const dbIds = new Set(dbExpenses.map((e: any) => e.id));
        const dbVals = new Map(dbExpenses.map((e: any) => [e.id, Number(e.value)]));

        // 3. Find differences
        const toDelete = [...dbIds].filter(id => !apiIds.has(id));
        const toInsert = apiExpenses.filter((e: any) => !dbIds.has(e.id));
        const toUpdate = apiExpenses.filter((e: any) => {
          if (!dbIds.has(e.id)) return false;
          return Math.abs(Number(e.value) - (dbVals.get(e.id) || 0)) > 0.01;
        });

        const hasChanges = toDelete.length > 0 || toInsert.length > 0 || toUpdate.length > 0;

        if (hasChanges) {
          // 4a. Delete stale expenses
          if (toDelete.length > 0) {
            await sql`
              DELETE FROM prestacao_expenses
              WHERE id = ANY(${toDelete}::int[])
            `;
          }

          // 4b. Insert new expenses
          if (toInsert.length > 0) {
            const BATCH = 50;
            for (let j = 0; j < toInsert.length; j += BATCH) {
              const batch = toInsert.slice(j, j + BATCH);
              const params: any[] = [];
              const groups: string[] = [];
              let pIdx = 1;
              for (const e of batch) {
                groups.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
                params.push(e.id, report.id, e.value, e.date || null, e.title || e.description || null, e.status || null, JSON.stringify(e));
              }
              const query = `INSERT INTO prestacao_expenses (id, report_id, value, date, description, status, raw_data)
                VALUES ${groups.join(', ')}
                ON CONFLICT (id) DO UPDATE SET
                  report_id = EXCLUDED.report_id, value = EXCLUDED.value, date = EXCLUDED.date,
                  description = EXCLUDED.description, status = EXCLUDED.status, raw_data = EXCLUDED.raw_data`;
              await sql.query(query, params);
            }
          }

          // 4c. Update changed expenses
          if (toUpdate.length > 0) {
            for (const e of toUpdate) {
              await sql`
                UPDATE prestacao_expenses
                SET value = ${e.value}, date = ${e.date || null},
                    description = ${e.title || e.description || null},
                    status = ${e.status || null}, raw_data = ${JSON.stringify(e)}
                WHERE id = ${e.id}
              `;
            }
          }

          const changeValue = toDelete.reduce((s, id) => s + (dbVals.get(id) || 0), 0)
            - toInsert.reduce((s, e) => s + Number(e.value), 0);

          progress.recentChanges.unshift({
            report_id: report.id,
            report_name: report.name,
            action: `del=${toDelete.length} ins=${toInsert.length} upd=${toUpdate.length}`,
            count: toDelete.length + toInsert.length + toUpdate.length,
            value: changeValue,
          });
          if (progress.recentChanges.length > 50) progress.recentChanges.pop();

          progress.synced++;
          progress.deleted_expenses += toDelete.length;
          progress.inserted_expenses += toInsert.length;
          progress.updated_expenses += toUpdate.length;
        } else {
          progress.unchanged++;
        }

      } catch (err: any) {
        progress.errors++;
        const msg = `Report ${report.id} (${report.name}): ${err.message}`;
        if (progress.errorList.length < 100) progress.errorList.push(msg);
      }

      progress.processed++;
      progress.lastUpdate = Date.now();

      // Rate limit delay
      await new Promise(r => setTimeout(r, delayMs));
    }

    progress.status = 'done';
    progress.lastUpdate = Date.now();
    progress.currentReport = '';
  })();

  return NextResponse.json({
    message: 'Sync started',
    totalReports: toProcess.length,
    progress,
  });
}
