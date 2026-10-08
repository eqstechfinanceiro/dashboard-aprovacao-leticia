"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncConferencia = syncConferencia;
/**
 * syncConferencia — conferência de mercadoria rodando no sync-worker da VPS.
 *
 * Modelo ledger por nota (não "dia a dia"): cada NF da SF1 vira linha em
 * fiscal_notas com review_status. Ciclo curto (warm ~45min) confere só:
 *   - linhas novas (sem registro)
 *   - 'pendente' (divergente — reprocessa: XML vem do cache, TOTVS pode ter
 *      sido corrigido)
 *   - 'falha_tecnica' elegível a retry (backoff exponencial)
 * 'auto_ok'/'confirmado_*'/'cancelado' NUNCA reprocessam — dedup garantido.
 *
 * Janela móvel por F1_DTDIGIT (default 14d): cobre fim de semana e notas
 * digitadas com atraso — o gap sexta→segunda do PC não existe mais.
 */
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const neon_1 = require("../db/neon");
const fiscal_db_1 = require("../fiscal/fiscal-db");
const totvs_1 = require("./totvs");
const fontes_1 = require("./fontes");
const comparator_1 = require("./comparator");
const tes_override_1 = require("./tes-override");
const DOCS_DIR = () => path_1.default.join(process.cwd(), 'private-downloads', 'fiscal');
const JANELA_DIAS = Math.max(2, parseInt(process.env.CONFERENCIA_JANELA_DIAS || '14', 10));
const MAX_NFS_CICLO = Math.max(1, parseInt(process.env.CONFERENCIA_MAX_NFS || '250', 10));
const RETRY_BASE_MIN = 30;
const RETRY_MAX_MIN = 24 * 60;
const LOG_MAX = 150;
// Estado do ciclo ao vivo — a página /fiscal lê via GET /api/fiscal/ciclo.
let stateEnsured = false;
async function ensureStateTable() {
    if (stateEnsured || !neon_1.sql)
        return;
    stateEnsured = true;
    await (0, neon_1.sql) `
    CREATE TABLE IF NOT EXISTS conferencia_state (
      id INT PRIMARY KEY,
      fase TEXT NOT NULL DEFAULT 'idle',
      janela_dias INT,
      total INT NOT NULL DEFAULT 0,
      elegiveis INT NOT NULL DEFAULT 0,
      conferidas INT NOT NULL DEFAULT 0,
      match INT NOT NULL DEFAULT 0,
      divergentes INT NOT NULL DEFAULT 0,
      falhas INT NOT NULL DEFAULT 0,
      puladas INT NOT NULL DEFAULT 0,
      fontes JSONB NOT NULL DEFAULT '{}',
      current_doc TEXT,
      last_run_id BIGINT,
      error TEXT,
      log JSONB NOT NULL DEFAULT '[]',
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await (0, neon_1.sql) `INSERT INTO conferencia_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
    await (0, neon_1.sql) `ALTER TABLE conferencia_state ADD COLUMN IF NOT EXISTS elegiveis INT NOT NULL DEFAULT 0`;
}
let stateLog = [];
async function setState(patch, logMsg) {
    if (!neon_1.sql)
        return;
    if (logMsg) {
        stateLog.push({ t: new Date().toISOString(), m: logMsg });
        if (stateLog.length > LOG_MAX)
            stateLog = stateLog.slice(-LOG_MAX);
        patch.log = JSON.stringify(stateLog);
        console.log(`[conferencia] ${logMsg}`);
    }
    const sets = Object.keys(patch).map((k, i) => `${k}=$${i + 1}`).join(', ');
    const vals = Object.values(patch);
    try {
        await neon_1.sql.query(`UPDATE conferencia_state SET ${sets}, updated_at=NOW() WHERE id=1`, vals);
    }
    catch { }
}
let colsEnsured = false;
async function ensureRetryCols() {
    if (colsEnsured || !neon_1.sql)
        return;
    colsEnsured = true;
    await (0, neon_1.sql) `ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS conferencia_tentativas INT NOT NULL DEFAULT 0`;
    await (0, neon_1.sql) `ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS conferencia_next_retry TIMESTAMPTZ`;
}
const trim = (v) => (v === null || v === undefined ? '' : String(v).trim());
const nul = (v) => { const s = trim(v); return s ? s.slice(0, 300) : null; };
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const isoDate = (v) => { const s = trim(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };
function dedupKey(doc, serie, filial, emissao, fornecedor) {
    return [trim(doc), trim(serie), trim(filial), emissao || '1900-01-01', trim(fornecedor)].join('|');
}
async function upsertNota(runId, nota) {
    const reviewStatus = (0, fiscal_db_1.computeReviewStatus)(nota.autoStatus, nota.cstOnly === true);
    const tipo = nota.tipo || 'mercadoria';
    const res = await (0, neon_1.sql) `
    INSERT INTO fiscal_notas
      (run_id, tipo, doc, serie, filial, fornecedor, cnpj, valor, emissao,
       chave_acesso, auto_status, auto_resumo, checks, extra, review_status,
       conferencia_tentativas, conferencia_next_retry)
    VALUES
      (${runId}, ${tipo}, ${trim(nota.doc).slice(0, 60)}, ${nul(nota.serie)},
       ${nul(nota.filial)}, ${nul(nota.fornecedor)}, ${nul(nota.cnpj)},
       ${nota.valor}, ${nota.emissao}, ${nul(nota.chave)},
       ${nota.autoStatus}, ${nul(nota.autoResumo)},
       ${nota.checks ? JSON.stringify(nota.checks) : null},
       ${nota.extra ? JSON.stringify(nota.extra) : null},
       ${reviewStatus}, ${nota.tentativas}, ${nota.nextRetry ? nota.nextRetry.toISOString() : null})
    ON CONFLICT (tipo, doc, COALESCE(serie, ''), COALESCE(filial, ''), COALESCE(emissao, '1900-01-01'::date), COALESCE(fornecedor, '')) DO UPDATE SET
      run_id = EXCLUDED.run_id,
      cnpj = COALESCE(EXCLUDED.cnpj, fiscal_notas.cnpj),
      valor = COALESCE(EXCLUDED.valor, fiscal_notas.valor),
      chave_acesso = COALESCE(EXCLUDED.chave_acesso, fiscal_notas.chave_acesso),
      auto_status = EXCLUDED.auto_status,
      auto_resumo = EXCLUDED.auto_resumo,
      checks = COALESCE(EXCLUDED.checks, fiscal_notas.checks),
      extra = COALESCE(EXCLUDED.extra, fiscal_notas.extra),
      review_status = CASE
        WHEN fiscal_notas.review_status IN ('confirmado_ok', 'confirmado_erro')
          THEN fiscal_notas.review_status
        ELSE EXCLUDED.review_status
      END,
      conferencia_tentativas = EXCLUDED.conferencia_tentativas,
      conferencia_next_retry = EXCLUDED.conferencia_next_retry,
      updated_at = NOW()
    RETURNING id`;
    return res[0].id;
}
async function anexarXml(notaId, xml, chave) {
    try {
        (0, fs_1.mkdirSync)(DOCS_DIR(), { recursive: true });
        const safe = `NFe_${chave}.xml`;
        (0, fs_1.writeFileSync)(path_1.default.join(DOCS_DIR(), `${notaId}_${safe}`), xml, 'utf-8');
        await (0, neon_1.sql) `UPDATE fiscal_notas SET doc_path=${`fiscal/${notaId}_${safe}`}, doc_nome=${safe} WHERE id=${notaId}`;
    }
    catch (e) {
        console.warn('[conferencia] falha ao anexar XML:', e?.message);
    }
}
async function loadVexChaves() {
    const m = new Map();
    try {
        const rows = await (0, neon_1.sql) `
      SELECT e.id AS expense_id, e.report_id, rp.name AS report_name,
             regexp_replace(COALESCE(e.raw_data->>'observation', ''), '[^0-9]', '', 'g') AS chave
      FROM prestacao_expenses e
      LEFT JOIN prestacao_reports rp ON rp.id = e.report_id
      WHERE e.raw_data->>'observation' ~ '[0-9]{4}'`;
        for (const r of rows) {
            const c = String(r.chave || '');
            if (/^\d{44}$/.test(c) && !m.has(c)) {
                m.set(c, { expense_id: r.expense_id, report_id: r.report_id, report_name: r.report_name || null });
            }
        }
    }
    catch (e) {
        console.warn('[conferencia] falha ao carregar chaves vexpenses:', e?.message);
    }
    return m;
}
async function syncConferencia(opts = {}) {
    const out = {
        runId: null, total: 0, conferidas: 0, match: 0, divergentes: 0,
        falhas: 0, puladas: 0, fontes: {},
    };
    if (!neon_1.sql) {
        out.error = 'DB indisponível';
        return out;
    }
    try {
        await (0, fiscal_db_1.ensureFiscalTables)();
        await (0, fontes_1.ensureDocCacheTable)();
        await ensureRetryCols();
        await ensureStateTable();
        stateLog = [];
        const janela = opts.janelaDias ?? JANELA_DIAS;
        const dateTo = new Date();
        const dateFrom = new Date(Date.now() - janela * 86400000);
        const fromStr = ymd(dateFrom);
        const toStr = ymd(dateTo);
        // Ledger: linhas existentes (mercadoria + vexpenses reclassificadas) → dedup.
        const ledger = new Map();
        const rows = await (0, neon_1.sql) `
      SELECT id, doc, serie, filial, emissao, fornecedor, review_status,
             conferencia_tentativas, conferencia_next_retry
      FROM fiscal_notas WHERE tipo IN ('mercadoria', 'vexpenses')`;
        for (const r of rows) {
            const em = r.emissao ? new Date(r.emissao).toISOString().slice(0, 10) : '1900-01-01';
            ledger.set(dedupKey(r.doc, r.serie, r.filial, em, r.fornecedor), {
                id: r.id, key: '', review_status: r.review_status,
                conferencia_tentativas: r.conferencia_tentativas ?? 0,
                conferencia_next_retry: r.conferencia_next_retry,
            });
        }
        await setState({ fase: 'totvs', janela_dias: janela, total: 0, conferidas: 0, match: 0, divergentes: 0, falhas: 0, puladas: 0, fontes: '{}', current_doc: null, error: null, log: '[]', started_at: new Date().toISOString(), finished_at: null }, `ciclo iniciado — janela ${janela}d (${fromStr}~${toStr})`);
        const { nfs, errors } = await (0, totvs_1.fetchMercadoriaNfs)(fromStr, toStr, 'SPED');
        out.total = nfs.length;
        if (errors.length)
            console.warn('[conferencia] erros parciais TOTVS:', errors.join('; '));
        await setState({ total: out.total }, `TOTVS: ${out.total} NFs na janela${errors.length ? ` (${errors.join('; ')})` : ''}`);
        const fromIso = `${fromStr.slice(0, 4)}-${fromStr.slice(4, 6)}-${fromStr.slice(6, 8)}`;
        const toIso = `${toStr.slice(0, 4)}-${toStr.slice(4, 6)}-${toStr.slice(6, 8)}`;
        const run = await (0, neon_1.sql) `
      INSERT INTO fiscal_runs (tipo, date_from, date_to, hostname, total_notas, push_version)
      VALUES ('mercadoria', ${fromIso}, ${toIso}, 'vps-worker', ${out.total}, 'vps-f1')
      RETURNING id`;
        out.runId = run[0]?.id ?? null;
        const runId = out.runId ?? 0; // RETURNING sempre devolve id; 0 é fallback defensivo
        if (!nfs.length)
            return out;
        // Chaves NF-e amarradas a despesas VExpenses — classifica tipo e já
        // reclassifica retroativamente notas que entraram como mercadoria.
        const vexChaves = await loadVexChaves();
        if (vexChaves.size) {
            const rec = await (0, neon_1.sql) `
        UPDATE fiscal_notas n SET tipo='vexpenses', updated_at=NOW()
        WHERE n.tipo='mercadoria' AND n.chave_acesso = ANY(${[...vexChaves.keys()]})
          AND NOT EXISTS (
            SELECT 1 FROM fiscal_notas x
            WHERE x.tipo='vexpenses' AND x.doc=n.doc
              AND COALESCE(x.serie,'')=COALESCE(n.serie,'')
              AND COALESCE(x.filial,'')=COALESCE(n.filial,'')
              AND COALESCE(x.emissao,'1900-01-01'::date)=COALESCE(n.emissao,'1900-01-01'::date)
              AND COALESCE(x.fornecedor,'')=COALESCE(n.fornecedor,''))
        RETURNING n.id`;
            const n = Array.isArray(rec) ? rec.length : 0;
            if (n)
                console.log(`[conferencia] ${n} nota(s) reclassificadas mercadoria→vexpenses`);
        }
        const maxNfs = opts.maxNfs ?? MAX_NFS_CICLO;
        // Elegíveis = sem linha | pendente | falha_tecnica com retry vencido.
        const TERMINAL = new Set(['auto_ok', 'auto_ok_aviso', 'confirmado_ok', 'confirmado_erro', 'cancelado']);
        const now = Date.now();
        const elegiveis = nfs.filter((nf) => {
            const h = nf.header;
            const k = dedupKey(h.f1_doc, h.f1_serie, h.f1_filial, isoDate(h.f1_emissao), h.f1_fornece);
            const ex = ledger.get(k);
            if (!ex)
                return true;
            if (TERMINAL.has(ex.review_status)) {
                out.puladas++;
                return false;
            }
            if (ex.review_status === 'falha_tecnica' && ex.conferencia_next_retry) {
                if (new Date(ex.conferencia_next_retry).getTime() > now) {
                    out.puladas++;
                    return false;
                }
            }
            return true;
        }).slice(0, maxNfs);
        // Pré-registra no SIEG as chaves elegíveis fora do cache (lote único).
        if (opts.useSieg !== false && elegiveis.length) {
            const chaves = elegiveis.map((nf) => trim(nf.header.f1_chvnfe)).filter((c) => /^\d{44}$/.test(c));
            const cached = await (0, fontes_1.cacheHasChaves)(chaves);
            const faltando = chaves.filter((c) => !cached.has(c));
            if (faltando.length) {
                try {
                    await setState({ fase: 'sieg_prep' }, `SIEG pré-registro: ${faltando.length} chaves fora do cache`);
                    const added = await (0, fontes_1.prepararSieg)(faltando);
                    console.log(`[conferencia] SIEG pré-registro: ${added}/${faltando.length} chaves`);
                    await setState({}, `SIEG pré-registro: ${added}/${faltando.length} adicionadas`);
                }
                catch (e) {
                    console.warn('[conferencia] SIEG pré-registro falhou:', e?.message);
                    await setState({}, `SIEG pré-registro falhou: ${e?.message}`);
                }
            }
        }
        await setState({ fase: 'conferindo', elegiveis: elegiveis.length }, `conferindo ${elegiveis.length} notas (${out.puladas} puladas por dedup/backoff)`);
        let i = 0;
        for (const nf of elegiveis) {
            i++;
            const h = nf.header;
            const emissao = isoDate(h.f1_emissao);
            const k = dedupKey(h.f1_doc, h.f1_serie, h.f1_filial, emissao, h.f1_fornece);
            const ex = ledger.get(k);
            const tent = (ex?.conferencia_tentativas ?? 0) + 1;
            const chave = trim(h.f1_chvnfe);
            const vex = vexChaves.get(chave) || null;
            const base = {
                doc: trim(h.f1_doc), serie: trim(h.f1_serie), filial: trim(h.f1_filial),
                fornecedor: trim(h.f1_fornece), cnpj: trim(h.a2_cgc),
                valor: Number(h.f1_valbrut) || null, emissao, chave,
            };
            const extraBase = {
                empresa: h._empresa, usuario: h.f1_userlgi || null,
                f1_dtdigit: trim(h.f1_dtdigit), itens_totvs: nf.items.length,
                ...(vex ? { vexpenses: { expense_id: vex.expense_id, report_id: vex.report_id, report_name: vex.report_name } } : {}),
            };
            let xmlRes = null;
            try {
                xmlRes = await (0, fontes_1.obterXmlNfe)(chave, { sieg: opts.useSieg !== false });
            }
            catch (e) {
                console.warn(`[conferencia] fontes falharam ${chave}:`, e?.message);
            }
            if (!xmlRes) {
                const nextRetry = new Date(now + Math.min(RETRY_BASE_MIN * Math.pow(2, tent - 1), RETRY_MAX_MIN) * 60000);
                await setState({ conferidas: out.conferidas + 1, falhas: out.falhas + 1, current_doc: base.doc }, `[${i}/${elegiveis.length}] NF ${base.doc} s/${base.serie} — XML não obtido (tentativa ${tent}, retry ${nextRetry.toISOString().slice(11, 16)}Z)`);
                await upsertNota(runId, {
                    ...base, tipo: vex ? 'vexpenses' : 'mercadoria',
                    autoStatus: 'erro',
                    autoResumo: 'XML não obtido em nenhuma fonte (cache/Z01/SIEG)',
                    checks: [{ field: 'XML', expected: 'NF-e', actual: chave ? 'não obtido' : 'sem chave na SF1', match: false }],
                    extra: { ...extraBase, tentativa: tent },
                    tentativas: tent, nextRetry,
                });
                out.falhas++;
                out.conferidas++;
                continue;
            }
            out.fontes[xmlRes.fonte] = (out.fontes[xmlRes.fonte] || 0) + 1;
            let cmp;
            try {
                const tesOvr = await (0, tes_override_1.carregarTesOverride)(h._empresa || 'EQS');
                cmp = (0, comparator_1.compareNf)(h, nf.items, xmlRes.parsed, tesOvr);
            }
            catch (e) {
                const nextRetry = new Date(now + RETRY_BASE_MIN * 60000);
                await upsertNota(runId, {
                    ...base, tipo: vex ? 'vexpenses' : 'mercadoria',
                    autoStatus: 'erro', autoResumo: `comparação falhou: ${e?.message}`,
                    checks: null, extra: { ...extraBase, fonte_xml: xmlRes.fonte, tentativa: tent },
                    tentativas: tent, nextRetry,
                });
                out.falhas++;
                out.conferidas++;
                continue;
            }
            const autoStatus = cmp.status === 'MATCH' ? 'match' : 'divergente';
            const notaId = await upsertNota(runId, {
                ...base, tipo: vex ? 'vexpenses' : 'mercadoria', autoStatus, autoResumo: cmp.summary,
                checks: [...cmp.header_checks, ...cmp.item_checks.flat()],
                extra: {
                    ...extraBase, fonte_xml: xmlRes.fonte, mismatch_count: cmp.mismatch_count,
                    chave_xml: xmlRes.parsed.chave || null, tentativa: tent,
                },
                tentativas: 0, nextRetry: null, cstOnly: cmp.cst_only === true,
            });
            if (autoStatus !== 'match') {
                await anexarXml(notaId, xmlRes.xml, chave || 'sem-chave');
                out.divergentes++;
            }
            else {
                out.match++;
            }
            out.conferidas++;
            if (autoStatus !== 'match' || i % 10 === 0 || i === elegiveis.length) {
                await setState({ conferidas: out.conferidas, match: out.match, divergentes: out.divergentes, falhas: out.falhas, fontes: JSON.stringify(out.fontes), current_doc: base.doc }, autoStatus !== 'match'
                    ? cmp.cst_only
                        ? `[${i}/${elegiveis.length}] NF ${base.doc} — AVISO CST (${cmp.mismatch_count} × ${xmlRes.fonte})`
                        : `[${i}/${elegiveis.length}] NF ${base.doc} — DIVERGENTE (${cmp.mismatch_count} × ${xmlRes.fonte})`
                    : `[${i}/${elegiveis.length}] ${out.match} ok / ${out.divergentes} div / ${out.falhas} falhas`);
            }
            ledger.set(k, { id: notaId, key: k, review_status: (0, fiscal_db_1.computeReviewStatus)(autoStatus, cmp.cst_only === true), conferencia_tentativas: 0, conferencia_next_retry: null });
        }
        if (out.runId) {
            await (0, neon_1.sql) `
        UPDATE fiscal_runs SET total_notas=${out.total}, matches=${out.match},
          divergentes=${out.divergentes}, erros=${out.falhas}, pendentes=0
        WHERE id=${out.runId}`;
        }
        await setState({ fase: 'idle', conferidas: out.conferidas, match: out.match, divergentes: out.divergentes, falhas: out.falhas, puladas: out.puladas, fontes: JSON.stringify(out.fontes), current_doc: null, last_run_id: out.runId, finished_at: new Date().toISOString() }, `ciclo concluído — ${out.conferidas} conferidas: ${out.match} ok / ${out.divergentes} div / ${out.falhas} falhas (${out.puladas} puladas)`);
        return out;
    }
    catch (e) {
        out.error = e?.message || String(e);
        await setState({ fase: 'idle', error: out.error, finished_at: new Date().toISOString() }, `ciclo ERRO: ${out.error}`).catch(() => { });
        return out;
    }
}
