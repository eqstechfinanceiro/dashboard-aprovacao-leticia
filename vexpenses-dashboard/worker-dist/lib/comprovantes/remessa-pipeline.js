"use strict";
// Pipeline de remessa de folha (FO/PR/BB/BRADESCO CNAB240 + PDFs de comprovantes).
//
// Duas fases:
//  1. 'analise'  — parseia TXTs + PDFs, casa cada comprovante com o cadastro de
//     funcionários (conta > CPF do TXT > CPF embutido > nome), cruza TXT×PDF
//     e grava um envio por item. Run fica 'aguardando_confirmacao': nada é
//     enviado sem revisão do usuário.
//  2. 'envio'    — para cada item 'pronto': fragmenta o PDF (CropBox na faixa
//     do comprovante), sobe ao SharePoint destino e envia ao e2doc (ambos
//     gateados), com dedup completo (SP + e2doc) igual ao pipeline principal.
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
exports.processRemessaRun = processRemessaRun;
const fs_1 = require("fs");
const path_1 = require("path");
const neon_1 = require("../db/neon");
const sharepoint_1 = require("./sharepoint");
const pdf_1 = require("./pdf");
const funcionarios_1 = require("./funcionarios");
const e2doc_1 = require("./e2doc");
const settings_1 = require("../db/settings");
const db_1 = require("./db");
const cnab_1 = require("./cnab");
const folha_pdf_1 = require("./folha-pdf");
const DESTINO = sharepoint_1.SP_SITES.destino;
// ---------- Índice de funcionários ----------
function normDigits(s) {
    return (s || '').replace(/\D/g, '').replace(/^0+/, '');
}
function normNome(s) {
    return (s || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Z ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function addTo(map, key, v) {
    const arr = map.get(key);
    if (arr)
        arr.push(v);
    else
        map.set(key, [v]);
}
function cpfValido(cpf) {
    const d = (cpf || '').replace(/\D/g, '');
    return d.length === 11 && !/^(\d)\1{10}$/.test(d);
}
function buildFuncIndex(funcs) {
    const idx = { byCpf: new Map(), byConta: new Map(), byNome: new Map(), nomesKeys: [] };
    for (const f of funcs) {
        // Registros sujos do cadastro (nome '.', CPF '00000000000', conta vazia)
        // não entram nos índices — a chave vazia casaria com qualquer consulta.
        if (cpfValido(f.cpf))
            idx.byCpf.set(f.cpf.replace(/\D/g, ''), f);
        const conta = normDigits(f.conta?.split('-')[0] ?? f.conta);
        if (f.agencia && conta)
            addTo(idx.byConta, `${normDigits(f.agencia)}|${conta}`, f);
        if (conta)
            addTo(idx.byConta, `|${conta}`, f); // fallback sem agência
        const nomeN = normNome(f.nome);
        if (nomeN.length >= 3)
            addTo(idx.byNome, nomeN, f);
    }
    idx.nomesKeys = [...idx.byNome.keys()].filter((k) => k.length >= 3);
    return idx;
}
/** Nome do comprovante pode estar truncado (CNAB corta em 30 chars) — match por
 *  prefixo em qualquer direção. Retorna candidatos únicos. */
function funcsPorNome(idx, nome) {
    const n = normNome(nome);
    if (n.length < 8)
        return [];
    const exact = idx.byNome.get(n);
    if (exact?.length)
        return exact;
    const out = new Map();
    for (const key of idx.nomesKeys) {
        if (!key)
            continue;
        if (key.startsWith(n) || n.startsWith(key)) {
            for (const f of idx.byNome.get(key))
                out.set(f.cpf || key, f);
        }
    }
    return [...out.values()];
}
function funcsPorConta(idx, agencia, conta) {
    const c = normDigits(conta);
    if (!c)
        return [];
    const a = normDigits(agencia);
    if (a) {
        const exact = idx.byConta.get(`${a}|${c}`);
        if (exact?.length)
            return exact;
    }
    return idx.byConta.get(`|${c}`) || [];
}
// ---------- Reconciliação ----------
/** Par CNAB × comprovante: ref do pagador (Itaú), depois conta+valor, depois nome+valor. */
function matchCnab(comp, pool, usados) {
    // 'seu número' CNAB (pos 74-93) — o pagadorRef do PDF casa com ele direto
    if (comp.pagadorRef) {
        const byRef = pool.find((e) => !usados.has(e) && e.seuNumero && e.seuNumero === comp.pagadorRef);
        if (byRef)
            return byRef;
    }
    const compConta = normDigits(comp.contaNumero);
    if (compConta && comp.valor != null) {
        const cents = Math.round(comp.valor * 100);
        const byConta = pool.filter((e) => !usados.has(e)
            && normDigits(e.conta) === compConta
            && Math.round(e.valor * 100) === cents);
        if (byConta.length === 1)
            return byConta[0];
    }
    if (comp.nome && comp.valor != null) {
        const cents = Math.round(comp.valor * 100);
        const n = normNome(comp.nome);
        const byNome = pool.filter((e) => !usados.has(e)
            && Math.round(e.valor * 100) === cents
            && (normNome(e.nome) === n || normNome(e.nome).startsWith(n) || n.startsWith(normNome(e.nome))));
        if (byNome.length === 1)
            return byNome[0];
    }
    return null;
}
async function processRemessaRun(run) {
    const sel = run.selection;
    if (!sel?.dir || !Array.isArray(sel.files)) {
        await (0, db_1.failRun)(run.id, 'run remessa sem selection.dir/files');
        return;
    }
    if (sel.phase === 'envio')
        return processRemessaEnvio(run, sel);
    return processRemessaAnalise(run, sel);
}
// ---------- FASE 1: análise ----------
async function processRemessaAnalise(run, sel) {
    const resumo = {
        files: 0, comprovantes: 0, txtEntries: 0,
        prontos: 0, duplicadosPre: 0, divergentes: 0,
        semFuncionario: 0, homonimos: 0, semParTxt: 0, txtSemPdf: 0,
        formatoNaoReconhecido: 0, warnings: [],
    };
    try {
        await (0, db_1.updateRunProgress)(run.id, { phase: 'analyzing', startedAt: run.started_at });
        // 1. TXTs CNAB
        const cnabs = [];
        for (const f of sel.files.filter((x) => x.kind === 'txt')) {
            const parsed = (0, cnab_1.parseCnab)((0, fs_1.readFileSync)((0, path_1.join)(sel.dir, f.name)), f.name);
            resumo.warnings.push(...parsed.warnings.map((w) => `${f.name}: ${w}`));
            cnabs.push(parsed);
            resumo.txtEntries += parsed.entries.length;
        }
        const poolCnab = cnabs.flatMap((c) => c.entries.map((e) => ({ ...e, _file: c.fileName })));
        const usados = new Set();
        // 2. Funcionários (1 query — índice em memória)
        const funcIdx = buildFuncIndex(await (0, funcionarios_1.listAllFuncionarios)());
        // 3. PDFs → comprovantes
        const pdfs = sel.files.filter((x) => x.kind === 'pdf');
        resumo.files = sel.files.length;
        if (pdfs.length === 0) {
            await (0, db_1.finishRun)(run.id, { ...resumo, warning: 'Nenhum PDF enviado' });
            await (0, neon_1.sql) `UPDATE comprovantes_runs SET status='aguardando_confirmacao' WHERE id=${run.id}`;
            return;
        }
        // Adiantamento (vale/quinzena) é indexado no mês DO pagamento — diferente
        // da folha mensal, que fecha o mês anterior. Sinal: nome do arquivo remessa.
        const adiantamento = sel.files.some((f) => /adto|adiant/i.test(f.name));
        const esperadaDe = (dt) => dt && /^\d{4}-\d{2}-\d{2}$/.test(dt)
            ? (adiantamento ? `${dt.slice(5, 7)}/${dt.slice(0, 4)}` : (0, pdf_1.competenciaFolha)(dt.slice(5, 7), dt.slice(0, 4)))
            : null;
        let totalPages = 0;
        let pagesDone = 0;
        const compEsperadas = new Set();
        for (const f of pdfs) {
            const buf = (0, fs_1.readFileSync)((0, path_1.join)(sel.dir, f.name));
            const analise = await (0, folha_pdf_1.analisarFolhaPdf)(buf, f.name, (done, total) => {
                void (0, db_1.updateRunProgress)(run.id, {
                    phase: 'analyzing', currentFileName: f.name, filePages: total,
                    filePagesDone: done, pagesProcessed: pagesDone + done, totalPages: totalPages + total,
                });
            });
            pagesDone += analise.totalPages;
            totalPages += analise.totalPages;
            resumo.comprovantes += analise.comprovantes.length;
            resumo.warnings.push(...analise.warnings);
            if (analise.formato === 'desconhecido')
                resumo.formatoNaoReconhecido++;
            // Índice BANCO do e2doc usa o rótulo do dicionário (BANCO_E2DOC), não o
            // nome de exibição do CNAB — 'BB (BANCO DO BRASIL)' é rejeitado, 'BB' passa.
            const BANCO_POR_FORMATO = { itau_folha: 'ITAU', bradesco_rt: 'BRADESCO', bradesco_multipag: 'BRADESCO', bb_pag: 'BB' };
            const bancoTxt = cnabs.find((c) => cnab_1.BANCO_NOME[c.banco] && f.name.toUpperCase().includes(cnab_1.BANCO_NOME[c.banco].split(' ')[0]));
            const bancoItem = (bancoTxt ? (cnab_1.BANCO_E2DOC[bancoTxt.banco] || bancoTxt.bancoNome) : null)
                || BANCO_POR_FORMATO[analise.formato] || null;
            for (const comp of analise.comprovantes) {
                const base = { runId: run.id, sourceFile: f.name, pageNum: comp.pageNum };
                // Competência e2doc de folha = mês ANTERIOR ao pagamento — calculada
                // aqui pra auditar divergência contra a competência informada no run.
                const compEsperada = esperadaDe(comp.dataPagamento);
                if (compEsperada)
                    compEsperadas.add(compEsperada);
                const meta = { slot: comp.slot, crop: comp.crop, agencia: comp.agencia, conta: comp.conta, valor: comp.valor, pagadorRef: comp.pagadorRef, dataPagamento: comp.dataPagamento, competenciaEsperada: compEsperada, warnings: [] };
                // TXT pair (quando há TXT)
                let txtPair = null;
                if (poolCnab.length) {
                    txtPair = matchCnab(comp, poolCnab, usados);
                    if (txtPair)
                        usados.add(txtPair);
                }
                // Resolve funcionário: CPF do comp → CPF do TXT → conta → nome
                let func = null;
                let via = '';
                if (comp.cpf && funcIdx.byCpf.get(comp.cpf)) {
                    func = funcIdx.byCpf.get(comp.cpf);
                    via = 'cpf_pdf';
                }
                if (!func && txtPair?.cpf && funcIdx.byCpf.get(txtPair.cpf)) {
                    func = funcIdx.byCpf.get(txtPair.cpf);
                    via = 'cpf_txt';
                }
                if (!func) {
                    const porConta = funcsPorConta(funcIdx, comp.agencia, comp.contaNumero);
                    if (porConta.length === 1) {
                        func = porConta[0];
                        via = 'conta';
                    }
                    else if (porConta.length > 1)
                        meta.warnings.push(`${porConta.length} funcionários com a mesma conta`);
                }
                if (!func && comp.nome) {
                    const porNome = funcsPorNome(funcIdx, comp.nome);
                    if (porNome.length === 1) {
                        func = porNome[0];
                        via = 'nome';
                    }
                    else if (porNome.length > 1) {
                        // homônimos — tenta desempatar pela conta
                        const porConta = funcsPorConta(funcIdx, comp.agencia, comp.contaNumero);
                        const hit = porNome.find((x) => porConta.includes(x));
                        if (hit) {
                            func = hit;
                            via = 'nome+conta';
                        }
                        else {
                            resumo.homonimos++;
                            await (0, db_1.insertEnvio)({
                                ...base, nome: comp.nome, cpf: comp.cpf || txtPair?.cpf, tipoPagamento: 'FOL',
                                status: 'homonimo_ambiguo', meta: { ...meta, candidatos: porNome.map((x) => ({ cpf: x.cpf, nome: x.nome, cc: x.cc })) },
                                error: `${porNome.length} funcionários com nome compatível: ${porNome.map((x) => `${x.nome} (${x.cpf})`).join('; ').substring(0, 240)}`,
                            });
                            continue;
                        }
                    }
                }
                // Match apontou para registro de cadastro inválido (nome '.' / CPF
                // zerado) — o comprovante existe mas o funcionário não é utilizável:
                // tratar como não encontrado, nunca enviar com identidade inválida.
                if (func && (!cpfValido(func.cpf) || normNome(func.nome).length < 3)) {
                    meta.warnings.push(`cadastro inválido no banco de funcionários: nome='${func.nome}' cpf='${func.cpf}'`);
                    func = null;
                }
                const warnings = [...meta.warnings];
                if (poolCnab.length && !txtPair) {
                    warnings.push('sem_par_txt');
                    resumo.semParTxt++;
                }
                if (txtPair && comp.valor != null && Math.round(txtPair.valor * 100) !== Math.round(comp.valor * 100)) {
                    warnings.push(`valor_divergente: PDF R$${comp.valor} × TXT R$${txtPair.valor}`);
                    resumo.divergentes++;
                }
                if (!func) {
                    resumo.semFuncionario++;
                    await (0, db_1.insertEnvio)({
                        ...base, nome: comp.nome, cpf: comp.cpf || txtPair?.cpf, tipoPagamento: 'FOL',
                        status: 'sem_funcionario', meta: { ...meta, warnings },
                        error: `funcionário não encontrado (ag ${comp.agencia || '-'} cta ${comp.conta || '-'})`,
                    });
                    continue;
                }
                const divergente = warnings.some((w) => w.startsWith('valor_divergente'));
                resumo.prontos++;
                await (0, db_1.insertEnvio)({
                    ...base,
                    chave: null, cpf: func.cpf, nome: func.nome, regiao: func.regiao, cc: func.cc,
                    tipoPagamento: 'FOL', banco: bancoItem,
                    status: divergente ? 'divergencia' : 'pronto',
                    meta: { ...meta, via, warnings, txt: txtPair ? { nome: txtPair.nome, valor: txtPair.valor, cpf: txtPair.cpf, file: txtPair._file } : null },
                    error: warnings.filter((w) => w !== 'sem_par_txt').join('; ') || (warnings.includes('sem_par_txt') ? 'sem par no TXT' : null),
                });
            }
        }
        // 4. Entradas TXT sem par no PDF
        for (const e of poolCnab) {
            if (usados.has(e))
                continue;
            resumo.txtSemPdf++;
            const compEsp = esperadaDe(e.dataPagamento);
            if (compEsp)
                compEsperadas.add(compEsp);
            await (0, db_1.insertEnvio)({
                runId: run.id, sourceFile: e._file, pageNum: 0,
                nome: e.nome, cpf: e.cpf, tipoPagamento: 'FOL',
                status: 'txt_sem_pdf',
                meta: { agencia: e.agencia, conta: e.conta, valor: e.valor, dataPagamento: e.dataPagamento, competenciaEsperada: compEsp },
                error: 'presente no TXT mas nenhum comprovante correspondente no PDF',
            });
        }
        // Competência informada diverge das datas de pagamento dos comprovantes —
        // erro de operador que envia índice errado ao e2doc (folha = mês anterior).
        if (sel.competencia && compEsperadas.size > 0 && !compEsperadas.has(sel.competencia)) {
            resumo.warnings.unshift(`competencia_divergente: informada ${sel.competencia}, mas as datas de pagamento indicam ${[...compEsperadas].join(' ou ')}`);
        }
        resumo.warnings = resumo.warnings.slice(0, 50);
        await (0, neon_1.sql) `UPDATE comprovantes_runs SET result = ${JSON.stringify({ analise: resumo })}::jsonb, status = 'aguardando_confirmacao', finished_at = NOW() WHERE id = ${run.id}`;
    }
    catch (err) {
        await (0, db_1.failRun)(run.id, err instanceof Error ? err.message : String(err));
    }
}
// ---------- FASE 2: envio ----------
async function processRemessaEnvio(run, sel) {
    const hoje = new Date();
    const dataFormatada = hoje.toISOString().slice(0, 10);
    const uploadEnabled = (await (0, settings_1.getSetting)('comprovantes_upload_enabled')) === true;
    const resumo = { enviados: 0, gerados: 0, duplicados: 0, erros: 0, skipped: 0 };
    const outDir = (0, path_1.join)(process.env.COMPROVANTES_OUTPUT_DIR || (0, path_1.join)(process.cwd(), 'comprovantes-output'), String(run.id));
    (0, fs_1.mkdirSync)(outDir, { recursive: true });
    // Itens prontos gravados na análise (ou subconjunto envio seletivo/teste)
    const onlyIds = sel.onlyEnvioIds?.filter((n) => Number.isFinite(n)) || [];
    const itens = onlyIds.length
        ? await (0, neon_1.sql) `
        SELECT * FROM comprovantes_envios
        WHERE run_id = ${run.id} AND id = ANY(${onlyIds})
          AND status IN ('pronto','divergencia')
        ORDER BY source_file, page_num, (meta->>'slot')::int NULLS FIRST
      `
        : await (0, neon_1.sql) `
        SELECT * FROM comprovantes_envios
        WHERE run_id = ${run.id} AND status IN ('pronto','divergencia')
        ORDER BY source_file, page_num, (meta->>'slot')::int NULLS FIRST
      `;
    // Carrega cada PDF uma vez só
    const docCache = new Map();
    const destFiles = new Map();
    const destinoFileExists = async (path, name) => {
        let s = destFiles.get(path);
        if (!s) {
            s = new Set((await (0, sharepoint_1.listFiles)(DESTINO, path)).map((f) => f.name));
            destFiles.set(path, s);
        }
        return s.has(name);
    };
    // Pool de envio: e2doc (4 calls HTTP/doc) é o gargalo — I/O paralelo.
    // SharePoint fica serializado via mutex (página Playwright única) e com
    // espaçamento mínimo + retry com backoff em 429 (throttle do SP).
    const CONCURRENCY = 6;
    const SP_MIN_GAP_MS = 700;
    let spLock = Promise.resolve();
    let spLast = 0;
    const spUploadOnce = async (path, name, buf) => {
        const gap = Date.now() - spLast;
        if (gap < SP_MIN_GAP_MS)
            await new Promise((r) => setTimeout(r, SP_MIN_GAP_MS - gap));
        let lastErr;
        for (let tent = 0; tent < 4; tent++) {
            try {
                await (0, sharepoint_1.uploadFile)(DESTINO, path, name, buf);
                spLast = Date.now();
                return;
            }
            catch (err) {
                lastErr = err;
                const is429 = /429|throttl/i.test(String(err));
                if (!is429 || tent === 3)
                    throw err;
                await new Promise((r) => setTimeout(r, 4000 * (tent + 1)));
            }
        }
        throw lastErr;
    };
    const spUpload = (path, name, buf) => {
        const p = spLock.then(() => spUploadOnce(path, name, buf));
        spLock = p.then(() => undefined, () => undefined);
        return p;
    };
    let done = 0;
    const processItem = async (it) => {
        const meta = it.meta || {};
        try {
            const buf = (0, fs_1.readFileSync)((0, path_1.join)(sel.dir, it.source_file));
            let src = docCache.get(it.source_file);
            if (!src) {
                src = await (0, pdf_1.loadPdfDoc)(buf);
                docCache.set(it.source_file, src);
            }
            const comp = {
                pageNum: it.page_num, slot: meta.slot ?? 0, crop: meta.crop ?? null,
                nome: it.nome, agencia: meta.agencia, conta: meta.conta,
                contaNumero: meta.contaNumero ?? null, contaDv: null,
                valor: meta.valor ?? null, cpf: it.cpf, pagadorRef: meta.pagadorRef ?? null,
                dataPagamento: meta.dataPagamento ?? null,
            };
            // Fragmento
            const pdfBytes = await (0, folha_pdf_1.fragmentarComprovante)(src, comp);
            const fileName = (0, pdf_1.destinoFileName)(it.nome || `pagina_${it.page_num}`, it.banco || null);
            const safeName = `${it.source_file.replace(/[^A-Za-z0-9_.-]/g, '_')}_p${it.page_num}s${comp.slot}_${fileName.replace(/[^A-Za-z0-9_.-]/g, '_')}`;
            const generatedPath = (0, path_1.join)(outDir, safeName);
            (0, fs_1.writeFileSync)(generatedPath, pdfBytes);
            resumo.gerados++;
            // Competência/destino: data de pagamento do comprovante (fallback: mês
            // anterior ao run). O usuário pode forçar a competência e2doc no run.
            const dtPag = comp.dataPagamento || hoje.toISOString().slice(0, 10);
            const [anoVigente, mesNum] = [dtPag.slice(0, 4), dtPag.slice(5, 7)];
            const mesVigente = (0, pdf_1.retornarMes)(mesNum);
            const spec = (0, pdf_1.specPorTipo)('FOL', mesVigente);
            const destinoPath = (0, pdf_1.buildDestinoPath)(spec, anoVigente, mesVigente, dtPag.slice(8, 10), null);
            const competencia = /^\d{2}\/\d{4}$/.test(sel.competencia || '')
                ? sel.competencia
                : (meta.competenciaEsperada || (0, pdf_1.competenciaFolha)(mesNum, anoVigente));
            // Dedup completo (SP + e2doc)
            let duplicado = false;
            try {
                duplicado = await destinoFileExists(destinoPath, fileName);
            }
            catch { }
            let jaNoE2Doc = false;
            if (duplicado) {
                jaNoE2Doc = await (0, e2doc_1.existeNoE2Doc)({
                    cpf: it.cpf, competencia, modeloDocumento: spec.modeloDocumento,
                    modeloPasta: spec.modeloPasta, banco: it.banco || null,
                });
            }
            if (duplicado && jaNoE2Doc) {
                resumo.duplicados++;
                await (0, neon_1.sql) `UPDATE comprovantes_envios SET status='duplicado', destino_path=${destinoPath}, destino_filename=${fileName}, generated_pdf_path=${generatedPath} WHERE id=${it.id}`;
                return;
            }
            if (uploadEnabled && !duplicado) {
                try {
                    await spUpload(destinoPath, fileName, pdfBytes);
                    destFiles.get(destinoPath)?.add(fileName);
                }
                catch (err) {
                    resumo.erros++;
                    await (0, neon_1.sql) `UPDATE comprovantes_envios SET status='erro', error=${`upload SP falhou: ${String(err).substring(0, 300)}`} WHERE id=${it.id}`;
                    return;
                }
            }
            const envio = await (0, e2doc_1.enviarComprovante)({
                cpf: it.cpf, nome: it.nome, regiao: it.regiao || '', centroCusto: it.cc || '',
                banco: it.banco || null, competencia, dataFormatada,
                modeloDocumento: spec.modeloDocumento, modeloPasta: spec.modeloPasta,
                label: spec.label, pdfBuffer: pdfBytes,
            });
            if (!envio.ok) {
                resumo.erros++;
                await (0, neon_1.sql) `UPDATE comprovantes_envios SET status='e2doc_erro', error=${envio.error || 'falha E2DOC'}, generated_pdf_path=${generatedPath} WHERE id=${it.id}`;
                return;
            }
            resumo.enviados++;
            await (0, neon_1.sql) `UPDATE comprovantes_envios SET
        status=${envio.dryRun ? (uploadEnabled ? 'enviado_sp_dryrun' : 'dryrun') : 'enviado_e2doc'},
        destino_path=${destinoPath}, destino_filename=${fileName},
        modelo_documento=${spec.modeloDocumento}, competencia=${competencia}, generated_pdf_path=${generatedPath}
        WHERE id=${it.id}`;
        }
        catch (err) {
            resumo.erros++;
            await (0, neon_1.sql) `UPDATE comprovantes_envios SET status='erro', error=${String(err).substring(0, 300)} WHERE id=${it.id}`;
        }
        done++;
        if (done % 25 === 0 || done === itens.length) {
            await (0, db_1.updateRunProgress)(run.id, {
                phase: 'processing', currentFileName: it.source_file, pageNum: it.page_num,
                pagesProcessed: done, totalPages: itens.length,
            }).catch(() => { });
        }
    };
    let idx = 0;
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, itens.length) }, async () => {
        while (idx < itens.length) {
            const it = itens[idx++];
            await processItem(it);
        }
    }));
    await (0, db_1.finishRun)(run.id, resumo);
    try {
        const { enviarRelatorioRun } = await Promise.resolve().then(() => __importStar(require('./email')));
        await enviarRelatorioRun(run.id, resumo);
    }
    catch (err) {
        console.error(`[remessa] e-mail do run #${run.id} falhou:`, err);
    }
}
