"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.snapshotSomase = snapshotSomase;
// Per-quinzena snapshots (somase + expense detail) — moved from pipeline.ts.
const neon_1 = require("../db/neon");
const quinzena_dates_1 = require("../pipeline/quinzena-dates");
const report_filters_1 = require("../rules/report-filters");
/** Create somase snapshot from current API data.
 *  Also snapshots the previous quinzena if it doesn't have one yet,
 *  so the delta calculation (somase_atual - somase_prev) is temporally consistent. */
async function snapshotSomase(quinzenaId) {
    if (!neon_1.sql)
        throw new Error('Database not available');
    const prevQuinzenaId = (0, quinzena_dates_1.getPreviousQuinzenaId)(quinzenaId);
    const prevCheck = await (0, neon_1.sql) `SELECT COUNT(*) as cnt FROM somase_snapshots WHERE quinzena = ${prevQuinzenaId}`;
    const prevExists = prevCheck[0]?.cnt > 0;
    const prevSnapshotted = !prevExists ? await snapshotSingleQuinzena(prevQuinzenaId) : 0;
    let prevExpenseSnaps = 0;
    if (!prevExists || !((await (0, neon_1.sql) `SELECT COUNT(*) as cnt FROM prestacao_expense_snapshots WHERE quinzena = ${prevQuinzenaId}`)[0]?.cnt > 0)) {
        prevExpenseSnaps = await snapshotExpenseSnapshots(prevQuinzenaId);
    }
    const inserted = await snapshotSingleQuinzena(quinzenaId);
    const snapInserted = await snapshotExpenseSnapshots(quinzenaId);
    return {
        somase_cpfs: inserted,
        somase_total: (await (0, neon_1.sql) `SELECT SUM(total) as t FROM somase_snapshots WHERE quinzena = ${quinzenaId}`)[0]?.t || 0,
        expense_snapshots: snapInserted,
        prev_quinzena: prevQuinzenaId,
        prev_quinzena_snapshotted: prevSnapshotted > 0,
        prev_quinzena_expense_snapshots: prevExpenseSnaps,
    };
}
/** Snapshot a single quinzena's somase from current APROVADO+ENVIADO data (cumulative, filtered by cutoff) */
async function snapshotSingleQuinzena(quinzenaId) {
    if (!neon_1.sql)
        throw new Error('Database not available');
    const cutoff = (0, quinzena_dates_1.getQuinzenaCutoff)(quinzenaId);
    const reportRows = await (0, neon_1.sql) `
    SELECT r.id, r.name
    FROM prestacao_reports r
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
      AND COALESCE((r.raw_data->>'approval_date')::timestamp, r.updated_at, '1970-01-01'::timestamp) <= ${cutoff + ' 23:59:59'}
  `;
    const validReportIds = reportRows
        .filter((r) => !(0, report_filters_1.isFaturaOrCartao)(r.name || ''))
        .map((r) => r.id);
    if (validReportIds.length === 0)
        return 0;
    await (0, neon_1.sql) `DELETE FROM somase_snapshots WHERE quinzena = ${quinzenaId}`;
    const insertResult = await (0, neon_1.sql) `
    INSERT INTO somase_snapshots (quinzena, user_cpf, total)
    SELECT ${quinzenaId}, pr.user_cpf, SUM(pe.value) as total
    FROM prestacao_expenses pe
    JOIN prestacao_reports pr ON pe.report_id = pr.id
    WHERE pr.id = ANY(${validReportIds})
      AND COALESCE(pe.raw_data->>'payment_method_id', '') != '627401'
    GROUP BY pr.user_cpf
    ON CONFLICT (quinzena, user_cpf) DO UPDATE SET total = EXCLUDED.total
    RETURNING 1
  `;
    return insertResult.length;
}
/** Snapshot expense_snapshots for a single quinzena (cumulative, filtered by cutoff) */
async function snapshotExpenseSnapshots(quinzenaId) {
    if (!neon_1.sql)
        throw new Error('Database not available');
    const cutoff = (0, quinzena_dates_1.getQuinzenaCutoff)(quinzenaId);
    const reportRows = await (0, neon_1.sql) `
    SELECT r.id, r.name
    FROM prestacao_reports r
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
      AND COALESCE((r.raw_data->>'approval_date')::timestamp, r.updated_at, '1970-01-01'::timestamp) <= ${cutoff + ' 23:59:59'}
  `;
    const validReportIds = reportRows
        .filter((r) => !(0, report_filters_1.isFaturaOrCartao)(r.name || ''))
        .map((r) => r.id);
    if (validReportIds.length === 0)
        return 0;
    await (0, neon_1.sql) `DELETE FROM prestacao_expense_snapshots WHERE quinzena = ${quinzenaId}`;
    const snapResult = await (0, neon_1.sql) `
    INSERT INTO prestacao_expense_snapshots (id, quinzena, value, user_cpf)
    SELECT pe.id, ${quinzenaId}, pe.value, pr.user_cpf
    FROM prestacao_expenses pe
    JOIN prestacao_reports pr ON pe.report_id = pr.id
    WHERE pr.id = ANY(${validReportIds})
      AND COALESCE(pe.raw_data->>'payment_method_id', '') != '627401'
    ON CONFLICT (id, quinzena) DO UPDATE SET value = EXCLUDED.value, user_cpf = EXCLUDED.user_cpf
    RETURNING 1
  `;
    return snapResult.length;
}
