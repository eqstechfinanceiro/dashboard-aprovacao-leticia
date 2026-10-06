"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SD1_SB1_FIELDS = exports.SF1_SA2_FIELDS = void 0;
exports.decodeUserlgi = decodeUserlgi;
exports.fetchMercadoriaNfs = fetchMercadoriaNfs;
exports.fetchZ01XmlByChave = fetchZ01XmlByChave;
/**
 * Conferência de mercadoria — consulta TOTVS REST (SF1+SA2 cabeçalho,
 * SD1+SB1 itens) para NFs lançadas (bot OU humano), EQS + BRATEC.
 *
 * Port de conferencia-notas-mercadoria/totvs_mercadoria_api.py sobre o client
 * compartilhado lib/impacto/totvs.ts (cookie + OAuth2 + genericQuery paginada).
 */
const totvs_1 = require("../impacto/totvs");
exports.SF1_SA2_FIELDS = [
    'F1_FILIAL', 'F1_DOC', 'F1_SERIE', 'F1_FORNECE', 'F1_LOJA', 'F1_EMISSAO', 'F1_VALBRUT',
    'F1_DTDIGIT', 'F1_DTLANC', 'F1_ESPECIE', 'F1_HORA', 'F1_COND', 'F1_TIPO',
    'F1_DESCONT', 'F1_IRRF', 'F1_INSS', 'F1_ISS', 'F1_STATUS', 'F1_USERLGI',
    'F1_TIPODOC', 'F1_VALPIS', 'F1_VALCSLL', 'F1_CHVNFE', 'F1_NATUREZ',
    'F1_VALICMS', 'F1_VALIPI', 'F1_BRICMS', 'F1_BRIPI', 'F1_ICMST',
    'A2_NOME', 'A2_CGC',
].join(',');
exports.SD1_SB1_FIELDS = [
    'D1_FILIAL', 'D1_DOC', 'D1_SERIE', 'D1_FORNECE', 'D1_LOJA', 'D1_COD', 'D1_ITEM',
    'D1_QUANT', 'D1_VUNIT', 'D1_TOTAL', 'D1_VALICMS', 'D1_VALIPI', 'D1_TES', 'D1_CF',
    'D1_BASEICM', 'D1_BASEIPI', 'D1_VALDESC', 'D1_CLASFIS',
    'B1_DESC', 'B1_UM',
].join(',');
/** F1_USERLGI codificado → usuário (prefixo até os 2 dígitos após '@='). */
const USERLGI_PREFIX_MAP = {
    '0#  6@= 20': 'ariane.oliveira',
    '0#  3@= 90': 'carlos.passos',
    '1#  8@= 50': 'bot.contabil',
    '1#  5@= 40': 'bot.contabil',
    '1#  8@= 70': 'ana.anjos',
    '2#  0@= 20': 'mateus.miranda',
    '2#  2@= 10': 'marcos.machado',
    '2#  3@= 60': 'stefani.alves',
    '2#  4@= 70': 'beatryz.santos',
};
function decodeUserlgi(userlgi) {
    if (!userlgi)
        return '';
    const s = userlgi.trim();
    for (const [prefix, name] of Object.entries(USERLGI_PREFIX_MAP)) {
        if (s.startsWith(prefix))
            return name;
    }
    return s;
}
const trim = (v) => (v === null || v === undefined ? '' : String(v).trim());
function whereEspecie(especie) {
    const parts = especie.split(',').map((e) => `'${e.trim()}'`).join(',');
    return `AND SF1.F1_ESPECIE IN (${parts}) `;
}
async function fetchHeaders(tenantId, dateFrom, dateTo, especie) {
    const where = `SF1.F1_DTDIGIT>='${dateFrom}' AND SF1.F1_DTDIGIT<='${dateTo}' ` +
        whereEspecie(especie) +
        `AND SF1.D_E_L_E_T_=' ' AND SA2.D_E_L_E_T_=' '` +
        `AND SF1.F1_FORNECE=SA2.A2_COD AND SF1.F1_LOJA=SA2.A2_LOJA`;
    const out = [];
    const seen = new Set();
    let page = 1;
    for (;;) {
        const d = await (0, totvs_1.genericQuery)(tenantId, {
            tables: 'SF1,SA2', fields: exports.SF1_SA2_FIELDS, where, page: String(page), pageSize: '1000',
        });
        if (d.error)
            return { rows: out, error: d.error };
        for (const it of d.items || []) {
            const k = [it.f1_filial, it.f1_doc, it.f1_serie, it.f1_fornece, it.f1_loja, it.f1_dtdigit].map(trim).join('|');
            if (seen.has(k))
                continue;
            seen.add(k);
            out.push(it);
        }
        if (!d.hasNext)
            break;
        page++;
    }
    return { rows: out };
}
/** Todos os itens SD1+SB1 do período em lote, agrupados por (doc,serie,fornec,loja). */
async function fetchAllItems(tenantId, dateFrom, dateTo) {
    const where = `SD1.D1_DTDIGIT>='${dateFrom}' AND SD1.D1_DTDIGIT<='${dateTo}' ` +
        `AND SD1.D_E_L_E_T_=' ' AND SB1.D_E_L_E_T_=' ' AND SD1.D1_COD=SB1.B1_COD`;
    const groups = new Map();
    let page = 1;
    for (;;) {
        const d = await (0, totvs_1.genericQuery)(tenantId, {
            tables: 'SD1,SB1', fields: exports.SD1_SB1_FIELDS, where, page: String(page), pageSize: '1000',
        });
        if (d.error)
            return { groups, error: d.error };
        for (const it of d.items || []) {
            const key = [it.d1_doc, it.d1_serie, it.d1_fornece, it.d1_loja].map(trim).join('|');
            const g = groups.get(key);
            if (g)
                g.push(it);
            else
                groups.set(key, [it]);
        }
        if (!d.hasNext)
            break;
        page++;
    }
    return { groups };
}
/**
 * Busca NFs de mercadoria (espécies) por data de digitação numa janela
 * YYYYMMDD — todas as empresas em EMPRESAS (EQS + BRATEC).
 */
