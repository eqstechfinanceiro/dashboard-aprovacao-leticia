/**
 * sync-worker — dedicated background sync process (runs under PM2 as `sync-worker`).
 *
 * Tiers:
 *   HOT  (5 min):  reports listing + expense reconciliation for mutable reports
 *   WARM (45 min): incremental extrato (2-day overlap) + cadastro refresh + token keepalive
 *   COLD (daily):  extrato with 30-day overlap (catches late-settling card transactions)
 *
 * Durability: sync_runs / sync_run_errors tables; advisory lock prevents concurrent runs.
 * Frozen quinzenas are never touched — this only writes live source tables.
 */
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import path from 'path';

// Load .env.local explicitly (dotenv/config already tried .env)
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

import { sql } from '../lib/db/neon';
import { runGlobalSync } from '../lib/sync';
import { downloadExtrato } from '../lib/sync/extrato';
import { refreshCadastro } from '../lib/sync/cadastro';
import { runAutoApprove } from '../lib/sync/auto-approve';
import { runAutoAudit } from '../lib/sync/auto-audit';
import { generateInactiveAlerts } from '../lib/sync/inactive-alerts';
import {
  generateSyncFailureNotifications,
  generateApprovalDigest,
  generatePrestacaoStaleNotifications,
} from '../lib/sync/notifications';
import { syncImpacto } from '../lib/impacto/totvs';
import { getSetting, setSetting } from '../lib/db/settings';

const HOT_INTERVAL_MS = 5 * 60 * 1000;
const WARM_INTERVAL_MS = 45 * 60 * 1000;
const COLD_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LOCK_ID = 8675309;
const APP_BASE = process.env.APP_BASE_URL || 'http://localhost:3000';

let lastWarm = 0;
let lastCold = 0;

