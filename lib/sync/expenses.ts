// Canonical expense sync per report.
// Single source of truth: fetch report detail from v2, mark 404 as DELETADO,
// update status if changed, and reconcile expenses (delete/insert/update).
import { sql } from '../db/neon';
import { API_URL, v2Headers, fetchWithRetry, sleep } from './client';
import { markReportDeleted, recordStatusTransition } from './reports';

export interface ReportDetail {
  status: string | null;
  expenses: any[];
}

export class ReportNotFoundError extends Error {
  constructor(public reportId: number) { super(`Report ${reportId} not found (404)`); }
}

/** Fetch a single report's detail with expenses (v2). Throws ReportNotFoundError on 404. */
export async function fetchReportExpenses(
  reportId: number,
  onRateLimit?: (waitMs: number) => void
): Promise<ReportDetail> {
  const resp = await fetchWithRetry(
    `${API_URL}/v2/reports/${reportId}?include=expenses.user`,
    { headers: v2Headers(), signal: AbortSignal.timeout(30000) },
    3,
    onRateLimit
  );
  if (resp.status === 404) throw new ReportNotFoundError(reportId);
  if (!resp.ok) throw new Error(`Report ${reportId}: API returned ${resp.status}`);
  const data: any = await resp.json();
  const report = data.data || data;
  return {
    status: report?.status || null,
    expenses: report?.expenses?.data || [],
  };
}

export interface ReportSyncResult {
  report_id: number;
  deleted_report: boolean;
  status_changed: { from: string; to: string } | null;
  deleted_expenses: number;
  inserted_expenses: number;
  updated_expenses: number;
  unchanged: boolean;
  change_value: number;
}

/**
 * Sync one report: update status, reconcile expenses (delete missing,
 * insert new, update changed by value or receipt URL).
 * On 404: marks the report DELETADO and returns early.
 */
export async function syncReportExpenses(
  report: { id: number; name?: string; status?: string },
  onRateLimit?: (waitMs: number) => void
): Promise<ReportSyncResult> {
  if (!sql) throw new Error('Database not available');
  const base: ReportSyncResult = {
    report_id: report.id,
    deleted_report: false,
    status_changed: null,
    deleted_expenses: 0,
    inserted_expenses: 0,
    updated_expenses: 0,
    unchanged: true,
    change_value: 0,
  };

  let detail: ReportDetail;
  try {
    detail = await fetchReportExpenses(report.id, onRateLimit);
  } catch (err) {
    if (err instanceof ReportNotFoundError) {
      await markReportDeleted(report.id);
      base.deleted_report = true;
      base.status_changed = { from: report.status || '', to: 'DELETADO' };
      return base;
    }
    throw err;
  }

  // Status update from detail (listing may lag)
  if (detail.status && detail.status.toUpperCase() !== String(report.status || '').toUpperCase()) {
    await sql`
      UPDATE prestacao_reports
      SET status = ${detail.status}, updated_at = NOW()
      WHERE id = ${report.id}
    `;
    await recordStatusTransition(report.id, report.status || null, detail.status, 'detail');
    base.status_changed = { from: report.status || '', to: detail.status };
  }

  const apiExpenses = detail.expenses;
  const apiIds = new Set(apiExpenses.map((e: any) => e.id));

  // Current DB expenses for this report
  const dbExpenses = await sql`
    SELECT id, value, date::text AS date, raw_data
    FROM prestacao_expenses
    WHERE report_id = ${report.id}
  `;
  const dbIds = new Set<number>(dbExpenses.map((e: any) => e.id));
  const dbVals = new Map<number, number>(dbExpenses.map((e: any) => [e.id, Number(e.value)]));
  const dbDates = new Map<number, string>(
    dbExpenses.map((e: any) => [e.id, String(e.date || '').slice(0, 10)])
  );
  const dbReceipts = new Map<number, string>(
    dbExpenses.map((e: any) => [e.id, e.raw_data?.reicept_url || ''])
  );

  const toDelete: number[] = [...dbIds].filter(id => !apiIds.has(id));
  const toInsert = apiExpenses.filter((e: any) => !dbIds.has(e.id));
  const toUpdate = apiExpenses.filter((e: any) => {
    if (!dbIds.has(e.id)) return false;
    if (Math.abs(Number(e.value) - (dbVals.get(e.id) || 0)) > 0.01) return true;
    if ((e.reicept_url || '') !== (dbReceipts.get(e.id) || '')) return true;
    if (String(e.date || '').slice(0, 10) !== (dbDates.get(e.id) || '')) return true;
    return false;
  });

  if (toDelete.length === 0 && toInsert.length === 0 && toUpdate.length === 0) {
    return base;
  }
  base.unchanged = false;

  // Audit rows are keyed (report_id, expense_id): expenses removed from the
  // report leave orphan audits that inflate audited counts and block
  // auto-approve forever; expenses whose value/receipt/date changed carry a
  // STALE audit computed on old data — both must be re-audited.
  const staleAuditIds = [...toDelete, ...toUpdate.map((e: any) => e.id)];
  if (staleAuditIds.length > 0) {
    await sql`
      DELETE FROM expense_audit_results
      WHERE report_id = ${report.id} AND expense_id = ANY(${staleAuditIds}::int[])
    `;
  }

  if (toDelete.length > 0) {
    await sql`DELETE FROM prestacao_expenses WHERE id = ANY(${toDelete}::int[])`;
    base.deleted_expenses = toDelete.length;
  }

  if (toInsert.length > 0) {
    const BATCH = 50;
    for (let j = 0; j < toInsert.length; j += BATCH) {
      const batch = toInsert.slice(j, j + BATCH);
      const params: any[] = [];
      const groups: string[] = [];
      let pIdx = 1;
      for (const e of batch) {
        groups.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
        params.push(
          e.id, report.id, e.value, e.date || null,
          e.title || e.description || null,
          e.status || detail.status || null,
          JSON.stringify(e)
        );
      }
      await sql.query(
        `INSERT INTO prestacao_expenses (id, report_id, value, date, description, status, raw_data)
         VALUES ${groups.join(', ')}
         ON CONFLICT (id) DO UPDATE SET
           report_id = EXCLUDED.report_id, value = EXCLUDED.value, date = EXCLUDED.date,
           description = EXCLUDED.description, status = EXCLUDED.status, raw_data = EXCLUDED.raw_data`,
        params
      );
    }
    base.inserted_expenses = toInsert.length;
  }

  for (const e of toUpdate) {
    await sql`
      UPDATE prestacao_expenses
      SET value = ${e.value}, date = ${e.date || null},
          description = ${e.title || e.description || null},
          status = ${e.status || detail.status || null}, raw_data = ${JSON.stringify(e)}
      WHERE id = ${e.id}
    `;
  }
  base.updated_expenses = toUpdate.length;

  base.change_value =
    toDelete.reduce((s, id) => s + (dbVals.get(id) || 0), 0) -
    toInsert.reduce((s, e) => s + Number(e.value), 0);

  return base;
}

