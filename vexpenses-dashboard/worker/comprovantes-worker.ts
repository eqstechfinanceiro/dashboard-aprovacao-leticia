/**
 * comprovantes-worker — processa fila comprovantes_runs (PM2 app `comprovantes-worker`).
 *
 * Loop: a cada 10s tenta pegar lock + claim do próximo run 'queued' e processa.
 * E2DOC permanece em dry-run até app_settings.e2doc_send_enabled === true.
 * Upload ao SharePoint destino gateado por app_settings.comprovantes_upload_enabled.
 */
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import path from 'path';

loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

import { sql } from '../lib/db/neon';
import { claimNextRun, ensureComprovantesTables } from '../lib/comprovantes/db';
import { processRun } from '../lib/comprovantes/pipeline';
import { processRemessaRun } from '../lib/comprovantes/remessa-pipeline';
import { closeSpBrowser } from '../lib/comprovantes/sharepoint';

const POLL_MS = 10 * 1000;
const LOCK_ID = 8675311;

async function acquireLock(): Promise<boolean> {
  const rows = await sql`SELECT pg_try_advisory_lock(${LOCK_ID}) AS ok`;
  return !!rows[0]?.ok;
}
async function releaseLock() {
  try { await sql`SELECT pg_advisory_unlock(${LOCK_ID})`; } catch {}
}

async function tick() {
  if (!(await acquireLock())) return;
  try {
    const run = await claimNextRun();
    if (!run) return;
    console.log(`[comprovantes] run #${run.id} iniciado: ${run.source} ${run.year}/${run.month_folder}/${run.bank}/${run.date_folder}`);
    if (run.source === 'remessa') await processRemessaRun(run);
    else await processRun(run);
    console.log(`[comprovantes] run #${run.id} finalizado`);
  } finally {
    releaseLock();
  }
}

async function main() {
  if (!sql) { console.error('[comprovantes] DB indisponível'); process.exit(1); }
  await ensureComprovantesTables();
  console.log('[comprovantes] worker iniciado');
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick();
    } catch (err) {
      console.error('[comprovantes] erro no tick:', err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

process.on('SIGTERM', async () => { await closeSpBrowser(); process.exit(0); });
process.on('SIGINT', async () => { await closeSpBrowser(); process.exit(0); });

main().catch((e) => { console.error('[comprovantes] fatal:', e); process.exit(1); });