async function ensureTables() {
  if (!sql) throw new Error('DB not available');
  await sql`
    CREATE TABLE IF NOT EXISTS sync_runs (
      id SERIAL PRIMARY KEY,
      kind VARCHAR(10) NOT NULL,
      status VARCHAR(15) NOT NULL DEFAULT 'running',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      meta JSONB
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_sync_runs_kind ON sync_runs(kind, started_at DESC)`;
  await sql`
    CREATE TABLE IF NOT EXISTS sync_run_errors (
      id SERIAL PRIMARY KEY,
      run_id INTEGER REFERENCES sync_runs(id),
      kind VARCHAR(10),
      context TEXT,
      error TEXT,
      retryable BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function acquireLock(): Promise<boolean> {
  const rows = await sql`SELECT pg_try_advisory_lock(${LOCK_ID}) AS ok`;
  return !!rows[0]?.ok;
}
async function releaseLock() {
  try { await sql`SELECT pg_advisory_unlock(${LOCK_ID})`; } catch {}
}

async function startRun(kind: string): Promise<number> {
  const rows = await sql`INSERT INTO sync_runs (kind) VALUES (${kind}) RETURNING id`;
  return rows[0].id;
}
async function finishRun(id: number, status: 'done' | 'error', meta: any) {
  await sql`UPDATE sync_runs SET status=${status}, finished_at=NOW(), meta=${JSON.stringify(meta)}::jsonb WHERE id=${id}`;
}
async function logError(runId: number, kind: string, context: string, error: string, retryable = true) {
  try {
    await sql`INSERT INTO sync_run_errors (run_id, kind, context, error, retryable) VALUES (${runId}, ${kind}, ${context}, ${error?.slice(0, 2000)}, ${retryable})`;
  } catch {}
}

async function hotCycle() {
  if (!(await acquireLock())) { console.log('[HOT] lock busy, skipping'); return; }
  const runId = await startRun('hot');
  try {
    console.log('[HOT] ciclo iniciado', new Date().toISOString());
    const result = await runGlobalSync({ mode: 'quick', delayMs: 250 });

    // Auto-audit pending expenses (step-1 CAIXA reports), if enabled — runs
    // before auto-approve so a fully bot-audited report can be approved in the
    // same cycle.
    let autoAudit: any = null;
    try {
      autoAudit = await runAutoAudit();
      if (autoAudit.enabled && autoAudit.audited > 0) {
        console.log(`[HOT] auto-audit: ${autoAudit.audited} despesas (${autoAudit.succeeded} ok, ${autoAudit.failedOcr} sem OCR), restam ${autoAudit.remaining}`);
      }
    } catch (e: any) {
      await logError(runId, 'hot', 'auto-audit', e?.message || String(e), true);
    }

    // Auto-approve eligible CAIXA reports (bot-audited only), if enabled
    let autoApprove: any = null;
    try {
      autoApprove = await runAutoApprove();
      if (autoApprove.enabled && (autoApprove.approved > 0 || autoApprove.failed.length > 0)) {
        console.log(`[HOT] auto-approve: ${autoApprove.approved} aprovados, ${autoApprove.failed.length} falhas (${autoApprove.candidates} candidatos)`);
      }
    } catch (e: any) {
      await logError(runId, 'hot', 'auto-approve', e?.message || String(e), true);
    }

    const meta = {
      auto_audit: autoAudit,
      auto_approve: autoApprove,
      discovery: result.discovery && {
        api_total: result.discovery.api_total,
        new_reports: result.discovery.new_reports_found,
        status_changes: result.discovery.status_changes,
      },
      expenses: {
        processed: result.expenses.processed,
        synced: result.expenses.synced,
        deleted_reports: result.expenses.deleted_reports,
        status_updates: result.expenses.status_updates,
        errors: result.expenses.errors.length,
      },
    };
    for (const e of result.expenses.errors) {
      await logError(runId, 'hot', `report ${e.report_id}`, e.error, true);
    }
    await finishRun(runId, 'done', meta);
    console.log('[HOT] ciclo ok:', JSON.stringify(meta));
  } catch (err: any) {
    await finishRun(runId, 'error', { error: err?.message });
    await logError(runId, 'hot', 'cycle', err?.message || String(err), true);
    console.error('[HOT] erro:', err?.message);
  } finally {
    await releaseLock();
  }
}

async function warmCycle() {
  if (!(await acquireLock())) { console.log('[WARM] lock busy, skipping'); return; }
  const runId = await startRun('warm');
  const meta: any = {};
  let failed = false;
  try {
    console.log('[WARM] ciclo iniciado', new Date().toISOString());
    // keepalive — refresh laravel sessions via the existing public route
    try {
      const r = await fetch(`${APP_BASE}/api/vexpenses/keepalive`, { signal: AbortSignal.timeout(60000) });
      meta.keepalive = r.status;
    } catch (e: any) { meta.keepalive = `fail: ${e?.message}`; }

    try {
      meta.extrato = await downloadExtrato(
        (c, t) => console.log(`[WARM] extrato chunk ${c}/${t}`),
        { incremental: true, overlapDays: 2 }
      );
    } catch (e: any) {
      failed = true;
      await logError(runId, 'warm', 'extrato', e?.message || String(e), true);
    }
    try {
      meta.cadastro = await refreshCadastro();
    } catch (e: any) {
      failed = true;
      await logError(runId, 'warm', 'cadastro', e?.message || String(e), true);
    }
    // Alertas de funcionários inativos com saldo — depende do cadastro fresco
    try {
      meta.inactive_alerts = await generateInactiveAlerts();
      if (meta.inactive_alerts.created > 0 || meta.inactive_alerts.resolved > 0) {
        console.log(`[WARM] inactive-alerts: ${meta.inactive_alerts.created} novos, ${meta.inactive_alerts.updated} atualizados, ${meta.inactive_alerts.resolved} resolvidos`);
      }
    } catch (e: any) {
      await logError(runId, 'warm', 'inactive-alerts', e?.message || String(e), true);
    }
    // Notificações in-app — digest de aprovações, prestação parada e falhas de
    // sync (geradas depois dos dados pra refletir o estado recém-sincronizado)
    try {
      meta.notifications = {
        approvals: await generateApprovalDigest(),
        prestacao: await generatePrestacaoStaleNotifications(),
        sync: await generateSyncFailureNotifications(),
      };
    } catch (e: any) {
      await logError(runId, 'warm', 'notifications', e?.message || String(e), true);
    }
    // Impacto Financeiro — SE2 títulos com acréscimo (EQS+BRATEC), janela 4 meses
    try {
      const imp = await syncImpacto({ monthsBack: 4 });
      meta.impacto = imp.map((r) => `${r.empresa}:${r.upserted}${r.error ? '!err' : ''}`);
      if (imp.some((r) => r.error)) failed = true;
    } catch (e: any) {
      failed = true;
      await logError(runId, 'warm', 'impacto-se2', e?.message || String(e), true);
    }
    await finishRun(runId, failed ? 'error' : 'done', meta);
    console.log('[WARM] ciclo', failed ? 'com erros' : 'ok');
  } finally {
    await releaseLock();
  }
}

async function coldCycle() {
  if (!(await acquireLock())) { console.log('[COLD] lock busy, skipping'); return; }
  const runId = await startRun('cold');
  try {
    console.log('[COLD] ciclo iniciado (overlap 30d)', new Date().toISOString());
    const meta = await downloadExtrato(
      (c, t) => console.log(`[COLD] extrato chunk ${c}/${t}`),
      { incremental: true, overlapDays: 30 }
    );
    await finishRun(runId, 'done', meta);
    console.log('[COLD] ciclo ok');
  } catch (err: any) {
    await finishRun(runId, 'error', { error: err?.message });
    await logError(runId, 'cold', 'extrato-30d', err?.message || String(err), true);
    console.error('[COLD] erro:', err?.message);
  } finally {
    await releaseLock();
  }
}

// Quinzena autopilot — roda 1x/dia nas datas relevantes:
//   10 e 24 (D-1) → relatório de véspera; 11 e 25 (D) → fechamento automático.
// Só depois das 05h UTC (~02h BRT) pra não pegar o dia errado por fuso.
async function autopilotCheck() {
  if (!process.env.CRON_SECRET) return;
  const now = new Date();
  const day = now.getUTCDate();
  if (![10, 11, 24, 25].includes(day) || now.getUTCHours() < 5) return;
  const marker = `autopilot:${now.toISOString().slice(0, 10)}`;
  if (await getSetting(marker)) return; // já rodou hoje
  await setSetting(marker, { fired_at: now.toISOString() }, 'sync-worker');
  try {
    const r = await fetch(`${APP_BASE}/api/cron/quinzena-autopilot`, {
      headers: { 'x-cron-secret': process.env.CRON_SECRET },
      signal: AbortSignal.timeout(300_000),
    });
    const body = await r.json().catch(() => ({}));
    await setSetting(marker, { fired_at: now.toISOString(), status: r.status, body }, 'sync-worker');
    console.log(`[autopilot] dia ${day}: HTTP ${r.status}`, JSON.stringify(body).slice(0, 300));
  } catch (e: any) {
    console.error('[autopilot] erro:', e?.message);
  }
}

async function loop() {
  const now = Date.now();
  try {
    await hotCycle();
    if (now - lastWarm >= WARM_INTERVAL_MS) { lastWarm = now; await warmCycle(); }
    if (now - lastCold >= COLD_INTERVAL_MS) { lastCold = now; await coldCycle(); }
    await autopilotCheck();
  } catch (e: any) {
    console.error('[worker] loop error:', e?.message);
  }
  setTimeout(loop, HOT_INTERVAL_MS);
}

async function main() {
  console.log('[sync-worker] iniciando...', new Date().toISOString());
  if (!sql) { console.error('[sync-worker] NEON_DATABASE_URL ausente'); process.exit(1); }
  await ensureTables();
  // Runs deixados em 'running' por restart do processo são órfãos — sob o
  // advisory lock nenhum outro worker está em ciclo, então é seguro abortá-los.
  if (await acquireLock()) {
    try {
      await sql`
        UPDATE sync_runs
        SET status = 'error',
            finished_at = NOW(),
            meta = COALESCE(meta, '{}'::jsonb) || '{"error":"worker reiniciado — ciclo abandonado"}'::jsonb
        WHERE status = 'running'
      `;
    } finally {
      await releaseLock();
    }
  }
  // Kick off immediately, then every HOT_INTERVAL_MS
  lastWarm = Date.now(); // don't warm right away — let hot run first
  await loop();
}

main().catch(e => { console.error('[sync-worker] fatal:', e); process.exit(1); });