export interface ExpenseSyncStats {
  processed: number;
  synced: number;
  deleted_reports: number;
  status_updates: number;
  deleted_expenses: number;
  inserted_expenses: number;
  updated_expenses: number;
  unchanged: number;
  errors: { report_id: number; error: string; kind: 'terminal' | 'rate_limit' | 'other' }[];
}

/**
 * Sync expenses for a set of reports with bounded concurrency.
 * Reports already marked DELETADO are skipped by the caller's query.
 */
export async function syncExpensesForReports(
  reports: { id: number; name?: string; status?: string }[],
  options?: {
    concurrency?: number;
    delayMs?: number;
    shouldStop?: () => boolean;
    onRateLimit?: (waitMs: number) => void;
    onReportDone?: (result: ReportSyncResult) => void;
    onProgress?: (processed: number, total: number, currentLabel: string) => void;
  }
): Promise<ExpenseSyncStats> {
  const concurrency = options?.concurrency ?? 1;
  const delayMs = options?.delayMs ?? 300;
  const stats: ExpenseSyncStats = {
    processed: 0, synced: 0, deleted_reports: 0, status_updates: 0,
    deleted_expenses: 0, inserted_expenses: 0, updated_expenses: 0,
    unchanged: 0, errors: [],
  };

  let idx = 0;
  async function worker() {
    while (idx < reports.length) {
      if (options?.shouldStop?.()) return;
      const report = reports[idx++];
      const label = `#${report.id} ${report.name || ''} (${report.status || ''})`;
      try {
        const result = await syncReportExpenses(report, options?.onRateLimit);
        if (result.deleted_report) stats.deleted_reports++;
        if (result.status_changed) stats.status_updates++;
        if (result.unchanged) stats.unchanged++;
        else if (!result.deleted_report) stats.synced++;
        stats.deleted_expenses += result.deleted_expenses;
        stats.inserted_expenses += result.inserted_expenses;
        stats.updated_expenses += result.updated_expenses;
        options?.onReportDone?.(result);
      } catch (err: any) {
        stats.errors.push({
          report_id: report.id,
          error: err?.message || String(err),
          kind: 'other',
        });
      }
      stats.processed++;
      options?.onProgress?.(stats.processed, reports.length, label);
      if (delayMs > 0) await sleep(delayMs);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return stats;
}
