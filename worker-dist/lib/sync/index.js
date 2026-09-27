"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runGlobalSync = runGlobalSync;
// lib/sync — canonical sync entry points.
// All sync logic lives here; API routes are thin wrappers.
__exportStar(require("./client"), exports);
__exportStar(require("./reports"), exports);
__exportStar(require("./expenses"), exports);
__exportStar(require("./extrato"), exports);
__exportStar(require("./cadastro"), exports);
__exportStar(require("./somase"), exports);
const neon_1 = require("../db/neon");
const reports_1 = require("./reports");
const expenses_1 = require("./expenses");
/**
 * Global sync: discovery (listing → upsert all reports) then per-report
 * expense reconciliation. quick mode only processes reports that can still
 * change (non-final status or created in the last 45 days).
 */
async function runGlobalSync(options = {}) {
    if (!neon_1.sql)
        throw new Error('Database not available');
    const mode = options.mode === 'quick' ? 'quick' : 'full';
    let discovery = null;
    if (!options.skipDiscovery) {
        discovery = await (0, reports_1.syncReportsFromApi)({ onRateLimit: options.onRateLimit });
    }
    const reports = mode === 'quick'
        ? await (0, neon_1.sql) `
        SELECT DISTINCT r.id, r.name, r.status, r.user_cpf
        FROM prestacao_reports r
        WHERE r.user_cpf IS NOT NULL
          AND r.status != 'DELETADO'
          AND (
            r.status NOT ILIKE 'Aprovado'
            AND r.status NOT ILIKE 'Enviado'
            OR r.created_at >= NOW() - INTERVAL '45 days'
          )
        ORDER BY r.id
      `
        : await (0, neon_1.sql) `
        SELECT DISTINCT r.id, r.name, r.status, r.user_cpf
        FROM prestacao_reports r
        WHERE r.user_cpf IS NOT NULL
          AND r.status != 'DELETADO'
        ORDER BY r.id
      `;
    const toProcess = options.limit && options.limit > 0
        ? reports.slice(0, options.limit)
        : reports;
    const expenses = await (0, expenses_1.syncExpensesForReports)(toProcess, {
        concurrency: 1,
        delayMs: options.delayMs ?? 300,
        shouldStop: options.shouldStop,
        onRateLimit: options.onRateLimit,
        onReportDone: options.onReportDone,
        onProgress: options.onProgress,
    });
    return { discovery, expenses };
}
