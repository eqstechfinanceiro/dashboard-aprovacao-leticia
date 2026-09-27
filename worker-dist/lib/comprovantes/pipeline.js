"use strict";
// Port de docHudson.executar_automacao_sharepoint + executar_automacao.
// Diferenças proposionais em relação ao Python:
//  - Download direto do SharePoint via REST (sem temp local obrigatório)
//  - PDFs gerados são gravados em disco local (preview) E enviados ao SharePoint destino
//  - Upload ao SharePoint destino é gateado por app_settings.comprovantes_upload_enabled
//  - E2DOC é gateado por app_settings.e2doc_send_enabled (dry-run por padrão)
//  - Duplicidade no destino é verificada ANTES de enviar (status 'duplicado')
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
exports.processRun = processRun;
const fs_1 = require("fs");
const path_1 = require("path");
const sharepoint_1 = require("./sharepoint");
const pdf_1 = require("./pdf");
const funcionarios_1 = require("./funcionarios");
const e2doc_1 = require("./e2doc");
const settings_1 = require("../db/settings");
const db_1 = require("./db");
const DESTINO = sharepoint_1.SP_SITES.destino;
function outputDir(runId) {
    return (0, path_1.join)(process.env.COMPROVANTES_OUTPUT_DIR || (0, path_1.join)(process.cwd(), 'comprovantes-output'), String(runId));
}
async function funcPorCpf(caches, cpf) {
    if (!caches.funcCpf.has(cpf))
        caches.funcCpf.set(cpf, await (0, funcionarios_1.consultarPorCpf)(cpf));
    return caches.funcCpf.get(cpf);
}
async function funcPorNome(caches, nome) {
    const key = nome.toUpperCase();
    if (!caches.funcNome.has(key))
        caches.funcNome.set(key, await (0, funcionarios_1.consultarPorNomeSeguro)(nome));
    return caches.funcNome.get(key);
}
/** Dedup por pasta: lista o destino uma vez e confere o nome em memória. */
async function destinoFileExists(caches, destinoPath, fileName) {
    let names = caches.destFiles.get(destinoPath);
    if (!names) {
        names = new Set((await (0, sharepoint_1.listFiles)(DESTINO, destinoPath)).map((f) => f.name));
        caches.destFiles.set(destinoPath, names);
    }
    return names.has(fileName);
}
/**
 * Executa o envio de uma página já classificada: resolve destino, gera o PDF,
 * checa duplicidade, faz upload SP (gateado) e envio E2DOC (gateado).
 * `funcionario` é null apenas para cifra_adm (chave de documento, sem CPF).
 */
