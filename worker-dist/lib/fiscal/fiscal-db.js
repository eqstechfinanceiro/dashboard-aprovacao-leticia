"use strict";
// Fiscal verification queue — receives structured results from the local
// Python automations (mercadoria: TOTVS×SIEG-XML com regras Lince/TES;
// serviço: TOTVS×PDF do portal) e gerencia a revisão humana.
//
// Status de revisão (fiscal_notas.review_status):
//   auto_ok         → todos os checks bateram; conta como conferido sem revisão
//   pendente        → divergência ou falha técnica; aguarda o fiscal
//   confirmado_ok   → fiscal revisou e aceitou (ex.: divergência esperada de TES)
//   confirmado_erro → fiscal confirmou erro real; gera registro em
//                     resultados_conferencias (aba de erros existente)
//   corrigida       → entrada de notas corrigiu no TOTVS; registra
//                     corrigida_by/at/nota e sai da aba de erros
//
// Importação é idempotente por (tipo, doc, serie, filial, emissao, fornecedor):
// re-rodar o mesmo dia atualiza a linha em vez de duplicar — mas NUNCA
// sobrescreve uma decisão humana (confirmado_*) nem derruba auto_ok→pendente
// quando o resultado automático continua ok.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FISCAL_DOCS_DIR = exports.ERRO_TIPOS = exports.REVIEW_STATUS = exports.AUTO_STATUS = exports.FISCAL_TIPOS = void 0;
exports.ensureFiscalTables = ensureFiscalTables;
exports.computeReviewStatus = computeReviewStatus;
exports.isCstOnlyDivergence = isCstOnlyDivergence;
exports.deleteFiscalDoc = deleteFiscalDoc;
exports.sweepOldFiscalDocs = sweepOldFiscalDocs;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const neon_1 = require("../db/neon");
let tableEnsured = false;
exports.FISCAL_TIPOS = ['mercadoria', 'servico', 'vexpenses'];
exports.AUTO_STATUS = ['match', 'divergente', 'erro', 'pendente'];
exports.REVIEW_STATUS = ['auto_ok', 'auto_ok_aviso', 'pendente', 'falha_tecnica', 'confirmado_ok', 'confirmado_erro', 'corrigida', 'cancelado'];
// Categorias de erro confirmado → coluna `erro` de resultados_conferencias.
// Mantém compatibilidade com os 3 tipos históricos.
exports.ERRO_TIPOS = [
    'valor_errado',
    'tipo_errado',
    'fornecedor_errado',
    'tes_errado',
    'imposto_errado',
    'doc_invalido',
    'sem_documento',
    'outro',
];
async function ensureFiscalTables() {
    if (tableEnsured || !neon_1.sql)
        return;
    tableEnsured = true;
    await (0, neon_1.sql) `
    CREATE TABLE IF NOT EXISTS fiscal_runs (
      id BIGSERIAL PRIMARY KEY,
      tipo TEXT NOT NULL,
      date_from DATE NOT NULL,
      date_to DATE NOT NULL,
      hostname TEXT,
      total_notas INT NOT NULL DEFAULT 0,
      matches INT NOT NULL DEFAULT 0,
      divergentes INT NOT NULL DEFAULT 0,
      erros INT NOT NULL DEFAULT 0,
      pendentes INT NOT NULL DEFAULT 0,
      relatorio_nome TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
    await (0, neon_1.sql) `
    CREATE TABLE IF NOT EXISTS fiscal_notas (
      id BIGSERIAL PRIMARY KEY,
      run_id BIGINT REFERENCES fiscal_runs(id) ON DELETE SET NULL,
      tipo TEXT NOT NULL,
      doc TEXT NOT NULL,
      serie TEXT,
      filial TEXT,
      fornecedor TEXT,
      cnpj TEXT,
      valor NUMERIC(14,2),
      emissao DATE,
      chave_acesso TEXT,
      auto_status TEXT NOT NULL,
      auto_resumo TEXT,
      checks JSONB,
      extra JSONB,
      review_status TEXT NOT NULL,
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      review_nota TEXT,
      erro_tipo TEXT,
      erro_descricao TEXT,
      resultados_id INT,
      doc_path TEXT,
      doc_nome TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
    // Dedup com COALESCE: UNIQUE comum deixaria NULLs distintos e duplicaria
    // notas sem serie/emissao na reimportação.
    await (0, neon_1.sql) `
    CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_notas_dedup ON fiscal_notas(
      tipo, doc,
      COALESCE(serie, ''),
      COALESCE(filial, ''),
      COALESCE(emissao, '1900-01-01'::date),
      COALESCE(fornecedor, '')
    )
  `;
    await (0, neon_1.sql) `CREATE INDEX IF NOT EXISTS idx_fiscal_notas_review ON fiscal_notas(review_status, tipo, emissao DESC)`;
    await (0, neon_1.sql) `CREATE INDEX IF NOT EXISTS idx_fiscal_notas_run ON fiscal_notas(run_id)`;
    // Colunas adicionadas depois da criação inicial da tabela.
    await (0, neon_1.sql) `ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS doc_path TEXT`;
    await (0, neon_1.sql) `ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS doc_nome TEXT`;
    await (0, neon_1.sql) `ALTER TABLE fiscal_runs ADD COLUMN IF NOT EXISTS push_version TEXT`;
    // Cancelamento de nota com erro confirmado (decisão do outro setor —
    // ex.: NF cancelada no TOTVS). Guarda quem/quando/motivo.
    await (0, neon_1.sql) `ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS cancelled_by TEXT`;
    await (0, neon_1.sql) `ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`;
    await (0, neon_1.sql) `ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS cancel_motivo TEXT`;
    // Correção pelo setor de entrada de notas (erro confirmado → corrigida no
    // TOTVS). Guarda quem corrigiu, quando e como (nota livre da correção).
    await (0, neon_1.sql) `ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS corrigida_by TEXT`;
    await (0, neon_1.sql) `ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS corrigida_at TIMESTAMPTZ`;
    await (0, neon_1.sql) `ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS corrigida_nota TEXT`;
    // Status em que a nota estava quando marcada corrigida ('confirmado_erro'
    // ou 'cancelado') — usado pelo "desfazer correção" pra restaurar o estado
    // certo (uma nota cancelada+corrigida volta a ser cancelada, não erro).
    await (0, neon_1.sql) `ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS corrigida_de TEXT`;
    // Anexos extras do portal EQS (serviço): todos os documentos do processo,
    // não só o primeiro tipo 'G' que o runner baixa.
    await (0, neon_1.sql) `
    CREATE TABLE IF NOT EXISTS fiscal_notas_docs (
      id BIGSERIAL PRIMARY KEY,
      nota_id BIGINT NOT NULL REFERENCES fiscal_notas(id) ON DELETE CASCADE,
      arquivo_id BIGINT NOT NULL,
      nome TEXT NOT NULL,
      tipo TEXT,
      path TEXT NOT NULL,
      size INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (nota_id, arquivo_id)
    )
  `;
    await (0, neon_1.sql) `CREATE INDEX IF NOT EXISTS idx_fiscal_notas_docs_nota ON fiscal_notas_docs(nota_id)`;
    // Cache do status de borderô (SEA/SE2) — preenchido em batch pelo worker
    // (syncBorderoStatus) e lido pela fila do contas a pagar + página fiscal.
    await (0, neon_1.sql) `
    CREATE TABLE IF NOT EXISTS fiscal_bordero_status (
      nota_id        BIGINT PRIMARY KEY REFERENCES fiscal_notas(id) ON DELETE CASCADE,
      em_bordero     BOOLEAN NOT NULL DEFAULT FALSE,
      pago           BOOLEAN NOT NULL DEFAULT FALSE,
      borderos       JSONB NOT NULL DEFAULT '[]',
      checked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      check_error    TEXT,
      remocao_confirmada_at TIMESTAMPTZ,
      remocao_confirmada_by TEXT,
      removida_detectada_at TIMESTAMPTZ
    )
  `;
    await (0, neon_1.sql) `CREATE INDEX IF NOT EXISTS idx_fbs_fila ON fiscal_bordero_status(em_bordero, remocao_confirmada_at)`;
    // Monitor de re-lançamento de notas canceladas — fingerprint do estado
    // TOTVS (SF1+SD1) gravado na conferência e re-verificado em batch; mudança
    // com SF1 ativa = a nota foi re-digitada.
    await (0, neon_1.sql) `ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS monitor_fingerprint TEXT`;
    await (0, neon_1.sql) `ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS monitor_status TEXT`;
    await (0, neon_1.sql) `ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS monitor_checked_at TIMESTAMPTZ`;
    await (0, neon_1.sql) `ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS monitor_detail JSONB`;
}
// cstOnly: todas as divergências são "Origem CST" — campo informativo que o
// fiscal já validou como ruído. Auto-aprova com aviso em vez de pendente.
function computeReviewStatus(autoStatus, cstOnly = false) {
    if (autoStatus === 'match')
        return 'auto_ok';
    if (autoStatus === 'erro')
        return 'falha_tecnica'; // download/parse — não é erro fiscal
    if (autoStatus === 'divergente' && cstOnly)
        return 'auto_ok_aviso';
    return 'pendente';
}
// Detecta nos checks persistidos (flat ou por item) se todas as divergências
// são só "Origem CST" — usado pelo import legado e pelo backfill.
function isCstOnlyDivergence(checks) {
    if (!checks)
        return false;
    const flat = [];
    // Aceita os dois shapes persistidos: array flat / array-por-item / CompareResult.
    const arr = Array.isArray(checks)
        ? checks
        : checks.header_checks || checks.item_checks
            ? [...(checks.header_checks || []), ...(checks.item_checks || [])]
            : [];
    for (const c of arr) {
        if (Array.isArray(c))
            flat.push(...c);
        else
            flat.push(c);
    }
    const falhas = flat.filter((c) => c && c.match === false);
    return falhas.length > 0 &&
        falhas.every((c) => (String(c.field || '').split('·').pop() || '').trim() === 'Origem CST');
}
const FISCAL_DOCS_DIR = () => path_1.default.join(process.cwd(), 'private-downloads', 'fiscal');
exports.FISCAL_DOCS_DIR = FISCAL_DOCS_DIR;
// Remove o documento anexado de uma nota (disco + referência). Falha nunca
// quebra o fluxo — arquivo órfão é limpo pelo sweep.
async function deleteFiscalDoc(notaId) {
    if (!neon_1.sql)
        return;
    try {
        const rows = await (0, neon_1.sql) `SELECT doc_path FROM fiscal_notas WHERE id = ${notaId}`;
        const rel = String(rows[0]?.doc_path || '');
        if (rel.startsWith('fiscal/')) {
            try {
                (0, fs_1.unlinkSync)(path_1.default.join(process.cwd(), 'private-downloads', rel));
            }
            catch {
                /* arquivo já não existe */
            }
        }
        await (0, neon_1.sql) `UPDATE fiscal_notas SET doc_path = NULL, doc_nome = NULL WHERE id = ${notaId}`;
        const docs = await (0, neon_1.sql) `SELECT id, path FROM fiscal_notas_docs WHERE nota_id = ${notaId}`;
        for (const d of docs) {
            const rel2 = String(d.path || '');
            if (rel2.startsWith('fiscal/')) {
                try {
                    (0, fs_1.unlinkSync)(path_1.default.join(process.cwd(), 'private-downloads', rel2));
                }
                catch { }
            }
        }
        await (0, neon_1.sql) `DELETE FROM fiscal_notas_docs WHERE nota_id = ${notaId}`;
    }
    catch {
        /* noop */
    }
}
// Retenção de documentos na VPS:
//  - confirmado_erro → mantém (evidência da aba de erros)
//  - demais status → apaga após DOC_RETENTION_DAYS dias
// Chamado uma vez por importação; remove o arquivo físico e zera as colunas.
async function sweepOldFiscalDocs() {
    if (!neon_1.sql)
        return 0;
    const dir = (0, exports.FISCAL_DOCS_DIR)();
    const old = await (0, neon_1.sql) `
    SELECT id, doc_path FROM fiscal_notas
    WHERE doc_path IS NOT NULL
      AND review_status <> 'confirmado_erro'
      AND created_at < NOW() - INTERVAL '90 days'
  `;
    let removed = 0;
    for (const r of old) {
        const rel = String(r.doc_path || '');
        if (!rel.startsWith('fiscal/'))
            continue;
        try {
            (0, fs_1.unlinkSync)(path_1.default.join(process.cwd(), 'private-downloads', rel));
            removed++;
        }
        catch {
            /* arquivo já não existe — limpa referência mesmo assim */
        }
        await (0, neon_1.sql) `UPDATE fiscal_notas SET doc_path = NULL, doc_nome = NULL WHERE id = ${r.id}`;
    }
    // Mesma retenção pros anexos extras do portal (fiscal_notas_docs).
    try {
        const oldDocs = await (0, neon_1.sql) `
      SELECT d.id, d.path FROM fiscal_notas_docs d
      JOIN fiscal_notas n ON n.id = d.nota_id
      WHERE n.review_status <> 'confirmado_erro'
        AND n.created_at < NOW() - INTERVAL '90 days'
    `;
        for (const d of oldDocs) {
            const rel = String(d.path || '');
            if (rel.startsWith('fiscal/')) {
                try {
                    (0, fs_1.unlinkSync)(path_1.default.join(process.cwd(), 'private-downloads', rel));
                    removed++;
                }
                catch { }
            }
            await (0, neon_1.sql) `DELETE FROM fiscal_notas_docs WHERE id = ${d.id}`;
        }
    }
    catch { }
    return removed;
}
