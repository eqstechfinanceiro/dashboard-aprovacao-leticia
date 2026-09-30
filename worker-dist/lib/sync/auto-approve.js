"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTO_APPROVE_COMMENT = exports.AUTO_APPROVE_KEY = void 0;
exports.isAutoApproveEnabled = isAutoApproveEnabled;
exports.findAutoApprovableReports = findAutoApprovableReports;
exports.runAutoApprove = runAutoApprove;
// Auto-approve: CAIXA reports where EVERY expense was approved by the bot
// (status APROVADO_BOT in expense_audit_results — no human-reviewed expenses)
// get approved in VExpenses with comment "Despesa aprovada automaticamente pelo Aery Bot".
const neon_1 = require("../db/neon");
const settings_1 = require("../db/settings");
const report_filters_1 = require("../rules/report-filters");
const tracking_1 = require("./tracking");
const laravel_token_1 = require("../api/laravel-token");
const client_1 = require("./client");
const reports_1 = require("./reports");
exports.AUTO_APPROVE_KEY = 'auto_approve_enabled';
exports.AUTO_APPROVE_COMMENT = 'Despesa aprovada automaticamente pelo Aery Bot';
const CARD_PAYMENT_METHOD_ID = '627401'; // cartão corporativo → FATURA
const DEFAULT_APPROVER_ID = 891904;
async function isAutoApproveEnabled() {
    const v = await (0, settings_1.getSetting)(exports.AUTO_APPROVE_KEY);
    return v === true;
}
let logTableEnsured = false;
async function ensureLogTable() {
    if (logTableEnsured || !neon_1.sql)
        return;
    await (0, neon_1.sql) `
    CREATE TABLE IF NOT EXISTS auto_approve_log (
      id SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL,
      report_name TEXT,
      expense_count INTEGER,
      status VARCHAR(20) NOT NULL,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
    await (0, neon_1.sql) `CREATE INDEX IF NOT EXISTS idx_auto_approve_log_report ON auto_approve_log(report_id)`;
    logTableEnsured = true;
}
async function logResult(reportId, name, expenseCount, status, error) {
    if (!neon_1.sql)
        return;
    await ensureLogTable();
    await (0, neon_1.sql) `
    INSERT INTO auto_approve_log (report_id, report_name, expense_count, status, error)
    VALUES (${reportId}, ${name || null}, ${expenseCount}, ${status}, ${error || null})
  `;
}
/**
 * Live check against the VExpenses web API (same endpoint the approval UI
 * uses). GET /web/approvals/{id} returns data only when the session user can
 * act on the report right now — reports sitting at another approver's step
 * (or already in a final state) answer success:false with error 110001001.
 * This is authoritative and real-time, unlike the approval-tracking Excel
 * which lags up to ~10min and defaults missing reports to step 1.
 * 'unknown' = request/session failed → caller should keep legacy behavior.
 */
async function checkWebApprovalAccess(reportId, cookie) {
    try {
        const resp = await fetch(`https://api.vexpenses.com/web/approvals/${reportId}`, {
            headers: { Cookie: cookie, Accept: 'application/json' },
            signal: AbortSignal.timeout(15000),
        });
        if (resp.status === 401 || resp.status === 403 || resp.status === 419)
            return 'unknown';
        if (!resp.ok)
            return 'unknown';
        const j = await resp.json();
        return j?.success && j?.data ? 'actionable' : 'blocked';
    }
    catch {
        return 'unknown';
    }
}
/**
 * Candidate reports: status ENVIADO, name is not FATURA/CARTAO, has expenses,
 * no expense uses the corporate-card payment method (627401), and EVERY expense
 * has an audit row with status APROVADO_BOT.
 * Split into `ready` (current step ≤ 1) and `waitingNextStep` (step 2+), using
 * the tracking map plus live-verified skips from auto_approve_log — a report
 * whose latest log row is skipped_step and that hasn't been updated since is
 * known to sit at a later step even when the tracking Excel is stale.
 */
