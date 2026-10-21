"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolverComprovantesPortal = resolverComprovantesPortal;
/**
 * Resolução de comprovantes FGTS via portal EQS.
 *
 * Guias FGTS pagas por PIX QR trafegam no portal como processos de pagamento
 * (docs CBME**), cada um com a guia GFD anexada no portal antigo (Django):
 *   - FGTSRESCISRIO/RELATRIOFGTS.pdf → guia: nº, Total da Guia, vencimento e o
 *     hash `cobv/...` do PIX Copia e Cola (o mesmo hash do urlQr do J52 da
 *     remessa) — chave determinística remessa↔processo.
 *   - RELATRIOFGTS.pdf → relação de trabalhadores (nome, CPF, matrícula e
 *     decomposição por competência/tipo de depósito).
 *
 * Casos resolvidos:
 *   - 'sem_par_txt' (comprovante pago fora da remessa): casa por
 *     valor+vencimento contra os processos do portal; a guia confirma o total
 *     e identifica o trabalhador.
 *   - 'valor_ambiguo' (2+ entradas .rem com mesmo valor+data): o cobv do urlQr
 *     da entrada pareada localiza a guia — confirmando funcionário por CPF.
 */
const fs_1 = require("fs");
const path_1 = require("path");
const neon_1 = require("../db/neon");
const eqs_portal_1 = require("../fiscal/eqs-portal");
const servico_docs_1 = require("../fiscal/servico-docs");
const funcionarios_1 = require("./funcionarios");
const TENANT = '02,02';
const GUIA_MAX_BYTES = 12 * 1024 * 1024;
const VALOR_TOL_CENTS = 2; // ±R$0,02
// ---------- PDF → texto (mesmo loader do pipeline de comprovantes) ----------
async function pdfText(buffer) {
    const dynamicImport = new Function('s', 'return import(s)');
    const pdfjs = await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
    const parts = [];
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const items = (await page.getTextContent()).items;
        // Reconstrói linhas visuais (mesmo critério de linhasVisuais do folha-pdf)
        const groups = [];
        for (const it of items) {
            const y = it.transform?.[5];
            const x = it.transform?.[4];
            if (typeof y !== 'number' || typeof x !== 'number' || !it.str)
                continue;
            let g = groups.find((g) => Math.abs(g.y - y) < 3);
            if (!g) {
                g = { y, parts: [] };
                groups.push(g);
            }
            g.parts.push({ x, s: it.str });
        }
        for (const g of groups.sort((a, b) => b.y - a.y)) {
            const line = g.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(' ').replace(/\s+/g, ' ').trim();
            if (line)
                parts.push(line);
        }
    }
    return parts.join('\n');
}
function parseValorBR(s) {
    if (!s)
        return null;
    const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}
