"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureServicoValidarCols = ensureServicoValidarCols;
exports.revalidarServicos = revalidarServicos;
/**
 * Revalidação server-side de notas de serviço (NFS).
 *
 * Port de download-notas-de-servico/totvs_api._validate_pdf com 2 melhorias:
 *
 * 1. Multi-doc — valida TODOS os anexos do processo (fiscal_notas_docs), não
 *    só o primeiro 'G' que o runner baixou. O anexo que confere vira evidência
 *    (validated_doc_id) e entra no resumo — boleto anexado não derruba a nota.
 *
 * 2. PDF-imagem SEM OCR — quando nenhum anexo tem texto extraível, a
 *    identidade da nota é conferida pelos metadados do processo de pagamento
 *    (wsrprocpag: CDSDOC, CDSFORNEC, NDSVLNF, DDSEMISSA). Tudo batendo →
 *    auto_ok_aviso ("conferido por metadados — conteúdo não lido").
 *    Divergência hard → pendente. Sem processo → segue falha_tecnica.
 */
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const neon_1 = require("../db/neon");
const servico_docs_1 = require("./servico-docs");
const pdf_to_image_1 = require("../ai/pdf-to-image");
const eqs_portal_1 = require("./eqs-portal");
const TENANTS = ['02,02', '11,01'];
const MAX_EXTRACT_PAGES = 80; // faturas longas (HAPVIDA 63p) precisam cobrir tudo
const VALOR_TOL = 0.10;
let colsEnsured = false;
async function ensureServicoValidarCols() {
    if (colsEnsured || !neon_1.sql)
        return;
    colsEnsured = true;
    await (0, servico_docs_1.ensureServicoDocsTable)();
    await (0, neon_1.sql) `ALTER TABLE fiscal_notas_docs ADD COLUMN IF NOT EXISTS extracted_text TEXT`;
    await (0, neon_1.sql) `ALTER TABLE fiscal_notas_docs ADD COLUMN IF NOT EXISTS text_source TEXT`;
    await (0, neon_1.sql) `ALTER TABLE fiscal_notas_docs ADD COLUMN IF NOT EXISTS text_extracted_at TIMESTAMPTZ`;
    await (0, neon_1.sql) `ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS validated_doc_id BIGINT`;
}
// ── Validação de texto (port de _validate_pdf / _find_amount_in_text) ────────
function findAmountInText(text, amount) {
    if (!amount)
        return true;
    const val = Number(amount);
    if (!isFinite(val) || val === 0)
        return true;
    const br = val
        .toFixed(2)
        .replace('.', '#')
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
        .replace('#', ',');
    const candidates = new Set([
        br,
        val.toFixed(2).replace('.', ','),
        `R$${br}`,
        `R$ ${br}`,
        val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        val.toFixed(2),
    ]);
    if (Number.isInteger(val)) {
        const i = String(Math.trunc(val));
        candidates.add(i);
        candidates.add(`${i},00`);
        candidates.add(`${i}.00`);
        candidates.add(`R$ ${i},00`);
        candidates.add(`R$${i},00`);
    }
    for (const c of candidates)
        if (text.includes(c))
            return true;
    return false;
}
function docCandidates(doc) {
    const d = String(doc || '').trim();
    if (!d)
        return [];
    const docInt = d.replace(/^0+/, '') || '0';
    const out = new Set([d, docInt]);
    if (docInt.length > 3)
        out.add(`${docInt.slice(0, -3)}.${docInt.slice(-3)}`);
    return [...out];
}
function validateServicoText(text, nota) {
    const checks = [];
    let ok = true;
    // Documento — hard fail. Substring simples (regex \b falha entre dígito e
    // letra — "47Competência"). Candidatos: doc, sem zeros, com milhar, e a
    // cauda da chave NFS-e (sequências longas de dígitos no texto).
    const cands = docCandidates(nota.doc);
    const docInt = (String(nota.doc || '').trim().replace(/^0+/, '') || '0');
    let docFound = cands.some((c) => c && text.includes(c));
    if (!docFound && docInt.length >= 2) {
        const runs = text.match(/\d{15,}/g) || [];
        docFound = runs.some((r) => r.endsWith(docInt));
    }
    if (docFound) {
        checks.push({ field: 'Documento', expected: String(nota.doc), actual: 'encontrado no PDF', match: true });
    }
    else {
        checks.push({ field: 'Documento', expected: String(nota.doc), actual: 'não encontrado no PDF', match: false });
        ok = false;
    }
    // Valor — hard fail
    const valor = Number(nota.valor) || 0;
    const valorFound = findAmountInText(text, valor);
    if (valor > 0) {
        checks.push({
            field: 'Valor',
            expected: valor.toFixed(2),
            actual: valorFound ? 'encontrado no PDF' : 'não encontrado no PDF',
            match: valorFound,
        });
        if (!valorFound)
            ok = false;
    }
    // ISS/IRRF/INSS — warnings (match=true, anotado)
    const extras = nota.extra || {};
    const warn = (field, v) => {
        const n = Number(v) || 0;
        if (n <= 0)
            return;
        checks.push({
            field,
            expected: n.toFixed(2),
            actual: findAmountInText(text, n) ? 'encontrado no PDF' : 'não encontrado (aviso)',
            match: true,
        });
    };
    warn('ISS', extras.iss);
    warn('IRRF', extras.irrf);
    warn('INSS', extras.inss);
    const resumo = checks
        .map((c) => `${c.field} ${c.match ? 'OK' : `NÃO ENCONTRADO (${c.expected})`}`)
        .join('; ');
    return { ok, docFound, valorFound, checks, resumo };
}
// ── Validação por metadados do processo (PDF-imagem, sem OCR) ────────────────
async function resolveFornecedor(cnpj) {
    for (const t of TENANTS) {
        const f = await (0, eqs_portal_1.eqsGetFornecedorByCnpj)(cnpj, t).catch(() => null);
        if (f)
            return { ...f, tenant: t };
    }
    return null;
}
async function validarPorMetadados(nota) {
    const checks = [];
    if (!(0, eqs_portal_1.eqsPortalConfigured)())
        return { status: 'sem_processo', checks, resumo: 'portal EQS não configurado' };
    const cnpj = String(nota.cnpj || nota.extra?.cnpj || '').replace(/\D/g, '');
    let fornecCod = nota.extra?.fornecedor_cod ? String(nota.extra.fornecedor_cod) : '';
    let tenant = '';
    if (!fornecCod && cnpj.length === 14) {
        const f = await resolveFornecedor(cnpj);
        if (f) {
            fornecCod = f.cod;
            tenant = f.tenant;
        }
    }
    if (!fornecCod) {
        return { status: 'sem_processo', checks, resumo: 'fornecedor SA2 não resolvido — sem processo pra conferir' };
    }
    let proc = null;
    const tentativas = tenant ? [tenant] : TENANTS;
    for (const t of tentativas) {
        proc = await (0, eqs_portal_1.eqsGetProcesso)(String(nota.doc).trim(), fornecCod, t).catch(() => null);
        if (proc) {
            tenant = t;
            break;
        }
    }
    if (!proc) {
        return { status: 'sem_processo', checks, resumo: 'sem processo no portal — anexar manualmente' };
    }
    let hardOk = true;
    const procDoc = String(proc.CDSDOC || '').trim();
    const docOk = !!procDoc && (procDoc === String(nota.doc).trim() || parseInt(procDoc, 10) === parseInt(String(nota.doc), 10));
    checks.push({ field: 'Documento', expected: String(nota.doc), actual: `${procDoc} (processo)`, match: docOk });
    if (!docOk)
        hardOk = false;
    const procValor = Number(proc.NDSVLNF ?? proc.NDSVALMERC) || 0;
    const notaValor = Number(nota.valor) || 0;
    const valorOk = notaValor <= 0 || Math.abs(procValor - notaValor) <= VALOR_TOL;
    checks.push({ field: 'Valor', expected: notaValor ? notaValor.toFixed(2) : '—', actual: `${procValor.toFixed(2)} (processo)`, match: valorOk });
    if (!valorOk)
        hardOk = false;
    const procFornec = String(proc.CDSFORNEC || '').trim();
    const fornecOk = !fornecCod || procFornec === fornecCod;
    checks.push({ field: 'Fornecedor', expected: fornecCod, actual: `${procFornec} ${proc.CENTNOME ? `(${proc.CENTNOME})` : ''}(processo)`, match: fornecOk });
    if (!fornecOk)
        hardOk = false;
    const procEmi = String(proc.DDSEMISSA || '').slice(0, 10);
    const notaEmi = nota.emissao
        ? (nota.emissao instanceof Date ? nota.emissao.toISOString().slice(0, 10) : String(nota.emissao).slice(0, 10))
        : '';
    if (procEmi && notaEmi) {
        checks.push({ field: 'Emissão', expected: notaEmi, actual: `${procEmi} (processo)`, match: true }); // warning-only
    }
    checks.push({ field: 'Conteúdo do PDF', expected: 'texto', actual: 'imagem — conferido por metadados do processo', match: true });
    return {
        status: hardOk ? 'ok' : 'divergente',
        checks,
        resumo: hardOk
            ? 'PDF sem texto — conferido por metadados do processo (doc/valor/fornecedor)'
            : 'PDF sem texto e metadados do processo divergem da nota',
        proc,
    };
}
async function validarNotaServico(notaId) {
    if (!neon_1.sql)
        return 'falha';
    const rows = await (0, neon_1.sql) `
    SELECT id, doc, valor, emissao, cnpj, fornecedor, doc_path, doc_nome, extra, review_status
    FROM fiscal_notas WHERE id = ${notaId} AND tipo = 'servico'`;
    const nota = rows[0];
    if (!nota)
        return 'skip';
    if (['confirmado_ok', 'confirmado_erro', 'cancelado', 'corrigida'].includes(nota.review_status))
        return 'skip';
    // Docs candidatos: todos os anexos do processo + o doc_path legado.
    const docs = (await (0, neon_1.sql) `SELECT id, nome, path, tipo FROM fiscal_notas_docs WHERE nota_id = ${notaId} ORDER BY (tipo='G') DESC, id`).map((d) => ({ id: d.id, nome: d.nome, path: d.path, tipo: d.tipo || '' }));
    if (nota.doc_path && !docs.some((d) => d.path === nota.doc_path)) {
        docs.push({ id: null, nome: nota.doc_nome || 'anexo', path: nota.doc_path, tipo: 'G' });
    }
    if (!docs.length)
        return 'falha';
    // Extrai texto de cada PDF (pdfjs é tolerante onde PyPDF2 morria) e valida.
    const resultados = [];
    let algumTexto = false;
    for (const d of docs) {
        let text = null;
        let source = 'none';
        if (d.id) {
            const cached = await (0, neon_1.sql) `SELECT extracted_text, text_source FROM fiscal_notas_docs WHERE id = ${d.id}`;
            if (cached[0]?.extracted_text) {
                text = cached[0].extracted_text;
                source = cached[0].text_source || 'embedded';
            }
        }
        if (text === null) {
            const abs = path_1.default.join(process.cwd(), 'private-downloads', d.path);
            try {
                const buf = (0, fs_1.readFileSync)(abs);
                if (buf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
                    text = await (0, pdf_to_image_1.extractPdfText)(buf, MAX_EXTRACT_PAGES).catch(() => null);
                    source = text ? 'embedded' : 'none';
                }
                else {
                    source = 'unreadable';
                }
            }
            catch {
                source = 'unreadable';
            }
            if (d.id) {
                await (0, neon_1.sql) `
          UPDATE fiscal_notas_docs SET
            extracted_text = ${text}, text_source = ${source},
            text_extracted_at = NOW()
          WHERE id = ${d.id}`;
            }
        }
        if (!text)
            continue;
        algumTexto = true;
        resultados.push({ doc: d, r: validateServicoText(text, nota) });
        if (resultados.some((x) => x.r.ok))
            break; // achou o anexo que valida — para
    }
    let autoStatus;
    let autoResumo;
    let checks;
    let validatedDocId = null;
    let reviewStatus;
    let extraPatch = { servico_revalidado_at: new Date().toISOString() };
    const okDoc = resultados.find((x) => x.r.ok);
    if (okDoc) {
        autoStatus = 'match';
        validatedDocId = okDoc.doc.id;
        autoResumo = `Validado contra o anexo "${okDoc.doc.nome}" — ${okDoc.r.resumo}`.slice(0, 500);
        checks = [
            ...okDoc.r.checks,
            { field: 'Anexo validado', expected: '—', actual: okDoc.doc.nome, match: true },
        ];
        reviewStatus = 'auto_ok';
    }
    else if (algumTexto) {
        // Texto existe mas nenhum anexo conferiu doc+valor — divergência real.
        autoStatus = 'divergente';
        const melhor = resultados.find((x) => x.r.docFound) || resultados[0];
        autoResumo = `Nenhum dos ${resultados.length} anexo(s) confere doc+valor — ${melhor.r.resumo}`.slice(0, 500);
        checks = [
            ...melhor.r.checks,
            { field: 'Anexos conferidos', expected: 'doc+valor', actual: `${resultados.length} anexo(s) sem match completo`, match: false },
        ];
        reviewStatus = 'pendente';
    }
    else {
        // PDF-imagem — valida por metadados do processo (sem OCR).
        const m = await validarPorMetadados(nota);
        checks = m.checks;
        extraPatch = { ...extraPatch, metadados_processo: true };
        if (m.status === 'ok') {
            autoStatus = 'match';
            autoResumo = m.resumo;
            reviewStatus = 'auto_ok_aviso';
        }
        else if (m.status === 'divergente') {
            autoStatus = 'divergente';
            autoResumo = m.resumo;
            reviewStatus = 'pendente';
        }
        else {
            await (0, neon_1.sql) `
        UPDATE fiscal_notas SET
          auto_resumo = ${m.resumo.slice(0, 500)},
          extra = (COALESCE(extra,'{}'::jsonb) || ${JSON.stringify(extraPatch)}::jsonb) - 'reconf',
          updated_at = NOW()
        WHERE id = ${notaId}`;
            return 'falha';
        }
    }
    await (0, neon_1.sql) `
    UPDATE fiscal_notas SET
      auto_status = ${autoStatus},
      auto_resumo = ${autoResumo.slice(0, 500)},
      checks = ${JSON.stringify(checks)}::jsonb,
      validated_doc_id = ${validatedDocId},
      review_status = CASE
        WHEN review_status IN ('confirmado_ok','confirmado_erro','cancelado','corrigida') THEN review_status
        ELSE ${reviewStatus}
      END,
      extra = (COALESCE(extra,'{}'::jsonb) || ${JSON.stringify(extraPatch)}::jsonb) - 'reconf',
      conferencia_next_retry = NULL,
      updated_at = NOW()
    WHERE id = ${notaId}`;
    return autoStatus === 'match' ? (reviewStatus === 'auto_ok_aviso' ? 'aviso' : 'match') : 'divergente';
}
/** Revalida notas de serviço pendentes/em falha com a validação server-side.
 * `fetchDocs` roda syncServicoDocs antes (garante os anexos do processo). */