async function findAutoApprovableReports() {
    const empty = { ready: [], waitingNextStep: [] };
    if (!neon_1.sql)
        return empty;
    await ensureLogTable();
    const rows = await (0, neon_1.sql) `
    SELECT r.id, r.name, r.updated_at, COUNT(pe.id)::int AS expense_count,
           l.status AS last_log_status, l.created_at AS last_log_at
    FROM prestacao_reports r
    JOIN prestacao_expenses pe ON pe.report_id = r.id
    LEFT JOIN LATERAL (
      SELECT status, created_at FROM auto_approve_log
      WHERE report_id = r.id ORDER BY created_at DESC LIMIT 1
    ) l ON true
    WHERE r.status ILIKE 'ENVIADO'
      AND r.user_cpf IS NOT NULL
    GROUP BY r.id, r.name, r.updated_at, l.status, l.created_at
    HAVING COUNT(*) FILTER (WHERE COALESCE(pe.raw_data->>'payment_method_id', '') = ${CARD_PAYMENT_METHOD_ID}) = 0
  `;
    const candidates = rows.filter(r => !(0, report_filters_1.isFaturaOrCartao)(r.name || ''));
    const waitingMap = await (0, tracking_1.getWaitingStepMap)();
    const result = { ready: [], waitingNextStep: [] };
    for (const r of candidates) {
        // Every expense must have an audit row with status APROVADO_BOT —
        // any other status (incl. human-reviewed) disqualifies the report.
        const audit = await (0, neon_1.sql) `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ar.status = 'APROVADO_BOT')::int AS bot,
        COUNT(*) FILTER (WHERE ar.status <> 'APROVADO_BOT')::int AS other
      FROM expense_audit_results ar
      WHERE ar.report_id = ${r.id}
        AND EXISTS (
          SELECT 1 FROM prestacao_expenses pe
          WHERE pe.report_id = ar.report_id AND pe.id = ar.expense_id
        )
    `;
        const a = audit[0];
        if (!(a.total === r.expense_count && a.other === 0 && a.bot === r.expense_count && r.expense_count > 0))
            continue;
        // Step comes from live history-derived tracking. Unknown (absent from the
        // map) must NOT default to 1 — approving blind is the dangerous direction;
        // route to waitingNextStep until tracking verifies the step.
        const step = waitingMap.get(r.id);
        const freshSkip = r.last_log_status === 'skipped_step' &&
            r.last_log_at && r.updated_at &&
            new Date(r.last_log_at).getTime() > new Date(r.updated_at).getTime();
        const item = { id: r.id, name: r.name, expense_count: r.expense_count, step: step ?? 0 };
        if (step === 1 && !freshSkip)
            result.ready.push(item);
        else
            result.waitingNextStep.push(item);
    }
    // Live verification: the tracking Excel lags ~10min and defaults missing
    // reports to step 1, so `ready` may contain reports already past step 1.
    // GET /web/approvals/{id} answers in real time whether the session user
    // can act on the report — eliminates probing VExpenses with doomed 422s.
    // Without a valid cookie we keep the legacy probe-and-skip behavior.
    if (result.ready.length > 0) {
        const cookie = await (0, laravel_token_1.getLaravelCookieString)();
        if (cookie) {
            const verified = [];
            const CHUNK = 6;
            for (let i = 0; i < result.ready.length; i += CHUNK) {
                const chunk = result.ready.slice(i, i + CHUNK);
                const access = await Promise.all(chunk.map(r => checkWebApprovalAccess(r.id, cookie)));
                for (let j = 0; j < chunk.length; j++) {
                    const item = chunk[j];
                    if (access[j] === 'blocked') {
                        result.waitingNextStep.push(item);
                        await logResult(item.id, item.name, item.expense_count, 'skipped_step', `etapa atual não é da aprovadora — verificado via API web (sem tentativa de aprovação)`);
                    }
                    else {
                        // 'actionable' → session can approve now; 'unknown' → keep legacy probe
                        verified.push(item);
                    }
                }
            }
            result.ready = verified;
        }
    }
    return result;
}
function isNotApproverError(status, text) {
    return status === 422 && text.includes('not an approver in this step');
}
class StepSkip extends Error {
    constructor(msg) { super(msg); this.name = 'StepSkip'; }
}
/**
 * Approve a single report in VExpenses as the Aery Bot.
 * ALWAYS approves as `approverId` (Letícia, step 1). If the report is at a
 * later step where she isn't a valid approver, VExpenses answers 422
 * "not an approver in this step" and we throw StepSkip — the report is left
 * for the human approver of that step. Never tries other approvers.
 * Returns the report's live status after the approval (ENVIADO if the flow
 * still has pending steps, APROVADO when it was the last one).
 */