function parseDataBR(s) {
    const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s || '');
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
// ---------- Parse da guia GFD (FGTSRESCISRIO.pdf) ----------
function parseGuiaFgts(text) {
    // cobv caixa = hash hex de 32 chars (o copia-e-cola continua grudado depois,
    // então [0-9a-z]+ comeria o resto do payload). Tesouro (apipix) não aparece
    // em guias FGTS.
    const cobv = /cobv\/([0-9a-f]{32})/i.exec(text)?.[1] || null;
    const identificador = /(\d{14,16}-\d)/.exec(text)?.[1] || null;
    const totalGuia = parseValorBR(/Total da Guia\s*:?\s*([\d.,]+)/i.exec(text)?.[1]);
    const vencimento = parseDataBR(/Pagar este documento at[ée]\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text)?.[1]) ||
        parseDataBR(/Vencimento da Guia\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text)?.[1]);
    // Linha "Núm. de Pág. | Identificador | Tag": a tag costuma ser o nome do
    // trabalhador quando a guia é individual.
    let tag = null;
    const tagM = /\d{14,16}-\d\s+([A-ZÀ-Ý][A-ZÀ-Ý0-9 ]{4,})\s/.exec(text);
    if (tagM)
        tag = tagM[1].trim();
    const composicao = [];
    for (const m of text.matchAll(/(\d{2}\/\d{4})\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/g)) {
        composicao.push(`comp ${m[1]}: FGTS mensal ${m[3]}, rescisório ${m[4]}, compensatória ${m[5]}, encargos ${m[6]} → ${m[7]}`);
    }
    return { cobv, identificador, totalGuia, vencimento, tag, composicao };
}
// ---------- Parse do relatório (RELATRIOFGTS.pdf) ----------
function parseRelatorioFgts(text) {
    const trabalhadores = new Map();
    // Layout tabular: "10/2026  NOME  20726  066.481.959-16  101 ..."
    for (const m of text.matchAll(/\d{2}\/\d{4}\s+([A-ZÀ-Ý][A-ZÀ-Ý ]{4,}?)\s+(\d{3,})\s+(\d{3}\.\d{3}\.\d{3}-\d{2})/g)) {
        const cpf = m[3].replace(/\D/g, '');
        if (!trabalhadores.has(cpf)) {
            trabalhadores.set(cpf, { nome: m[1].trim(), cpf, matricula: m[2] });
        }
    }
    // Layout transposto (pdfjs em colunas): "Nome Trabalhador NOME NOME NOME",
    // "CPF xxx xxx", "Matrícula n n" — dedup dos valores repetidos por linha.
    if (!trabalhadores.size) {
        const nomes = [...text.matchAll(/Nome Trabalhador\s+([A-ZÀ-Ý][A-ZÀ-Ý ]+?)(?:\s+\1|$)/gm)].map((m) => m[1].trim());
        const cpfs = [...new Set([...text.matchAll(/\d{3}\.\d{3}\.\d{3}-\d{2}/g)].map((m) => m[0]))];
        const mats = [...new Set([...text.matchAll(/Matr[íi]cula\s+(\d+)/g)].map((m) => m[1]))];
        cpfs.forEach((cpf, i) => {
            const c = cpf.replace(/\D/g, '');
            if (!trabalhadores.has(c)) {
                trabalhadores.set(c, { nome: nomes[i] || nomes[0] || '', cpf: c, matricula: mats[i] || mats[0] || null });
            }
        });
    }
    const identificador = /N[úu]mero da Guia\s*:?\s*(\d{14,16}-\d)/i.exec(text)?.[1] || null;
    const totalGuia = parseValorBR(/Total da Guia \(FGTS\)\s*:?\s*([\d.,]+)/i.exec(text)?.[1]);
    return { trabalhadores: [...trabalhadores.values()], identificador, totalGuia };
}
// ---------- Portal: processos + guias ----------
function processoMin(p) {
    const chave = String(p.CDSCHAVENF || '').replace(/\s/g, '');
    return {
        recno: Number(p.NDSRECNO) || 0,
        doc: String(p.CDSDOC || '').trim(),
        chaveDocs: `${chave}${String(p.NDSRECNO).trim()}`,
        valor: Number(p.NDSVALMERC) || 0,
        vencimento: String(p.DDSPVENC || '').slice(0, 10) || null,
        emissao: String(p.DDSEMISSA || '').slice(0, 10) || null,
    };
}
/** Lista processos de pagamento cuja GUIA vence na janela [deVenc, ateVenc].
 *  DDSEMISSA_DE/ATE filtra server-side (DDSPVENC_* não existe): a guia é
 *  emitida dias antes do vencimento, então a janela de emissão cobre
 *  [-20d, +2d]. A lista é densa (~200 procs/dia) e paginada por doc — fatia
 *  a emissão em semanas pra cada sub-query caber na paginação. */
