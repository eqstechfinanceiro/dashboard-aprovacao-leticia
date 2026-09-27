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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadExtrato = downloadExtrato;
// Extrato (bank statement) sync via API v3 — chunked download, all-or-nothing.
// Moved verbatim from lib/pipeline/pipeline.ts.
const neon_1 = require("../db/neon");
const laravel_token_1 = require("../api/laravel-token");
const client_1 = require("./client");
/** Download extrato from API v3 (XLSX via S3 presigned URL)
 *
 * SAFETY: All chunks must succeed. If any chunk fails after retries, the
 * entire sync is aborted and NO data is deleted — the previous dataset
 * remains intact. This prevents partial/incomplete data from replacing
 * a known-good dataset during freeze/quinzena generation.
 */
async function downloadExtrato(onProgress, options) {
    if (!neon_1.sql)
        throw new Error('Database not available');
    const cookieStr = await (0, laravel_token_1.getLaravelCookieString)();
    if (!cookieStr)
        throw new Error('Laravel token expirado. Acesse app.vexpenses.com para atualizar via extensão.');
    const db = neon_1.sql;
    // Determine date range
    const now = new Date();
    const endDate = now.toISOString().slice(0, 10);
    let startDate;
    if (options?.incremental) {
        try {
            const lastRow = await db `SELECT MAX(data) as max_data FROM extrato_movimentacao`;
            const lastDate = lastRow[0]?.max_data;
            if (lastDate) {
                const overlap = options?.overlapDays ?? 2;
                const d = new Date(lastDate);
                d.setDate(d.getDate() - overlap);
                startDate = d.toISOString().slice(0, 10);
            }
            else {
                const year = now.getFullYear();
                startDate = `${year - 1}-01-01`;
            }
        }
        catch {
            const year = now.getFullYear();
            startDate = `${year - 1}-01-01`;
        }
    }
    else {
        const year = now.getFullYear();
        startDate = `${year - 1}-01-01`;
    }
    // Split into 15-day chunks (API limit per call)
    const chunks = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const current = new Date(start);
    while (current <= end) {
        const chunkEnd = new Date(current);
        chunkEnd.setDate(chunkEnd.getDate() + 14);
        if (chunkEnd > end)
            chunkEnd.setTime(end.getTime());
        chunks.push([
            current.toISOString().slice(0, 10),
            chunkEnd.toISOString().slice(0, 10),
        ]);
        current.setDate(current.getDate() + 15);
    }
    let totalRows = 0;
    const failedChunks = [];
    // Phase 1: Download and parse ALL chunks first (no DB writes yet)
    // This ensures we have complete data before touching the database.
    const chunkData = [];
    for (let i = 0; i < chunks.length; i++) {
        const [chunkStart, chunkEnd] = chunks[i];
        onProgress?.(i + 1, chunks.length);
        let chunkRows = null;
        let lastError = '';
        // Retry each chunk up to 3 times
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`[Extrato] Chunk ${i + 1}/${chunks.length} (tentativa ${attempt}/3): ${chunkStart} a ${chunkEnd}`);
                // Step 1: Get S3 presigned URL
                const urlResp = await fetch(`${client_1.API_URL}/v3/pay/statement/excel-all?start_date=${chunkStart}&end_date=${chunkEnd}`, {
                    headers: {
                        Cookie: cookieStr,
                        Accept: 'application/json',
                    },
                    signal: AbortSignal.timeout(120000),
                });
                if (!urlResp.ok) {
                    throw new Error(`API retornou HTTP ${urlResp.status}`);
                }
                const urlData = await urlResp.json();
                if (!urlData || !urlData.success) {
                    throw new Error('API retornou success=false');
                }
                const s3Url = urlData?.data?.url;
                if (!s3Url) {
                    throw new Error('API não retornou URL do S3');
                }
                // Step 2: Download XLSX
                const xlsxResp = await fetch(s3Url, {
                    signal: AbortSignal.timeout(180000),
                });
                if (!xlsxResp.ok) {
                    throw new Error(`Download XLSX falhou: HTTP ${xlsxResp.status}`);
                }
                const xlsxBuffer = await xlsxResp.arrayBuffer();
                if (xlsxBuffer.byteLength < 100) {
                    throw new Error(`XLSX muito pequeno (${xlsxBuffer.byteLength} bytes) — possivel resposta vazia`);
                }
                // Step 3: Parse XLSX
                const XLSX = await Promise.resolve().then(() => __importStar(require('xlsx')));
                const workbook = XLSX.read(xlsxBuffer, { type: 'array', cellDates: true });
                const sheetName = workbook.SheetNames[0];
                if (!sheetName) {
                    throw new Error('XLSX sem abas');
                }
                const sheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
                // Transform rows
                const colMap = {
                    'Data': 'data',
                    'Hora': 'hora',
                    'Código de Transação': 'codigo_transacao',
                    'Número do Cartão': 'numero_cartao',
                    'Grupo': 'grupo',
                    'Usuário': 'usuario',
                    'Tipo': 'tipo',
                    'Descrição': 'descricao',
                    'Valor': 'valor',
                    'Status': 'status',
                    'ID da Despesa': 'id_despesa',
                    'ID do Relatório': 'id_relatorio',
                    'Tipo de Despesa': 'tipo_despesa',
                    'Centro de Custo': 'centro_custo',
                    'Projeto': 'projeto',
                    'Percentual de projeto': 'percentual_projeto',
                };
                const batch = [];
                for (const row of rows) {
                    const transformed = {};
                    for (const [xlsxCol, dbCol] of Object.entries(colMap)) {
                        if (row[xlsxCol] !== undefined && row[xlsxCol] !== null) {
                            transformed[dbCol] = row[xlsxCol];
                        }
                    }
                    let dataValue = transformed.data;
                    if (dataValue instanceof Date) {
                        dataValue = dataValue.toISOString().slice(0, 10);
                    }
                    else if (typeof dataValue === 'number') {
                        const date = new Date(Date.UTC(1899, 11, 30) + dataValue * 86400000);
                        dataValue = date.toISOString().slice(0, 10);
                    }
                    else if (typeof dataValue === 'string' && /^\d+$/.test(dataValue)) {
                        const serial = parseInt(dataValue, 10);
                        const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
                        dataValue = date.toISOString().slice(0, 10);
                    }
                    const isSnapshot = !transformed.tipo || transformed.tipo === '' || transformed.hora === '-';
                    let valor = transformed.valor;
                    if (typeof valor === 'string') {
                        valor = parseFloat(valor.replace(/\./g, '').replace(',', '.'));
                    }
                    batch.push([
                        dataValue || null,
                        transformed.hora || null,
                        transformed.codigo_transacao || null,
                        transformed.numero_cartao || null,
                        transformed.grupo || null,
                        transformed.usuario || null,
                        transformed.tipo || null,
                        transformed.descricao || null,
                        valor || null,
                        transformed.status || null,
                        transformed.id_despesa || null,
                        transformed.id_relatorio || null,
                        transformed.tipo_despesa || null,
                        transformed.centro_custo || null,
                        transformed.projeto || null,
                        transformed.percentual_projeto || null,
                        isSnapshot,
                    ]);
                }
                chunkRows = batch;
                console.log(`[Extrato] Chunk ${i + 1}/${chunks.length}: ${batch.length} linhas parseadas (tentativa ${attempt})`);
                break; // success, no more retries
            }
            catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                console.error(`[Extrato] Chunk ${i + 1} tentativa ${attempt} falhou: ${lastError}`);
                if (attempt < 3) {
                    // Wait before retry (exponential backoff: 5s, 10s)
                    await new Promise(r => setTimeout(r, attempt * 5000));
                }
            }
        }
        if (chunkRows === null) {
            // All retries failed — record this chunk as failed
            failedChunks.push({
                chunk: i + 1,
                range: `${chunkStart} a ${chunkEnd}`,
                error: lastError,
            });
            console.error(`[Extrato] Chunk ${i + 1}/${chunks.length} FALHOU após 3 tentativas: ${lastError}`);
        }
        else {
            chunkData.push({ start: chunkStart, end: chunkEnd, rows: chunkRows });
            totalRows += chunkRows.length;
        }
    }
    // Phase 2: If ANY chunk failed, abort the entire sync.
    // Do NOT delete or modify existing data — keep the previous known-good dataset.
    if (failedChunks.length > 0) {
        const errorReport = failedChunks.map(f => `Chunk ${f.chunk} (${f.range}): ${f.error}`).join('; ');
        throw new Error(`SYNC ABORTADA: ${failedChunks.length} chunk(s) falharam após 3 tentativas. ` +
            `Nenhum dado foi modificado no banco. Erros: ${errorReport}`);
    }
    // Phase 3: All chunks downloaded successfully — now write to DB.
    // Use insert-then-delete pattern: insert new rows FIRST, then delete old rows
    // that are NOT in the new dataset. This prevents data loss if insert fails.
    console.log(`[Extrato] Todos os ${chunks.length} chunks baixados. Iniciando persistência no DB...`);
    for (const { start: chunkStart, end: chunkEnd, rows: batch } of chunkData) {
        // Insert new rows FIRST (before deleting old ones)
        const SUB_BATCH = 100;
        for (let j = 0; j < batch.length; j += SUB_BATCH) {
            const sub = batch.slice(j, j + SUB_BATCH);
            const valueGroups = [];
            const params = [];
            let paramIdx = 1;
            for (const row of sub) {
                const placeholders = [];
                for (const val of row) {
                    placeholders.push(`$${paramIdx++}`);
                    params.push(val);
                }
                valueGroups.push(`(${placeholders.join(', ')})`);
            }
            // Use ON CONFLICT DO UPDATE (not DO NOTHING) so if the same code exists,
            // we update with the latest data instead of silently dropping it
            const query = `INSERT INTO extrato_movimentacao
          (data, hora, codigo_transacao, numero_cartao, grupo, usuario, tipo,
           descricao, valor, status, id_despesa, id_relatorio, tipo_despesa,
           centro_custo, projeto, percentual_projeto, is_snapshot)
         VALUES ${valueGroups.join(', ')}
         ON CONFLICT (data, hora, codigo_transacao, is_snapshot)
         WHERE codigo_transacao IS NOT NULL
         DO UPDATE SET
           valor = EXCLUDED.valor,
           descricao = EXCLUDED.descricao,
           usuario = EXCLUDED.usuario,
           tipo = EXCLUDED.tipo,
           status = EXCLUDED.status,
           id_despesa = EXCLUDED.id_despesa,
           id_relatorio = EXCLUDED.id_relatorio,
           tipo_despesa = EXCLUDED.tipo_despesa,
           centro_custo = EXCLUDED.centro_custo,
           projeto = EXCLUDED.projeto,
           percentual_projeto = EXCLUDED.percentual_projeto`;
            await db.query(query, params);
        }
        // Delete old rows in this range that were NOT in the new dataset
        // (i.e., rows with dates in this chunk range that have a different codigo_transacao)
        // We only delete non-snapshot rows — snapshots are cumulative and should not be deleted
        await db `DELETE FROM extrato_movimentacao
      WHERE data BETWEEN ${chunkStart} AND ${chunkEnd}
        AND is_snapshot = FALSE
        AND codigo_transacao NOT IN (
          SELECT DISTINCT codigo_transacao FROM extrato_movimentacao e2
          WHERE e2.data BETWEEN ${chunkStart} AND ${chunkEnd}
            AND e2.is_snapshot = FALSE
            AND e2.codigo_transacao IS NOT NULL
        )`;
        console.log(`[Extrato] Chunk ${chunkStart} a ${chunkEnd}: ${batch.length} linhas persistidas`);
    }
    return {
        chunks_processed: chunks.length,
        total_rows: totalRows,
        period: `${startDate} to ${endDate}`,
        failed_chunks: 0,
    };
}