async function processarEnvio(ctx, pagina, funcionario, tipoEfetivo, nomeArquivoAdm) {
    const { runId, item, buffer, outDir, uploadEnabled, resumo, mesNum, mesVigente, anoVigente, dataPagamento, competencia, banco, dataFormatada } = ctx;
    const base = { runId, sourceFile: item.name, pageNum: pagina.pageNum };
    // CPF efetivo: da chave digitada OU do funcionário resolvido por nome
    const cpfEfetivo = pagina.cpf || funcionario?.cpf || null;
    const spec = (0, pdf_1.specPorTipo)(tipoEfetivo, mesVigente);
    if (!spec) {
        resumo.tipoIncorreto++;
        await (0, db_1.insertEnvio)({
            ...base, chave: pagina.chave, cpf: cpfEfetivo, nome: funcionario?.nome || pagina.nomeBeneficiario,
            regiao: funcionario?.regiao, cc: funcionario?.cc, tipoPagamento: tipoEfetivo,
            status: 'tipo_incorreto',
        });
        return;
    }
    const destinoPath = (0, pdf_1.buildDestinoPath)(spec, anoVigente, mesVigente, dataPagamento, pagina.pedido);
    const fileName = nomeArquivoAdm ?? (0, pdf_1.destinoFileName)(funcionario.nome, banco);
    const competenciaEnvio = tipoEfetivo === 'FOL' ? (0, pdf_1.competenciaFolha)(mesNum, anoVigente) : competencia;
    // Duplicidade: já existe no destino? (listagem da pasta cacheada por run)
    let duplicado = false;
    try {
        duplicado = await destinoFileExists(ctx.caches, destinoPath, fileName);
    }
    catch { /* se a verificação falhar, segue e registra */ }
    // Split da página (documento já carregado — sem reload por página)
    let generatedPath = null;
    let pdfBytes = null;
    try {
        pdfBytes = await (0, pdf_1.splitPdfPage)(ctx.srcDoc, pagina.pageNum - 1);
        const safeName = `${item.name.replace(/[^A-Za-z0-9_.-]/g, '_')}_p${pagina.pageNum}_${fileName.replace(/[^A-Za-z0-9_.-]/g, '_')}`;
        generatedPath = (0, path_1.join)(outDir, safeName);
        (0, fs_1.writeFileSync)(generatedPath, pdfBytes);
        resumo.gerados++;
    }
    catch (err) {
        resumo.erros++;
        await (0, db_1.insertEnvio)({
            ...base, chave: pagina.chave, cpf: cpfEfetivo, nome: funcionario?.nome || pagina.nomeBeneficiario,
            regiao: funcionario?.regiao, cc: funcionario?.cc, tipoPagamento: tipoEfetivo,
            pedido: pagina.pedido, destinoPath, destinoFilename: fileName,
            status: 'erro', error: `split falhou: ${String(err).substring(0, 300)}`,
        });
        return;
    }
    const envioBase = {
        ...base, chave: pagina.chave, cpf: cpfEfetivo, nome: funcionario?.nome || pagina.nomeBeneficiario,
        regiao: funcionario?.regiao, cc: funcionario?.cc, tipoPagamento: tipoEfetivo,
        pedido: pagina.pedido, modeloDocumento: spec.modeloDocumento, competencia: competenciaEnvio,
        destinoPath, destinoFilename: fileName, generatedPdfPath: generatedPath,
    };
    if (duplicado) {
        resumo.duplicados++;
        await (0, db_1.insertEnvio)({ ...envioBase, status: 'duplicado' });
        return;
    }
    // Upload SharePoint destino (gateado)
    if (uploadEnabled) {
        try {
            await (0, sharepoint_1.uploadFile)(DESTINO, destinoPath, fileName, pdfBytes);
            ctx.caches.destFiles.get(destinoPath)?.add(fileName);
        }
        catch (err) {
            resumo.erros++;
            await (0, db_1.insertEnvio)({ ...envioBase, status: 'erro', error: `upload SP falhou: ${String(err).substring(0, 300)}` });
            return;
        }
    }
    // E2DOC (gateado internamente; ADM não envia; sem funcionário/CPF não há como enviar)
    if (!spec.enviaE2Doc || !spec.modeloDocumento || !funcionario || !cpfEfetivo) {
        await (0, db_1.insertEnvio)({ ...envioBase, status: uploadEnabled ? 'enviado_sp' : 'gerado' });
        resumo.enviados++;
        return;
    }
    const envio = await (0, e2doc_1.enviarComprovante)({
        cpf: cpfEfetivo, nome: funcionario.nome, regiao: funcionario.regiao,
        centroCusto: funcionario.cc, banco, competencia: competenciaEnvio,
        dataFormatada, modeloDocumento: spec.modeloDocumento,
        modeloPasta: spec.modeloPasta, label: spec.label, pedido: pagina.pedido,
        pdfBuffer: pdfBytes,
    });
    if (!envio.ok) {
        resumo.erros++;
        await (0, db_1.insertEnvio)({ ...envioBase, status: 'e2doc_erro', error: envio.error || 'falha E2DOC' });
        return;
    }
    resumo.enviados++;
    await (0, db_1.insertEnvio)({
        ...envioBase,
        status: envio.dryRun ? (uploadEnabled ? 'enviado_sp_dryrun' : 'dryrun') : 'enviado_e2doc',
    });
}
async function processRun(run) {
    const hoje = new Date();
    const dataFormatada = hoje.toISOString().slice(0, 10);
    const uploadEnabled = (await (0, settings_1.getSetting)('comprovantes_upload_enabled')) === true;
    // Caches e contadores de progresso do run inteiro
    const caches = {
        funcCpf: new Map(), funcNome: new Map(), destFiles: new Map(), lastProgressAt: 0,
    };
    let pagesProcessed = 0;
    let totalPages = 0; // páginas conhecidas (soma dos arquivos já analisados)
    let filesAnalyzed = 0;
    /**
     * Progresso throttled — antes era 1 UPDATE no banco por página processada.
     * `force` furta o throttle em mudanças de fase/arquivo.
     */
    const reportProgress = async (extra, force = false) => {
        const now = Date.now();
        if (!force && now - caches.lastProgressAt < 400)
            return;
        caches.lastProgressAt = now;
        await (0, db_1.updateRunProgress)(run.id, {
            totalFiles: resumo.files,
            filesAnalyzed,
            pagesProcessed,
            totalPages,
            startedAt: run.started_at,
            ...extra,
        });
    };
    const resumo = {
        files: 0, pages: 0, enviados: 0, gerados: 0, duplicados: 0,
        semChave: 0, cpfNaoEncontrado: 0, nomeNaoEncontrado: 0, tipoIncorreto: 0,
        divergentes: 0, ignorados: 0, erros: 0,
        e2docDryRun: true, uploadEnabled,
    };
    try {
        // Monta a lista de trabalho: seleção explícita de arquivos OU pasta inteira
        let workItems;
        const selItems = run.selection?.items;
        if (selItems && selItems.length > 0) {
            workItems = selItems;
        }
        else {
            const site = sharepoint_1.SP_SITES[run.source] || sharepoint_1.SP_SITES.eqs;
            const sourcePath = `${site.sourceBase}/${run.year}/${run.month_folder}/${run.bank}/${run.date_folder}`;
            const allFiles = await (0, sharepoint_1.listFiles)(site, sourcePath);
            workItems = allFiles
                .filter((f) => f.name.toUpperCase().endsWith('.PDF'))
                .map((f) => ({
                source: run.source, year: run.year, month: run.month_folder,
                bank: run.bank, date: run.date_folder, url: f.url, name: f.name,
            }));
        }
        resumo.files = workItems.length;
        if (workItems.length === 0) {
            await (0, db_1.finishRun)(run.id, { ...resumo, warning: 'Nenhum PDF na seleção/pasta' });
            return;
        }
        const outDir = outputDir(run.id);
        (0, fs_1.mkdirSync)(outDir, { recursive: true });
        let fileIdx = 0;
        for (const item of workItems) {
            fileIdx++;
            // Contexto do item (define destino/competência — vem da pasta de origem)
            const mesNum = item.month.substring(0, 2);
            const mesVigente = (0, pdf_1.retornarMes)(mesNum);
            const anoVigente = item.year;
            const dataPagamento = item.date.split('-')[0];
            const competencia = `${mesNum}/${anoVigente}`;
            const banco = (0, pdf_1.retornarBanco)(item.bank);
            await reportProgress({
                phase: 'downloading', currentFile: fileIdx, currentFileName: item.name,
            }, true);
            let buffer;
            try {
                buffer = await (0, sharepoint_1.downloadFile)(item.url, sharepoint_1.SP_SITES[item.source] || sharepoint_1.SP_SITES.eqs);
            }
            catch (err) {
                resumo.erros++;
                await (0, db_1.insertEnvio)({
                    runId: run.id, sourceFile: item.name, pageNum: 0,
                    status: 'erro', error: `download falhou: ${String(err).substring(0, 300)}`,
                });
                continue;
            }
            let analise;
            let srcDoc;
            try {
                // pdfjs (texto) e pdf-lib (split) em paralelo — cada um parseia o arquivo 1 vez só
                [analise, srcDoc] = await Promise.all([
                    (0, pdf_1.analisarPdf)(buffer, item.name, (done, total) => {
                        void reportProgress({
                            phase: 'analyzing', currentFile: fileIdx, currentFileName: item.name,
                            filePages: total, filePagesDone: done,
                        });
                    }),
                    (0, pdf_1.loadPdfDoc)(buffer),
                ]);
                filesAnalyzed++;
                totalPages += analise.totalPages;
            }
            catch (err) {
                resumo.erros++;
                await (0, db_1.insertEnvio)({
                    runId: run.id, sourceFile: item.name, pageNum: 0,
                    status: 'erro', error: `leitura PDF falhou: ${String(err).substring(0, 300)}`,
                });
                continue;
            }
            // Contexto compartilhado p/ o envio de cada página
            const ctx = {
                runId: run.id, item, buffer, outDir, srcDoc, uploadEnabled, resumo,
                mesNum, mesVigente, anoVigente, dataPagamento, competencia, banco, dataFormatada,
                caches,
            };
            for (const pagina of analise.paginas) {
                resumo.pages++;
                pagesProcessed++;
                await reportProgress({
                    phase: 'processing', currentFile: fileIdx, currentFileName: item.name,
                    filePages: analise.totalPages, pageNum: pagina.pageNum,
                });
                const base = { runId: run.id, sourceFile: item.name, pageNum: pagina.pageNum };
                // --- Categorias que apenas registram o motivo do skip ---
                if (pagina.categoria === 'sispag_forn' || pagina.categoria === 'interna' || pagina.categoria === 'vendor') {
                    resumo.ignorados++;
                    const status = pagina.categoria === 'sispag_forn' ? 'fornecedor_sispag'
                        : pagina.categoria === 'interna' ? 'transferencia_interna' : 'arquivo_fornecedor';
                    await (0, db_1.insertEnvio)({ ...base, nome: pagina.nomeBeneficiario, status });
                    continue;
                }
                if (pagina.categoria === 'sem_chave') {
                    resumo.semChave++;
                    // registra nome + CPF do recebedor quando o comprovante os contém (auditoria)
                    await (0, db_1.insertEnvio)({ ...base, nome: pagina.nomeBeneficiario, cpf: pagina.cpf, status: 'sem_chave' });
                    continue;
                }
                if (pagina.categoria === 'cifra_outro') {
                    resumo.tipoIncorreto++;
                    await (0, db_1.insertEnvio)({
                        ...base, chave: pagina.chave, nome: pagina.nomeBeneficiario,
                        tipoPagamento: pagina.tipoPagamento, status: 'tipo_incorreto',
                        error: 'sufixo CIFRA desconhecido',
                    });
                    continue;
                }
                // Chave digitada conflita com o documento do recebedor → segura p/ revisão
                if (pagina.divergencia) {
                    resumo.divergentes++;
                    await (0, db_1.insertEnvio)({
                        ...base, chave: pagina.chave, cpf: pagina.cpf, nome: pagina.nomeBeneficiario,
                        tipoPagamento: pagina.tipoPagamento, status: 'divergencia', error: pagina.divergencia,
                    });
                    continue;
                }
                // --- CIFRA<doc><sufixo oficial>: doc de empresa, sem funcionário, nome vem do beneficiário ---
                if (pagina.categoria === 'cifra_adm') {
                    const nomeArq = (0, pdf_1.sanitizeFileName)(pagina.nomeBeneficiario || pagina.chave || `pagina_${pagina.pageNum}`);
                    await processarEnvio(ctx, pagina, null, pagina.tipoPagamento || 'ADM', nomeArq);
                    continue;
                }
                // --- Categorias que resolvem funcionário (chave, cifra_cpf, sispag_sal, name_lookup) ---
                const nomesAlvo = pagina.categoria === 'sispag_sal'
                    ? pagina.nomesCreditados
                    : [pagina.nomeBeneficiario];
                for (const nomeAlvo of nomesAlvo) {
                    let funcionario = null;
                    if (pagina.cpf)
                        funcionario = await funcPorCpf(caches, pagina.cpf);
                    if (!funcionario && nomeAlvo &&
                        (pagina.categoria === 'sispag_sal' || pagina.categoria === 'name_lookup')) {
                        funcionario = await funcPorNome(caches, nomeAlvo);
                    }
                    if (!funcionario) {
                        if (pagina.cpf)
                            resumo.cpfNaoEncontrado++;
                        else
                            resumo.nomeNaoEncontrado++;
                        await (0, db_1.insertEnvio)({
                            ...base, chave: pagina.chave, cpf: pagina.cpf,
                            nome: nomeAlvo || pagina.nomeBeneficiario, tipoPagamento: pagina.tipoPagamento,
                            status: pagina.cpf ? 'cpf_nao_encontrado' : 'nome_nao_encontrado',
                        });
                        continue;
                    }
                    await processarEnvio(ctx, pagina, funcionario, pagina.tipoPagamento || 'FOL', null);
                }
            }
        }
        resumo.e2docDryRun = !(await Promise.resolve().then(() => __importStar(require('./e2doc'))).then((m) => m.isE2DocSendEnabled()));
        await (0, db_1.finishRun)(run.id, resumo);
        try {
            const { enviarRelatorioRun } = await Promise.resolve().then(() => __importStar(require('./email')));
            await enviarRelatorioRun(run.id, resumo);
        }
        catch (err) {
            console.error(`[comprovantes] e-mail do run #${run.id} falhou:`, err);
        }
    }
    catch (err) {
        await (0, db_1.failRun)(run.id, err instanceof Error ? err.message : String(err));
    }
}
