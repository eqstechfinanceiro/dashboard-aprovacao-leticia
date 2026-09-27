"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureAuditTable = ensureAuditTable;
exports.saveAuditResult = saveAuditResult;
exports.getAuditResultsForReport = getAuditResultsForReport;
exports.getAuditedReportIds = getAuditedReportIds;
const neon_1 = require("./neon");
let tableEnsured = false;
async function ensureAuditTable() {
    if (tableEnsured || !neon_1.sql)
        return;
    try {
        await (0, neon_1.sql) `
      CREATE TABLE IF NOT EXISTS expense_audit_results (
        id SERIAL PRIMARY KEY,
        report_id INTEGER NOT NULL,
        expense_id INTEGER NOT NULL,
        status VARCHAR(20) NOT NULL,
        extracted_data JSONB,
        informed_data JSONB,
        divergences JSONB,
        rules_triggered JSONB,
        summary TEXT,
        audited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        audited_by VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(report_id, expense_id)
      )
    `;
        await (0, neon_1.sql) `ALTER TABLE expense_audit_results ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1`;
        await (0, neon_1.sql) `CREATE INDEX IF NOT EXISTS idx_audit_report ON expense_audit_results(report_id)`;
        await (0, neon_1.sql) `CREATE INDEX IF NOT EXISTS idx_audit_status ON expense_audit_results(status)`;
        tableEnsured = true;
        console.log('[Audit DB] Table ensured');
    }
    catch (error) {
        console.error('[Audit DB] Error ensuring table:', error);
    }
}
async function saveAuditResult(record) {
    if (!neon_1.sql)
        return;
    try {
        await (0, neon_1.sql) `
      INSERT INTO expense_audit_results
        (report_id, expense_id, status, extracted_data, informed_data, divergences, rules_triggered, summary, audited_by)
      VALUES
        (${record.report_id}, ${record.expense_id}, ${record.status}, ${JSON.stringify(record.extracted_data)}, ${JSON.stringify(record.informed_data)}, ${JSON.stringify(record.divergences)}, ${JSON.stringify(record.rules_triggered)}, ${record.summary}, ${record.audited_by || null})
      ON CONFLICT (report_id, expense_id) DO UPDATE SET
        status = EXCLUDED.status,
        extracted_data = EXCLUDED.extracted_data,
        informed_data = EXCLUDED.informed_data,
        divergences = EXCLUDED.divergences,
        rules_triggered = EXCLUDED.rules_triggered,
        summary = EXCLUDED.summary,
        audited_at = NOW(),
        audited_by = EXCLUDED.audited_by,
        attempts = expense_audit_results.attempts + 1
    `;
    }
    catch (error) {
        console.error('[Audit DB] Error saving result:', error);
        throw error;
    }
}
async function getAuditResultsForReport(reportId) {
    if (!neon_1.sql) {
        console.log('[Audit DB] sql is null, returning empty');
        return [];
    }
    try {
        const rows = await (0, neon_1.sql) `
      SELECT id, report_id, expense_id, status,
             extracted_data::text as extracted_data,
             informed_data::text as informed_data,
             divergences::text as divergences,
             rules_triggered::text as rules_triggered,
             summary, audited_at, audited_by, created_at
      FROM expense_audit_results
      WHERE report_id = ${reportId}
      ORDER BY expense_id
    `;
        const parsed = rows.map((r) => ({
            ...r,
            extracted_data: r.extracted_data ? JSON.parse(r.extracted_data) : null,
            informed_data: r.informed_data ? JSON.parse(r.informed_data) : null,
            divergences: r.divergences ? JSON.parse(r.divergences) : null,
            rules_triggered: r.rules_triggered ? JSON.parse(r.rules_triggered) : null,
        }));
        return parsed;
    }
    catch (error) {
        console.error('[Audit DB] Error fetching results:', error);
        return [];
    }
}
async function getAuditedReportIds() {
    if (!neon_1.sql)
        return new Set();
    try {
        const rows = await (0, neon_1.sql) `
      SELECT DISTINCT report_id FROM expense_audit_results
    `;
        return new Set(rows.map((r) => r.report_id));
    }
    catch (error) {
        console.error('[Audit DB] Error fetching audited IDs:', error);
        return new Set();
    }
}
