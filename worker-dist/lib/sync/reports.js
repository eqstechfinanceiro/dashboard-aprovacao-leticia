"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchReportsListing = fetchReportsListing;
exports.normalizeCpf = normalizeCpf;
exports.upsertReportsBatch = upsertReportsBatch;
exports.markReportDeleted = markReportDeleted;
exports.recordStatusTransition = recordStatusTransition;
exports.syncReportsFromApi = syncReportsFromApi;
// Canonical report sync: listing fetch, upsert, deletion marking.
// Single source of truth used by sync-expenses, fechamento/sync and pipeline.
const neon_1 = require("../db/neon");
const client_1 = require("./client");
/** Fetch the full v2 reports listing (status + user included). */
async function fetchReportsListing(onRateLimit) {
    if (!client_1.API_KEY)
        throw new Error('VEXPENSES_API_KEY not configured');
    const resp = await (0, client_1.fetchWithRetry)(`${client_1.API_URL}/v2/reports?include=user&per_page=10000`, { headers: (0, client_1.v2Headers)(), signal: AbortSignal.timeout(300000) }, 3, onRateLimit);
    if (!resp.ok)
        throw new Error(`Reports listing API returned ${resp.status}`);
    const data = await resp.json();
    return data.data || [];
}
/** Normalize CPF to digits-only; returns null when empty. */
function normalizeCpf(value) {
    const cpf = String(value ?? '').replace(/\D/g, '');
    return cpf || null;
}
function extractUser(r) {
    const userData = r.user?.data || r.user || {};
    return {
        id: r.user_id || userData.id || null,
        name: r.user_name || userData.name || null,
        cpf: normalizeCpf(r.user_cpf || userData.cpf),
    };
}
/**
 * Canonical upsert for prestacao_reports.
 * Stores raw_data and updated_at; NULL (not '') when CPF is missing so that
 * `user_cpf IS NOT NULL` filters keep working correctly.
 */
async function upsertReportsBatch(reports) {
    if (!neon_1.sql)
        throw new Error('Database not available');
    const db = neon_1.sql;
    let upserted = 0;
    const BATCH = 100;
    for (let i = 0; i < reports.length; i += BATCH) {
        const sub = reports.slice(i, i + BATCH);
        const valueGroups = [];
        const params = [];
        let pIdx = 1;
        for (const r of sub) {
            const user = extractUser(r);
            const placeholders = Array.from({ length: 10 }, () => `$${pIdx++}`);
            valueGroups.push(`(${placeholders.join(', ')})`);
            params.push(r.id, r.name || r.description || null, r.status || null, user.id, user.name, user.cpf, JSON.stringify(r), r.total_value ?? null, r.created_at || null, r.updated_at || null);
        }
        await db.query(`INSERT INTO prestacao_reports
        (id, name, status, user_id, user_name, user_cpf, raw_data, total_value, created_at, updated_at)
       VALUES ${valueGroups.join(', ')}
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         status = EXCLUDED.status,
         user_id = EXCLUDED.user_id,
         user_name = EXCLUDED.user_name,
         user_cpf = EXCLUDED.user_cpf,
         raw_data = EXCLUDED.raw_data,
         total_value = EXCLUDED.total_value,
         updated_at = EXCLUDED.updated_at`, params);
        upserted += sub.length;
    }
    return upserted;
}
/** Mark a report as DELETADO (404 on the API). Returns true if a row changed. */
async function markReportDeleted(reportId) {
    if (!neon_1.sql)
        return false;
    const res = await (0, neon_1.sql) `
    UPDATE prestacao_reports
    SET status = 'DELETADO', updated_at = NOW()
    WHERE id = ${reportId} AND status != 'DELETADO'
    RETURNING id
  `;
    if (res.length > 0) {
        await recordStatusTransition(reportId, null, 'DELETADO', 'sync');
        // The report no longer exists upstream — its audit rows are dead data
        // that would inflate audited counts and mark it as "Auditado" forever.
        try {
            await (0, neon_1.sql) `DELETE FROM expense_audit_results WHERE report_id = ${reportId}`;
        }
        catch {
            // table may not exist yet on fresh databases
        }
    }
    return res.length > 0;
}
// Histórico de transições de status — prestacao_reports só guarda o status
// ATUAL; sem esta tabela é impossível saber que um report foi REPROVADO e depois
// reaberto/reenviado (fluxo real quando o colaborador corrige e reenvia).
let historyTableReady = false;
async function ensureHistoryTable() {
    if (historyTableReady || !neon_1.sql)
        return;
    await (0, neon_1.sql) `
    CREATE TABLE IF NOT EXISTS report_status_history (
      id SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      source TEXT,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
    await (0, neon_1.sql) `CREATE INDEX IF NOT EXISTS idx_report_status_history_report ON report_status_history (report_id, changed_at)`;
    historyTableReady = true;
}
/** Registra uma transição de status (from=null quando o anterior é desconhecido). */
async function recordStatusTransition(reportId, from, to, source) {
    if (!neon_1.sql || !to)
        return;
    try {
        await ensureHistoryTable();
        await (0, neon_1.sql) `
      INSERT INTO report_status_history (report_id, from_status, to_status, source)
      VALUES (${reportId}, ${from}, ${to}, ${source})
    `;
    }
    catch (e) {
        console.error('[reports] recordStatusTransition falhou:', e);
    }
}
/**
 * Discovery: fetch the full listing once, upsert everything (inserts new
 * reports, refreshes status/user data), and mark DELETADO reports present in
 * DB but absent from the API listing (guarded: only when the listing is big
 * enough to be trusted as complete).
 */
async function syncReportsFromApi(options) {
    if (!neon_1.sql)
        throw new Error('Database not available');
    const apiReports = await fetchReportsListing(options?.onRateLimit);
    // Current DB state for diffing
    const existing = await (0, neon_1.sql) `SELECT id, status, user_cpf FROM prestacao_reports`;
    const existingStatus = new Map(existing.map((r) => [r.id, r.status || '']));
    const existingIds = new Set(existing.map((r) => r.id));
    const newReports = apiReports.filter(r => r.id && !existingIds.has(r.id));
    const withoutCpf = apiReports.filter(r => !extractUser(r).cpf).length;
    // Status changes (listing status vs DB status)
    const statusChanges = [];
    for (const r of apiReports) {
        const prev = existingStatus.get(r.id);
        if (prev !== undefined && r.status && prev.toUpperCase() !== r.status.toUpperCase()) {
            statusChanges.push({ id: r.id, name: r.name || '', from: prev, to: r.status });
        }
    }
    const upserted = await upsertReportsBatch(apiReports);
    // Persiste transições — ex.: REPROVADO→ENVIADO quando o colaborador reenvia
    for (const ch of statusChanges) {
        await recordStatusTransition(ch.id, ch.from, ch.to, 'listing');
    }
    // Reports in DB but absent from listing → deleted on VExpenses side.
    // Guard: only trust the listing as complete when it's reasonably large.
    let markedDeleted = 0;
    if (options?.markMissingDeleted && apiReports.length > 1000) {
        const apiIds = new Set(apiReports.map(r => r.id));
        const missing = existing
            .map((r) => r.id)
            .filter((id) => !apiIds.has(id));
        for (const id of missing) {
            if (await markReportDeleted(id))
                markedDeleted++;
        }
    }
    return {
        api_total: apiReports.length,
        new_reports_found: newReports.length,
        upserted,
        status_changes: statusChanges.length,
        marked_deleted: markedDeleted,
        reports_without_cpf: withoutCpf,
        status_changes_detail: statusChanges.slice(0, 100),
    };
}