async function approveReportAsBot(reportId, approverId) {
    // Re-verify live status + get expense ids for the payload
    const detail = await (0, client_1.fetchWithRetry)(`${client_1.API_URL}/v2/reports/${reportId}?include=expenses`, { headers: { Authorization: client_1.API_KEY, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (!detail.ok)
        throw new Error(`detail fetch HTTP ${detail.status}`);
    const detailData = await detail.json();
    const report = detailData.data || detailData;
    if (report.status && String(report.status).toUpperCase() !== 'ENVIADO') {
        throw new Error(`Report não está mais ENVIADO (atual: ${report.status})`);
    }
    const expensesPayload = {};
    for (const exp of report?.expenses?.data || []) {
        expensesPayload[String(exp.id)] = true;
    }
    const resp = await (0, client_1.fetchWithRetry)(`${client_1.API_URL}/v2/reports/${reportId}/approve`, {
        method: 'POST',
        headers: {
            Authorization: client_1.API_KEY,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            approver: approverId,
            comment: exports.AUTO_APPROVE_COMMENT,
            expenses: expensesPayload,
        }),
        signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) {
        const text = await resp.text();
        if (isNotApproverError(resp.status, text)) {
            throw new StepSkip(`etapa atual não é da aprovadora ${approverId} — aguardando aprovador humano`);
        }
        throw new Error(`approve HTTP ${resp.status}: ${text.slice(0, 300)}`);
    }
    // One call approves ONE step. If the flow has more applicable steps the
    // report stays ENVIADO at a new stage — store the real status.
    const after = await (0, client_1.fetchWithRetry)(`${client_1.API_URL}/v2/reports/${reportId}`, { headers: { Authorization: client_1.API_KEY, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (after.ok) {
        const afterData = await after.json();
        return String((afterData.data || afterData).status || 'ENVIADO').toUpperCase();
    }
    return 'ENVIADO';
}
async function runAutoApprove(approverId) {
    const result = { enabled: false, candidates: 0, waiting_next_step: 0, approved: 0, skipped_step: 0, failed: [] };
    if (!neon_1.sql)
        return result;
    if (!(await isAutoApproveEnabled()))
        return result;
    result.enabled = true;
    const { ready, waitingNextStep } = await findAutoApprovableReports();
    result.candidates = ready.length;
    result.waiting_next_step = waitingNextStep.length;
    // Only ever approve as this user — if the report already moved to a step
    // where she isn't an approver, the API answers 422 and we skip it.
    const approver = approverId ?? DEFAULT_APPROVER_ID;
    for (const r of ready) {
        try {
            const statusAfter = await approveReportAsBot(r.id, approver);
            // The approval advanced one step; the report is fully approved only
            // when VExpenses reports APROVADO. Persist the real status.
            await (0, neon_1.sql) `UPDATE prestacao_reports SET status = ${statusAfter}, updated_at = NOW() WHERE id = ${r.id}`;
            await (0, reports_1.recordStatusTransition)(r.id, null, statusAfter, 'auto-approve');
            await (0, neon_1.sql) `
        CREATE TABLE IF NOT EXISTS report_approvals (
          report_id INT PRIMARY KEY,
          approver_name TEXT,
          approver_user_id INT,
          observation TEXT,
          approved_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;
            await (0, neon_1.sql) `
        INSERT INTO report_approvals (report_id, approver_name, approver_user_id, observation)
        VALUES (${r.id}, 'Aery Bot', ${approver}, 'auto')
        ON CONFLICT (report_id) DO UPDATE SET
          approver_name = 'Aery Bot',
          approver_user_id = EXCLUDED.approver_user_id,
          observation = 'auto',
          approved_at = NOW()
      `;
            // Invalidate pending-list caches (api_cache is shared Postgres, so this
            // removes the report from the aprovação-dinâmica page for all users)
            await (0, neon_1.sql) `DELETE FROM api_cache WHERE cache_key IN (
        'vexpenses-data:reports-enviado',
        'vexpenses-data:reports-reprovado',
        'vexpenses-data:approval-tracking',
        ${'vexpenses-data:report-expenses:' + r.id}
      )`.catch(() => { });
            const done = statusAfter === 'APROVADO';
            await logResult(r.id, r.name, r.expense_count, done ? 'approved' : 'step_approved');
            result.approved++;
            console.log(`[AutoApprove] Report ${r.id} (${r.name}) etapa aprovada pelo bot — status: ${statusAfter}`);
        }
        catch (err) {
            const msg = err?.message || String(err);
            if (err instanceof StepSkip) {
                result.skipped_step++;
                await logResult(r.id, r.name, r.expense_count, 'skipped_step', msg);
                console.log(`[AutoApprove] Report ${r.id} pulado: ${msg}`);
            }
            else {
                result.failed.push({ report_id: r.id, error: msg });
                await logResult(r.id, r.name, r.expense_count, 'failed', msg);
                console.error(`[AutoApprove] Report ${r.id} falhou: ${msg}`);
            }
        }
        await (0, client_1.sleep)(500); // be kind to the API
    }
    return result;
}