async function revalidarServicos(opts = {}) {
    const out = {
        processadas: 0, promovidas_match: 0, promovidas_aviso: 0,
        divergentes: 0, seguem_falha: 0, puladas: 0, erros: [],
    };
    if (!neon_1.sql)
        return out;
    await ensureServicoValidarCols();
    const ids = opts.notaIds?.length ? opts.notaIds : null;
    const limit = Math.min(opts.limit ?? 15, 200);
    const notas = await (0, neon_1.sql) `
    SELECT id FROM fiscal_notas
    WHERE tipo = 'servico'
      AND review_status IN ('pendente', 'falha_tecnica')
      AND (${ids}::bigint[] IS NULL OR id = ANY(${ids}))
    ORDER BY id
    LIMIT ${limit}`;
    if (!notas.length)
        return out;
    // Garante anexos do processo antes de validar (idempotente).
    if (opts.fetchDocs !== false) {
        for (const n of notas) {
            await (0, servico_docs_1.syncServicoDocs)({ notaId: n.id }).catch(() => { });
        }
    }
    for (const n of notas) {
        out.processadas++;
        try {
            const r = await validarNotaServico(n.id);
            if (r === 'match')
                out.promovidas_match++;
            else if (r === 'aviso')
                out.promovidas_aviso++;
            else if (r === 'divergente')
                out.divergentes++;
            else if (r === 'skip')
                out.puladas++;
            else
                out.seguem_falha++;
        }
        catch (e) {
            out.erros.push({ nota_id: n.id, erro: String(e?.message || e).slice(0, 200) });
            out.seguem_falha++;
        }
    }
    return out;
}