async function fetchMercadoriaNfs(dateFrom, dateTo, especie = 'SPED', empresas = Object.keys(totvs_1.EMPRESAS)) {
    const nfs = [];
    const errors = [];
    for (const emp of empresas) {
        const tenantId = totvs_1.EMPRESAS[emp];
        if (!tenantId)
            continue;
        const [headers, items] = await Promise.all([
            fetchHeaders(tenantId, dateFrom, dateTo, especie),
            fetchAllItems(tenantId, dateFrom, dateTo),
        ]);
        if (headers.error && !headers.rows.length) {
            errors.push(`${emp} headers: ${headers.error}`);
            continue;
        }
        if (headers.error)
            errors.push(`${emp} headers parcial: ${headers.error}`);
        if (items.error)
            errors.push(`${emp} itens: ${items.error}`);
        for (const h of headers.rows) {
            const key = [h.f1_doc, h.f1_serie, h.f1_fornece, h.f1_loja].map(trim).join('|');
            h.f1_userlgi = decodeUserlgi(h.f1_userlgi || '');
            nfs.push({ header: { ...h, _empresa: emp }, items: items.groups.get(key) || [] });
        }
    }
    return { nfs, errors };
}
/**
 * Fonte zero-custo de XML: itens Agilitas guardam o XML da NF embutido em
 * Z01_XMLNFE. Consulta a Z01 pela chave em todos os tenants — retorna o
 * primeiro XML encontrado ou null.
 */
async function fetchZ01XmlByChave(chave) {
    if (!/^\d{44}$/.test(chave))
        return null;
    for (const emp of Object.keys(totvs_1.EMPRESAS)) {
        const tenantId = totvs_1.EMPRESAS[emp];
        if (!tenantId)
            continue;
        try {
            const d = await (0, totvs_1.genericQuery)(tenantId, {
                tables: 'Z01',
                // Z01_XMLNFE é memo — sozinho no fields dá HTTP 500; precisa de outra coluna.
                fields: 'Z01_CHVNFE,Z01_XMLNFE',
                where: `Z01.Z01_CHVNFE='${chave}' AND Z01.D_E_L_E_T_=' '`,
                page: '1',
                pageSize: '5',
            });
            for (const it of d.items || []) {
                const xml = String(it.z01_xmlnfe || '').trim();
                if (xml.includes('infNFe'))
                    return xml;
            }
        }
        catch { }
    }
    return null;
}
