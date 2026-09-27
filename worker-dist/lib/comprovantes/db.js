"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureComprovantesTables = ensureComprovantesTables;
exports.getSpTreeCache = getSpTreeCache;
exports.setSpTreeCache = setSpTreeCache;
exports.createRun = createRun;
exports.claimNextRun = claimNextRun;
exports.updateRunProgress = updateRunProgress;
exports.finishRun = finishRun;
exports.failRun = failRun;
exports.insertEnvio = insertEnvio;
exports.listRuns = listRuns;
exports.getRun = getRun;
const neon_1 = require("../db/neon");
let ensured = false;
async function ensureComprovantesTables() {
    if (ensured || !neon_1.sql)
        return;
    await (0, neon_1.sql) `
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
    await (0, neon_1.sql) `
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
    await (0, neon_1.sql) `ALTER TABLE comprovantes_runs ADD COLUMN IF NOT EXISTS selection JSONB`;
    await (0, neon_1.sql) `ALTER TABLE comprovantes_runs ADD COLUMN IF NOT EXISTS label TEXT`;
    await (0, neon_1.sql) `ALTER TABLE comprovantes_runs ALTER COLUMN year DROP NOT NULL`;
    await (0, neon_1.sql) `ALTER TABLE comprovantes_runs ALTER COLUMN month_folder DROP NOT NULL`;
    await (0, neon_1.sql) `ALTER TABLE comprovantes_runs ALTER COLUMN bank DROP NOT NULL`;
    await (0, neon_1.sql) `ALTER TABLE comprovantes_runs ALTER COLUMN date_folder DROP NOT NULL`;
    await (0, neon_1.sql) `CREATE INDEX IF NOT EXISTS idx_comprovantes_envios_run ON comprovantes_envios(run_id)`;
    await (0, neon_1.sql) `CREATE INDEX IF NOT EXISTS idx_comprovantes_envios_cpf ON comprovantes_envios(cpf)`;
    await (0, neon_1.sql) `CREATE INDEX IF NOT EXISTS idx_comprovantes_envios_chave ON comprovantes_envios(chave)`;
    await (0, neon_1.sql) `CREATE INDEX IF NOT EXISTS idx_comprovantes_runs_status ON comprovantes_runs(status)`;
    await (0, neon_1.sql) `
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
async function getSpTreeCache(site, path) {
    if (!neon_1.sql)
        return null;
    await ensureComprovantesTables();
    const rows = await (0, neon_1.sql) `
    SELECT folders, files, fetched_at FROM comprovantes_sp_cache WHERE site = ${site} AND path = ${path}
  `;
    if (!rows[0])
        return null;
    return {
        folders: rows[0].folders?.map(String) || [],
        files: rows[0].files || [],
        fetched_at: rows[0].fetched_at,
    };
}
async function setSpTreeCache(site, path, folders, files) {
    if (!neon_1.sql)
        return;
    await ensureComprovantesTables();
    await (0, neon_1.sql) `
    INSERT INTO comprovantes_sp_cache (site, path, folders, files, fetched_at)
    VALUES (${site}, ${path}, ${JSON.stringify(folders)}::jsonb, ${JSON.stringify(files)}::jsonb, NOW())
    ON CONFLICT (site, path) DO UPDATE SET
      folders = EXCLUDED.folders, files = EXCLUDED.files, fetched_at = NOW()
  `;
}
async function createRun(params) {
    await ensureComprovantesTables();
    const rows = await (0, neon_1.sql) `
    INSERT INTO comprovantes_runs (source, year, month_folder, bank, date_folder, selection, label, created_by)
    VALUES (${params.source}, ${params.year || null}, ${params.monthFolder || null}, ${params.bank || null},
            ${params.dateFolder || null},
            ${params.selection ? JSON.stringify(params.selection) : null}::jsonb,
            ${params.label || null}, ${params.createdBy || null})
    RETURNING id
  `;
    return rows[0].id;
}
async function claimNextRun() {
    if (!neon_1.sql)
        return null;
    await ensureComprovantesTables();
    const rows = await (0, neon_1.sql) `
    UPDATE comprovantes_runs
    SET status = 'running', started_at = NOW()
    WHERE id = (
      SELECT id FROM comprovantes_runs WHERE status = 'queued' ORDER BY id LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;
    return rows.length > 0 ? rows[0] : null;
}
async function updateRunProgress(runId, progress) {
    await (0, neon_1.sql) `UPDATE comprovantes_runs SET progress = ${JSON.stringify(progress)}::jsonb WHERE id = ${runId}`;
}
async function finishRun(runId, result) {
    await (0, neon_1.sql) `UPDATE comprovantes_runs SET status = 'done', result = ${JSON.stringify(result)}::jsonb, finished_at = NOW() WHERE id = ${runId}`;
}
async function failRun(runId, error) {
    await (0, neon_1.sql) `UPDATE comprovantes_runs SET status = 'error', error = ${error}, finished_at = NOW() WHERE id = ${runId}`;
}
async function insertEnvio(e) {
    const rows = await (0, neon_1.sql) `
    INSERT INTO comprovantes_envios (
      run_id, source_file, page_num, chave, cpf, nome, regiao, cc,
      tipo_pagamento, pedido, modelo_documento, competencia,
      destino_path, destino_filename, status, error, generated_pdf_path
    ) VALUES (
      ${e.runId}, ${e.sourceFile}, ${e.pageNum}, ${e.chave || null}, ${e.cpf || null}, ${e.nome || null},
      ${e.regiao || null}, ${e.cc || null}, ${e.tipoPagamento || null}, ${e.pedido || null},
      ${e.modeloDocumento || null}, ${e.competencia || null}, ${e.destinoPath || null},
      ${e.destinoFilename || null}, ${e.status}, ${e.error || null}, ${e.generatedPdfPath || null}
    ) RETURNING id
  `;
    return rows[0].id;
}
async function listRuns(limit = 30) {
    if (!neon_1.sql)
        return [];
    await ensureComprovantesTables();
    return (await (0, neon_1.sql) `SELECT * FROM comprovantes_runs ORDER BY id DESC LIMIT ${limit}`);
}
async function getRun(id) {
    if (!neon_1.sql)
        return { run: null, envios: [] };
    await ensureComprovantesTables();
    const runs = await (0, neon_1.sql) `SELECT * FROM comprovantes_runs WHERE id = ${id}`;
    const envios = await (0, neon_1.sql) `SELECT * FROM comprovantes_envios WHERE run_id = ${id} ORDER BY id`;
    return { run: runs[0] || null, envios };
}
