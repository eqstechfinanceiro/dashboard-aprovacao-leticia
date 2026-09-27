"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * comprovantes-worker — processa fila comprovantes_runs (PM2 app `comprovantes-worker`).
 *
 * Loop: a cada 10s tenta pegar lock + claim do próximo run 'queued' e processa.
 * E2DOC permanece em dry-run até app_settings.e2doc_send_enabled === true.
 * Upload ao SharePoint destino gateado por app_settings.comprovantes_upload_enabled.
 */
require("dotenv/config");
const dotenv_1 = require("dotenv");
const path_1 = __importDefault(require("path"));
(0, dotenv_1.config)({ path: path_1.default.resolve(process.cwd(), '.env.local') });
const neon_1 = require("../lib/db/neon");
const db_1 = require("../lib/comprovantes/db");
const pipeline_1 = require("../lib/comprovantes/pipeline");
const sharepoint_1 = require("../lib/comprovantes/sharepoint");
const POLL_MS = 10 * 1000;
const LOCK_ID = 8675311;
async function acquireLock() {
    const rows = await (0, neon_1.sql) `SELECT pg_try_advisory_lock(${LOCK_ID}) AS ok`;
    return !!rows[0]?.ok;
}
async function releaseLock() {
    try {
        await (0, neon_1.sql) `SELECT pg_advisory_unlock(${LOCK_ID})`;
    }
    catch { }
}
async function tick() {
    if (!(await acquireLock()))
        return;
    try {
        const run = await (0, db_1.claimNextRun)();
        if (!run)
            return;
        console.log(`[comprovantes] run #${run.id} iniciado: ${run.source} ${run.year}/${run.month_folder}/${run.bank}/${run.date_folder}`);
        await (0, pipeline_1.processRun)(run);
        console.log(`[comprovantes] run #${run.id} finalizado`);
    }
    finally {
        releaseLock();
    }
}
async function main() {
    if (!neon_1.sql) {
        console.error('[comprovantes] DB indisponível');
        process.exit(1);
    }
    await (0, db_1.ensureComprovantesTables)();
    console.log('[comprovantes] worker iniciado');
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            await tick();
        }
        catch (err) {
            console.error('[comprovantes] erro no tick:', err);
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
    }
}
process.on('SIGTERM', async () => { await (0, sharepoint_1.closeSpBrowser)(); process.exit(0); });
process.on('SIGINT', async () => { await (0, sharepoint_1.closeSpBrowser)(); process.exit(0); });
main().catch((e) => { console.error('[comprovantes] fatal:', e); process.exit(1); });
