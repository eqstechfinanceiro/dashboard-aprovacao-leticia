"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportNotFoundError = void 0;
exports.fetchReportExpenses = fetchReportExpenses;
exports.syncReportExpenses = syncReportExpenses;
exports.syncExpensesForReports = syncExpensesForReports;
// Canonical expense sync per report.
// Single source of truth: fetch report detail from v2, mark 404 as DELETADO,
// update status if changed, and reconcile expenses (delete/insert/update).
const neon_1 = require("../db/neon");
const client_1 = require("./client");
const reports_1 = require("./reports");
class ReportNotFoundError extends Error {
    constructor(reportId) {
        super(`Report ${reportId} not found (404)`);
        this.reportId = reportId;
    }
}
exports.ReportNotFoundError = ReportNotFoundError;
/** Fetch a single report's detail with expenses (v2). Throws ReportNotFoundError on 404. */
async function fetchReportExpenses(reportId, onRateLimit) {
    const resp = await (0, client_1.fetchWithRetry)(`${client_1.API_URL}/v2/reports/${reportId}?include=expenses.user`, { headers: (0, client_1.v2Headers)(), signal: AbortSignal.timeout(30000) }, 3, onRateLimit);
    if (resp.status === 404)
        throw new ReportNotFoundError(reportId);
    if (!resp.ok)
        throw new Error(`Report ${reportId}: API returned ${resp.status}`);
    const data = await resp.json();
    const report = data.data || data;
    return {
        status: report?.status || null,
        expenses: report?.expenses?.data || [],
    };
}
/**
 * Sync one report: update status, reconcile expenses (delete missing,
 * insert new, update changed by value or receipt URL).
 * On 404: marks the report DELETADO and returns early.
 */
async function syncReportExpenses(report, onRateLimit) {
    if (!neon_1.sql)
        throw new Error('Database not available');
    const base = {
        report_id: report.id,
        deleted_report: false,
        status_changed: null,
        deleted_expenses: 0,
        inserted_expenses: 0,
        updated_expenses: 0,
        unchanged: true,
        change_value: 0,
    };
    let detail;
    try {
        detail = await fetchReportExpenses(report.id, onRateLimit);
    }
    catch (err) {
        if (err instanceof ReportNotFoundError) {
            await (0, reports_1.markReportDeleted)(report.id);
            base.deleted_report = true;
            base.status_changed = { from: report.status || '', to: 'DELETADO' };
            return base;
        }
        throw err;
    }
    // Status update from detail (listing may lag)
    if (detail.status && detail.status.toUpperCase() !== String(report.status || '').toUpperCase()) {
        await (0, neon_1.sql) `
      UPDATE prestacao_reports
      SET status = ${detail.status}, updated_at = NOW()
      WHERE id = ${report.id}
    `;
        await (0, reports_1.recordStatusTransition)(report.id, report.status || null, detail.status, 'detail');
        base.status_changed = { from: report.status || '', to: detail.status };
    }
    const apiExpenses = detail.expenses;
    const apiIds = new Set(apiExpenses.map((e) => e.id));
    // Current DB expenses for this report
    const dbExpenses = await (0, neon_1.sql) `
    SELECT id, value, raw_data
    FROM prestacao_expenses
    WHERE report_id = ${report.id}
  `;
    const dbIds = new Set(dbExpenses.map((e) => e.id));
    const dbVals = new Map(dbExpenses.map((e) => [e.id, Number(e.value)]));
    const dbReceipts = new Map(dbExpenses.map((e) => [e.id, e.raw_data?.reicept_url || '']));
    const toDelete = [...dbIds].filter(id => !apiIds.has(id));
    const toInsert = apiExpenses.filter((e) => !dbIds.has(e.id));
    const toUpdate = apiExpenses.filter((e) => {
        if (!dbIds.has(e.id))
            return false;
        if (Math.abs(Number(e.value) - (dbVals.get(e.id) || 0)) > 0.01)
            return true;
        if ((e.reicept_url || '') !== (dbReceipts.get(e.id) || ''))
            return true;
        return false;
    });
    if (toDelete.length === 0 && toInsert.length === 0 && toUpdate.length === 0) {
        return base;
    }
    base.unchanged = false;
    if (toDelete.length > 0) {
        await (0, neon_1.sql) `DELETE FROM prestacao_expenses WHERE id = ANY(${toDelete}::int[])`;
        base.deleted_expenses = toDelete.length;
    }
    if (toInsert.length > 0) {
        const BATCH = 50;
        for (let j = 0; j < toInsert.length; j += BATCH) {
            const batch = toInsert.slice(j, j + BATCH);
            const params = [];
            const groups = [];
            let pIdx = 1;
            for (const e of batch) {
                groups.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
                params.push(e.id, report.id, e.value, e.date || null, e.title || e.description || null, e.status || detail.status || null, JSON.stringify(e));
            }
            await neon_1.sql.query(`INSERT INTO prestacao_expenses (id, report_id, value, date, description, status, raw_data)
         VALUES ${groups.join(', ')}
         ON CONFLICT (id) DO UPDATE SET
           report_id = EXCLUDED.report_id, value = EXCLUDED.value, date = EXCLUDED.date,
           description = EXCLUDED.description, status = EXCLUDED.status, raw_data = EXCLUDED.raw_data`, params);
        }
        base.inserted_expenses = toInsert.length;
    }
    for (const e of toUpdate) {
        await (0, neon_1.sql) `
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
/**
 * Sync expenses for a set of reports with bounded concurrency.
 * Reports already marked DELETADO are skipped by the caller's query.
 */
async function syncExpensesForReports(reports, options) {
    const concurrency = options?.concurrency ?? 1;
    const delayMs = options?.delayMs ?? 300;
    const stats = {
        processed: 0, synced: 0, deleted_reports: 0, status_updates: 0,
        deleted_expenses: 0, inserted_expenses: 0, updated_expenses: 0,
        unchanged: 0, errors: [],
    };
    let idx = 0;
    async function worker() {
        while (idx < reports.length) {
            if (options?.shouldStop?.())
                return;
            const report = reports[idx++];
            const label = `#${report.id} ${report.name || ''} (${report.status || ''})`;
            try {
                const result = await syncReportExpenses(report, options?.onRateLimit);
                if (result.deleted_report)
                    stats.deleted_reports++;
                if (result.status_changed)
                    stats.status_updates++;
                if (result.unchanged)
                    stats.unchanged++;
                else if (!result.deleted_report)
                    stats.synced++;
                stats.deleted_expenses += result.deleted_expenses;
                stats.inserted_expenses += result.inserted_expenses;
                stats.updated_expenses += result.updated_expenses;
                options?.onReportDone?.(result);
            }
            catch (err) {
                stats.errors.push({
                    report_id: report.id,
                    error: err?.message || String(err),
                    kind: 'other',
                });
            }
            stats.processed++;
            options?.onProgress?.(stats.processed, reports.length, label);
            if (delayMs > 0)
                await (0, client_1.sleep)(delayMs);
        }
    }
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    return stats;
}