async function listarProcessos(deVenc, ateVenc) {
    const pad = (d, dias) => {
        const t = new Date(`${d}T12:00:00Z`);
        t.setUTCDate(t.getUTCDate() + dias);
        return t.toISOString().slice(0, 10);
    };
    const deEmi = pad(deVenc, -20);
    const ateEmi = pad(ateVenc, +2);
    const deMs = new Date(`${deVenc}T00:00:00Z`).getTime();
    const ateMs = new Date(`${ateVenc}T23:59:59Z`).getTime();
    const out = [];
    const seen = new Set();
    for (let a = deEmi; a <= ateEmi; a = pad(a, 7)) {
        const b = pad(a, 6) < ateEmi ? pad(a, 6) : ateEmi;
        const items = await (0, eqs_portal_1.eqsListProcpag)({ DDSEMISSA_DE: `${a}T00:00:00-03:00`, DDSEMISSA_ATE: `${b}T23:59:59-03:00` }, TENANT, 30);
        for (const it of items) {
            const p = processoMin(it);
            if (!p.recno || p.chaveDocs.length <= 8 || seen.has(p.recno))
                continue;
            const v = p.vencimento ? new Date(`${p.vencimento}T12:00:00Z`).getTime() : 0;
            if (v < deMs || v > ateMs)
                continue;
            seen.add(p.recno);
            out.push(p);
        }
    }
    return out;
}
function pickGuiaDocs(docs) {
    let guia = null;
    let relatorio = null;
    for (const d of docs) {
        const n = (d.nome || '').toUpperCase();
        if (/RELAT|DETALH/i.test(n))
            relatorio = relatorio || d;
        else if (/FGTS|GRRF|GUIA|GRF|RESC/i.test(n) || d.tipo === 'G')
            guia = guia || d;
    }
    return { guia, relatorio };
}
/** Baixa e parseia guia + relatório de um processo. */
async function guiaDoProcesso(cookies, proc) {
    const [grupo, filial] = TENANT.split(',');
    const docs = await (0, servico_docs_1.oldPortalListDocs)(cookies, grupo, filial, proc.chaveDocs);
    if (!docs.length)
        return null;
    const { guia, relatorio } = pickGuiaDocs(docs);
    const info = {
        recno: proc.recno, doc: proc.doc, identificador: null, cobv: null,
        totalGuia: null, vencimento: null, tag: null, trabalhadores: [], composicao: [],
        arquivoIds: docs.map((d) => d.arquivo_id), guiaArquivoId: guia?.arquivo_id || null,
    };
    if (guia) {
        const buf = await (0, servico_docs_1.oldPortalDownload)(cookies, guia.arquivo_id);
        if (buf && buf.length <= GUIA_MAX_BYTES) {
            Object.assign(info, parseGuiaFgts(await pdfText(buf)));
            info.guiaBuf = buf; // guarda p/ evidência
        }
    }
    if (relatorio) {
        const buf = await (0, servico_docs_1.oldPortalDownload)(cookies, relatorio.arquivo_id);
        if (buf && buf.length <= GUIA_MAX_BYTES) {
            const rel = parseRelatorioFgts(await pdfText(buf));
            info.trabalhadores = rel.trabalhadores;
            info.identificador = info.identificador || rel.identificador;
            info.totalGuia = info.totalGuia ?? rel.totalGuia;
        }
    }
    if (!info.vencimento)
        info.vencimento = proc.vencimento;
    if (info.totalGuia == null)
        info.totalGuia = proc.valor;
    return info;
}
// ---------- Funcionários ----------
function normCpf(s) {
    return (s || '').replace(/\D/g, '');
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
function findFunc(funcs, cpf, nome) {
    const c = normCpf(cpf);
    if (c.length === 11) {
        const hit = funcs.find((f) => normCpf(f.cpf) === c);
        if (hit)
            return hit;
    }
    const n = normNome(nome);
    if (n.length >= 6) {
        const hits = funcs.filter((f) => normNome(f.nome) === n);
        if (hits.length === 1)
            return hits[0];
    }
    return null;
}
// ---------- Resolução ----------
function outDir(runId) {
    return (0, path_1.join)(process.env.COMPROVANTES_OUTPUT_DIR || (0, path_1.join)(process.cwd(), 'comprovantes-output'), String(runId));
}
/**
 * Tenta identificar envios 'sem_par_txt' e 'valor_ambiguo' do run consultando o
 * portal EQS (processos CBME** na janela de vencimento dos pagamentos).
 * Resolvidos viram 'pronto' com meta.portal preenchido; os demais ficam
 * anotados com o que o portal revelou.
 */
async function resolverComprovantesPortal(runId) {
    const out = {
        tentados: 0, resolvidos: 0, identificados_sem_cadastro: 0,
        sem_processo: 0, ambiguos_confirmados: 0, erros: [],
    };
    if (!neon_1.sql || !(0, eqs_portal_1.eqsPortalConfigured)()) {
        out.erros.push({ envioId: 0, erro: 'portal EQS não configurado (PORTAL_EQS_USER/PASS)' });
        return out;
    }
    const envios = await (0, neon_1.sql) `
    SELECT id, page_num, cpf, nome, status, meta
    FROM comprovantes_envios
    WHERE run_id = ${runId} AND tipo_pagamento = 'FGTS'
      AND status IN ('sem_par_txt', 'valor_ambiguo')`;
    if (!envios.length)
        return out;
    // Janela: min/max das datas de pagamento (fallback: vencimento)
    const datas = envios
        .map((e) => String(e.meta?.dataPagamento || e.meta?.vencimento || ''))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const hoje = new Date().toISOString().slice(0, 10);
    const de = datas.length ? datas.sort()[0] : hoje;
    const ate = datas.length ? datas.sort().slice(-1)[0] : hoje;
    const pad = (d, dias) => {
        const t = new Date(`${d}T12:00:00Z`);
        t.setUTCDate(t.getUTCDate() + dias);
        return t.toISOString().slice(0, 10);
    };
    const cookies = await (0, servico_docs_1.oldPortalSession)();
    if (!cookies) {
        out.erros.push({ envioId: 0, erro: 'login no portal antigo falhou' });
        return out;
    }
    const procs = await listarProcessos(pad(de, -10), pad(ate, +10));
    const guiaCache = new Map();
    const guiaInfo = async (p) => {
        if (!guiaCache.has(p.recno))
            guiaCache.set(p.recno, await guiaDoProcesso(cookies, p).catch(() => null));
        return guiaCache.get(p.recno);
    };
    const funcs = await (0, funcionarios_1.listAllFuncionarios)();
    const candidatosPorValor = (valor) => {
        if (valor == null)
            return [];
        const cents = Math.round(valor * 100);
        return procs.filter((p) => Math.abs(Math.round(p.valor * 100) - cents) <= VALOR_TOL_CENTS);
    };
    const salvarGuia = (envioId, buf) => {
        if (!buf)
            return null;
        (0, fs_1.mkdirSync)(outDir(runId), { recursive: true });
        const p = (0, path_1.join)(outDir(runId), `guia_portal_${envioId}.pdf`);
        (0, fs_1.writeFileSync)(p, buf);
        return p;
    };
    const portalMeta = (g, guiaPath) => ({
        processo: g.recno, doc: g.doc, guia: g.identificador, guiaVenc: g.vencimento,
        totalGuia: g.totalGuia, cobv: g.cobv, composicao: g.composicao,
        trabalhadores: g.trabalhadores, arquivoIds: g.arquivoIds,
        guiaPath: guiaPath || undefined, fonte: 'portal EQS', identificadoEm: new Date().toISOString(),
    });
    for (const env of envios) {
        out.tentados++;
        try {
            const meta = env.meta || {};
            const valor = typeof meta.valor === 'number' ? meta.valor : null;
            const cands = candidatosPorValor(valor);
            const urlQrCobv = /cobv\/([0-9a-zA-Z]+)/i.exec(String(meta?.txt?.urlQr || ''))?.[1] || null;
            // valor_ambiguo: a entrada .rem pareada traz urlQr cujo cobv identifica a
            // guia exata entre os candidatos de mesmo valor.
            let guia = null;
            if (env.status === 'valor_ambiguo' && urlQrCobv) {
                for (const p of cands) {
                    const g = await guiaInfo(p);
                    if (g?.cobv === urlQrCobv) {
                        guia = g;
                        break;
                    }
                }
            }
            else {
                // sem_par_txt: o candidato único pelo valor vence; em empate o cobv não
                // ajuda (comprovante não traz cobv) — confirma pela guia mais próxima
                // do vencimento do comprovante.
                const venc = String(meta.vencimento || meta.dataPagamento || '');
                let melhor = null;
                for (const p of cands) {
                    const g = await guiaInfo(p);
                    if (!g)
                        continue;
                    const gv = g.vencimento || p.vencimento || '';
                    const dist = venc && gv ? Math.abs(new Date(gv).getTime() - new Date(venc).getTime()) : 0;
                    if (!melhor || dist < melhor.dist)
                        melhor = { g, dist };
                }
                guia = melhor?.g || null;
            }
            if (!guia) {
                out.sem_processo++;
                await (0, neon_1.sql) `UPDATE comprovantes_envios
          SET meta = meta || ${JSON.stringify({ portal: { status: 'sem_processo', tentativaEm: new Date().toISOString() } })}::jsonb
          WHERE id = ${env.id}`;
                continue;
            }
            // Confere o total: guia × comprovante (tolerância de centavos)
            const valorOk = valor == null || guia.totalGuia == null
                || Math.abs(Math.round(guia.totalGuia * 100) - Math.round(valor * 100)) <= VALOR_TOL_CENTS;
            const guiaPath = salvarGuia(env.id, guia.guiaBuf);
            delete guia.guiaBuf;
            const pm = portalMeta(guia, guiaPath);
            if (!valorOk) {
                out.sem_processo++;
                await (0, neon_1.sql) `UPDATE comprovantes_envios
          SET meta = meta || ${JSON.stringify({ portal: { ...pm, status: 'valor_divergente' } })}::jsonb
          WHERE id = ${env.id}`;
                continue;
            }
            // Trabalhador: 1 único na guia → direto; senão casa pelo CPF do envio
            // (valor_ambiguo já tem o funcionário resolvido pelo J52).
            let trabalhador = null;
            if (guia.trabalhadores.length === 1)
                trabalhador = guia.trabalhadores[0];
            else if (guia.trabalhadores.length > 1 && env.cpf) {
                trabalhador = guia.trabalhadores.find((t) => normCpf(t.cpf) === normCpf(env.cpf)) || null;
            }
            if (!trabalhador && guia.tag)
                trabalhador = { nome: guia.tag, cpf: null, matricula: null };
            const func = findFunc(funcs, trabalhador?.cpf || env.cpf, trabalhador?.nome || env.nome);
            if (env.status === 'valor_ambiguo') {
                // Entrada .rem identificada pela guia; confirma se o trabalhador da
                // guia é o mesmo do envio (CPF bate) → pareamento confirmado.
                const confere = func && normCpf(func.cpf) === normCpf(trabalhador?.cpf || env.cpf);
                if (confere || (trabalhador && normCpf(env.cpf) === normCpf(trabalhador.cpf))) {
                    out.ambiguos_confirmados++;
                    out.resolvidos++;
                    await (0, neon_1.sql) `UPDATE comprovantes_envios
            SET status = 'pronto',
                meta = meta || ${JSON.stringify({ portal: { ...pm, status: 'confirmado' } })}::jsonb,
                error = ${`Pareamento confirmado via portal: ${trabalhador?.nome || func?.nome} — guia ${guia.identificador || guia.doc} (proc. ${guia.doc}/${guia.recno})`}
            WHERE id = ${env.id}`;
                }
                else {
                    await (0, neon_1.sql) `UPDATE comprovantes_envios
            SET meta = meta || ${JSON.stringify({ portal: { ...pm, status: 'trabalhador_divergente', trabalhador } })}::jsonb
            WHERE id = ${env.id}`;
                }
                continue;
            }
            // sem_par_txt
            if (func) {
                out.resolvidos++;
                await (0, neon_1.sql) `UPDATE comprovantes_envios
          SET status = 'pronto', cpf = ${func.cpf}, nome = ${func.nome},
              regiao = ${func.regiao}, cc = ${func.cc},
              meta = meta || ${JSON.stringify({ via: 'portal_guia', portal: { ...pm, status: 'resolvido', trabalhador } })}::jsonb,
              error = ${`Paga fora da remessa — identificada via portal: ${trabalhador?.nome || func.nome} (guia ${guia.identificador || guia.doc}, proc. ${guia.doc}/${guia.recno})`}
          WHERE id = ${env.id}`;
            }
            else if (trabalhador) {
                out.identificados_sem_cadastro++;
                await (0, neon_1.sql) `UPDATE comprovantes_envios
          SET nome = ${trabalhador.nome}, cpf = ${trabalhador.cpf || env.cpf},
              meta = meta || ${JSON.stringify({ portal: { ...pm, status: 'sem_cadastro', trabalhador } })}::jsonb,
              error = ${`Portal identificou ${trabalhador.nome} (CPF ${trabalhador.cpf || '—'}) mas não consta no cadastro de funcionários`}
          WHERE id = ${env.id}`;
            }
            else {
                await (0, neon_1.sql) `UPDATE comprovantes_envios
          SET meta = meta || ${JSON.stringify({ portal: { ...pm, status: 'sem_trabalhador' } })}::jsonb
          WHERE id = ${env.id}`;
            }
        }
        catch (e) {
            out.erros.push({ envioId: env.id, erro: String(e?.message || e).slice(0, 200) });
        }
    }
    return out;
}
