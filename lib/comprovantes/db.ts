import { sql } from '../db/neon';

let ensured = false;

export async function ensureComprovantesTables(): Promise<void> {
  if (ensured || !sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS comprovantes_runs (
      id SERIAL PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'eqs',
      year TEXT NOT NULL,
      month_folder TEXT NOT NULL,
      bank TEXT NOT NULL,
      date_folder TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress JSONB NOT NULL DEFAULT '{}',
      result JSONB,
      error TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS comprovantes_envios (
      id SERIAL PRIMARY KEY,
      run_id INTEGER NOT NULL REFERENCES comprovantes_runs(id) ON DELETE CASCADE,
      source_file TEXT NOT NULL,
      page_num INTEGER NOT NULL,
      chave TEXT,
      cpf TEXT,
      nome TEXT,
      regiao TEXT,
      cc TEXT,
      tipo_pagamento TEXT,
      pedido TEXT,
      modelo_documento TEXT,
      competencia TEXT,
      destino_path TEXT,
      destino_filename TEXT,
      status TEXT NOT NULL,
      error TEXT,
      generated_pdf_path TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE comprovantes_envios ADD COLUMN IF NOT EXISTS banco TEXT`;
  await sql`ALTER TABLE comprovantes_envios ADD COLUMN IF NOT EXISTS meta JSONB`;
  await sql`ALTER TABLE comprovantes_runs ADD COLUMN IF NOT EXISTS selection JSONB`;
  await sql`ALTER TABLE comprovantes_runs ADD COLUMN IF NOT EXISTS label TEXT`;
  await sql`ALTER TABLE comprovantes_runs ALTER COLUMN year DROP NOT NULL`;
  await sql`ALTER TABLE comprovantes_runs ALTER COLUMN month_folder DROP NOT NULL`;
  await sql`ALTER TABLE comprovantes_runs ALTER COLUMN bank DROP NOT NULL`;
  await sql`ALTER TABLE comprovantes_runs ALTER COLUMN date_folder DROP NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_comprovantes_envios_run ON comprovantes_envios(run_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_comprovantes_envios_cpf ON comprovantes_envios(cpf)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_comprovantes_envios_chave ON comprovantes_envios(chave)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_comprovantes_runs_status ON comprovantes_runs(status)`;
  await sql`
    CREATE TABLE IF NOT EXISTS comprovantes_sp_cache (
      site TEXT NOT NULL,
      path TEXT NOT NULL,
      folders JSONB NOT NULL DEFAULT '[]',
      files JSONB NOT NULL DEFAULT '[]',
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (site, path)
    )
  `;
  ensured = true;
}

// ---------- Cache da árvore SharePoint ----------

export interface SpTreeCacheRow {
  folders: string[];
  files: { name: string; size: number; url: string; timeLastModified: string | null }[];
  fetched_at: string;
}

export async function getSpTreeCache(site: string, path: string): Promise<SpTreeCacheRow | null> {
  if (!sql) return null;
  await ensureComprovantesTables();
  const rows = await sql`
    SELECT folders, files, fetched_at FROM comprovantes_sp_cache WHERE site = ${site} AND path = ${path}
  `;
  if (!rows[0]) return null;
  return {
    folders: (rows[0].folders as any[])?.map(String) || [],
    files: (rows[0].files as any[]) || [],
    fetched_at: rows[0].fetched_at as string,
  };
}

export async function setSpTreeCache(site: string, path: string, folders: string[], files: unknown[]): Promise<void> {
  if (!sql) return;
  await ensureComprovantesTables();
  await sql`
    INSERT INTO comprovantes_sp_cache (site, path, folders, files, fetched_at)
    VALUES (${site}, ${path}, ${JSON.stringify(folders)}::jsonb, ${JSON.stringify(files)}::jsonb, NOW())
    ON CONFLICT (site, path) DO UPDATE SET
      folders = EXCLUDED.folders, files = EXCLUDED.files, fetched_at = NOW()
  `;
}

export interface SelectionItem {
  source: string; year: string; month: string; bank: string; date: string;
  url: string; name: string;
}

export type Selection = { sig: string; items: SelectionItem[] };

export interface RunRow {
  id: number;
  source: string;
  year: string | null;
  month_folder: string | null;
  bank: string | null;
  date_folder: string | null;
  selection: Selection | null;
  label: string | null;
  status: string;
  progress: any;
  result: any;
  error: string | null;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export async function createRun(params: {
  source: string; year?: string; monthFolder?: string; bank?: string; dateFolder?: string;
  selection?: Selection; label?: string; createdBy?: string;
}): Promise<number> {
  await ensureComprovantesTables();
  const rows = await sql`
    INSERT INTO comprovantes_runs (source, year, month_folder, bank, date_folder, selection, label, created_by)
    VALUES (${params.source}, ${params.year || null}, ${params.monthFolder || null}, ${params.bank || null},
            ${params.dateFolder || null},
            ${params.selection ? JSON.stringify(params.selection) : null}::jsonb,
            ${params.label || null}, ${params.createdBy || null})
    RETURNING id
  `;
  return rows[0].id;
}

export async function claimNextRun(): Promise<RunRow | null> {
  if (!sql) return null;
  await ensureComprovantesTables();
  const rows = await sql`
    UPDATE comprovantes_runs
    SET status = 'running', started_at = NOW()
    WHERE id = (
      SELECT id FROM comprovantes_runs WHERE status = 'queued' ORDER BY id LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;
  return rows.length > 0 ? (rows[0] as RunRow) : null;
}

export async function updateRunProgress(runId: number, progress: any): Promise<void> {
  await sql`UPDATE comprovantes_runs SET progress = ${JSON.stringify(progress)}::jsonb WHERE id = ${runId}`;
}

export async function finishRun(runId: number, result: any): Promise<void> {
  await sql`UPDATE comprovantes_runs SET status = 'done', result = ${JSON.stringify(result)}::jsonb, finished_at = NOW() WHERE id = ${runId}`;
}

export async function failRun(runId: number, error: string): Promise<void> {
  await sql`UPDATE comprovantes_runs SET status = 'error', error = ${error}, finished_at = NOW() WHERE id = ${runId}`;
}

export async function insertEnvio(e: {
  runId: number; sourceFile: string; pageNum: number;
  chave?: string | null; cpf?: string | null; nome?: string | null; regiao?: string | null; cc?: string | null;
  tipoPagamento?: string | null; pedido?: string | null; modeloDocumento?: string | null; competencia?: string | null;
  destinoPath?: string | null; destinoFilename?: string | null;
  status: string; error?: string | null; generatedPdfPath?: string | null;
  banco?: string | null; meta?: unknown;
}): Promise<number> {
  const rows = await sql`
    INSERT INTO comprovantes_envios (
      run_id, source_file, page_num, chave, cpf, nome, regiao, cc,
      tipo_pagamento, pedido, modelo_documento, competencia,
      destino_path, destino_filename, status, error, generated_pdf_path, banco, meta
    ) VALUES (
      ${e.runId}, ${e.sourceFile}, ${e.pageNum}, ${e.chave || null}, ${e.cpf || null}, ${e.nome || null},
      ${e.regiao || null}, ${e.cc || null}, ${e.tipoPagamento || null}, ${e.pedido || null},
      ${e.modeloDocumento || null}, ${e.competencia || null}, ${e.destinoPath || null},
      ${e.destinoFilename || null}, ${e.status}, ${e.error || null}, ${e.generatedPdfPath || null},
      ${e.banco || null}, ${e.meta ? JSON.stringify(e.meta) : null}::jsonb
    ) RETURNING id
  `;
  return rows[0].id;
}

export async function listRuns(limit = 30): Promise<RunRow[]> {
  if (!sql) return [];
  await ensureComprovantesTables();
  return (await sql`SELECT * FROM comprovantes_runs ORDER BY id DESC LIMIT ${limit}`) as RunRow[];
}

export async function getRun(id: number): Promise<{ run: RunRow | null; envios: any[] }> {
  if (!sql) return { run: null, envios: [] };
  await ensureComprovantesTables();
  const runs = await sql`SELECT * FROM comprovantes_runs WHERE id = ${id}`;
  const envios = await sql`SELECT * FROM comprovantes_envios WHERE run_id = ${id} ORDER BY id`;
  return { run: (runs[0] as RunRow) || null, envios };
}
