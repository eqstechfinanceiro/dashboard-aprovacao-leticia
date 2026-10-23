"use strict";
/**
 * Parser de XML NF-e — port de conferencia-notas-mercadoria/xml_parser.py
 * para string em memória (sem lib de XML — a estrutura NF-e é estável).
 *
 * Extrai: chave, numero, serie, emissao, emit/dest, indPres, ICMSTot
 * e itens (prod + ICMS qualquer subgrupo + IPITrib + PIS/COFINS).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseNfeXml = parseNfeXml;
const CNPJ_FILIAL_EQS = {
    '80464753000197': '02', '80464753000430': '04', '80464753000510': '05',
    '80464753000782': '07', '80464753000863': '08', '80464753000944': '09',
    '80464753001088': '10', '80464753001169': '11', '80464753001240': '12',
    '80464753001320': '13', '80464753001401': '14', '80464753001592': '15',
    '80464753001673': '16', '80464753001916': '19', '80464753002050': '20',
    '80464753002130': '21', '80464753002211': '22', '80464753002564': '25',
    '80464753002645': '26', '80464753002807': '28', '80464753002998': '29',
    '80464753003021': '30', '80464753003102': '31', '80464753003293': '32',
    '80464753003374': '33', '80464753003617': '34', '80464753003536': '35',
    '80464753003455': '36', '80464753003706': '37', '80464753003960': '39',
    '80464753004001': '40', '80464753004184': '41', '80464753004265': '42',
    '80464753004346': '43', '80464753004427': '44', '80464753004699': '46',
    '80464753004770': '47', '80464753004850': '48', '80464753004931': '49',
    '80464753005075': '50', '80464753005156': '51', '80464753005407': '54',
    '80464753005580': '55', '80464753005660': '56', '80464753005741': '57',
    '80464753005822': '58', '80464753005903': '59', '80464753006047': '60',
    '80464753006209': '62', '80464753006390': '63',
};
const f = (v, casas = 2) => {
    if (!v)
        return 0;
    const n = parseFloat(String(v).replace(',', '.'));
    if (!isFinite(n))
        return 0;
    const p = Math.pow(10, casas);
    return Math.round(n * p) / p;
};
/** Extrai o conteúdo da primeira tag <tag>…</tag> dentro de um bloco. */
function tag(block, name) {
    const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
    return m ? m[1].trim() : '';
}
function numTag(block, name, casas = 2) {
    return f(tag(block, name), casas);
}
function stripNs(xml) {
    // Remove namespaces de tag (nfe:NFe → NFe) preservando conteúdo.
    return xml.replace(/<(\/?)[\w.-]+:/g, '<$1');
}
/** ICMS pode vir em qualquer subgrupo (ICMS00, ICMS10, ICMS20…). */
function extractIcms(imposto) {
    const icmsBlk = tag(imposto, 'ICMS');
    const out = {
        v_icms: 0, v_bc_icms: 0, p_icms: 0,
        v_icms_st: 0, v_bc_icms_st: 0, p_icms_st: 0,
        orig: '', cst: '',
    };
    if (!icmsBlk)
        return out;
    out.orig = tag(icmsBlk, 'orig');
    out.cst = tag(icmsBlk, 'CST') || tag(icmsBlk, 'CSOSN');
    if (icmsBlk.includes('<vICMS>')) {
        out.v_icms = numTag(icmsBlk, 'vICMS');
        out.v_bc_icms = numTag(icmsBlk, 'vBC');
        out.p_icms = numTag(icmsBlk, 'pICMS');
    }
    if (icmsBlk.includes('<vICMSST>')) {
        out.v_icms_st = numTag(icmsBlk, 'vICMSST');
        out.v_bc_icms_st = numTag(icmsBlk, 'vBCST');
        out.p_icms_st = numTag(icmsBlk, 'pICMSST');
    }
    return out;
}
function extractIpi(imposto) {
    const ipi = tag(tag(imposto, 'IPI'), 'IPITrib');
    return {
        v_ipi: numTag(ipi, 'vIPI'),
        v_bc_ipi: numTag(ipi, 'vBC'),
        p_ipi: numTag(ipi, 'pIPI'),
    };
}
function parseNfeXml(xmlText) {
    if (!xmlText || !xmlText.includes('infNFe'))
        return null;
    const xml = stripNs(xmlText);
    const infNfe = tag(xml, 'infNFe');
    if (!infNfe)
        return null;
    const idAttr = (xml.match(/infNFe\s[^>]*Id="([^"]+)"/) || [])[1] || '';
    const chave = idAttr.startsWith('NFe') && idAttr.length === 47 ? idAttr.slice(3) : '';
    const ide = tag(infNfe, 'ide');
    const emit = tag(infNfe, 'emit');
    const dest = tag(infNfe, 'dest');
    const destCnpj = tag(dest, 'CNPJ') || tag(dest, 'CPF');
    const total = {};
    const icmsTot = tag(tag(infNfe, 'total'), 'ICMSTot');
    for (const k of ['vNF', 'vICMS', 'vIPI', 'vST', 'vBC', 'vProd', 'vDesc', 'vFrete', 'vSeg', 'vOutro', 'vII', 'vPIS', 'vCOFINS']) {
        total[k] = numTag(icmsTot, k);
    }
    const items = [];
    const detRe = /<det\s[^>]*nItem="(\d+)"[^>]*>([\s\S]*?)<\/det>/g;
    let m;
    while ((m = detRe.exec(infNfe)) !== null) {
        const det = m[2];
        const prod = tag(det, 'prod');
        const imposto = tag(det, 'imposto');
        const icms = extractIcms(imposto);
        const ipi = extractIpi(imposto);
        const pisBlk = tag(imposto, 'PIS');
        const cofinsBlk = tag(imposto, 'COFINS');
        items.push({
            n_item: m[1],
            c_prod: tag(prod, 'cProd'),
            x_prod: tag(prod, 'xProd'),
            q_com: numTag(prod, 'qCom', 4),
            v_un_com: numTag(prod, 'vUnCom', 4),
            v_prod: numTag(prod, 'vProd'),
            cfop: tag(prod, 'CFOP'),
            ncm: tag(prod, 'NCM'),
            v_desc: numTag(prod, 'vDesc'),
            v_frete: numTag(prod, 'vFrete'),
            v_seg: numTag(prod, 'vSeg'),
            v_outro: numTag(prod, 'vOutro'),
            v_icms: icms.v_icms,
            v_bc_icms: icms.v_bc_icms,
            p_icms: icms.p_icms,
            v_icms_st: icms.v_icms_st,
            v_bc_icms_st: icms.v_bc_icms_st,
            p_icms_st: icms.p_icms_st,
            orig: icms.orig,
            cst: icms.cst,
            v_pis: numTag(pisBlk, 'vPIS'),
            v_cofins: numTag(cofinsBlk, 'vCOFINS'),
            v_ipi: ipi.v_ipi,
            v_bc_ipi: ipi.v_bc_ipi,
            p_ipi: ipi.p_ipi,
        });
    }
    // Duplicatas <cobr><dup> — conferidas contra as parcelas SE2.
    const dups = [];
    const cobrBlk = tag(infNfe, 'cobr');
    if (cobrBlk) {
        const dupRe = /<dup>([\s\S]*?)<\/dup>/g;
        let dm;
        while ((dm = dupRe.exec(cobrBlk)) !== null) {
            dups.push({
                n_dup: tag(dm[1], 'nDup'),
                d_venc: tag(dm[1], 'dVenc'),
                v_dup: numTag(dm[1], 'vDup'),
            });
        }
    }
    return {
        chave,
        numero: tag(ide, 'nNF'),
        serie: tag(ide, 'serie'),
        emissao: tag(ide, 'dhEmi') || tag(ide, 'dEmi'),
        emit_cnpj: tag(emit, 'CNPJ') || tag(emit, 'CPF'),
        emit_nome: tag(emit, 'xNome'),
        dest_cnpj: destCnpj,
        dest_nome: tag(dest, 'xNome'),
        ind_pres: tag(ide, 'indPres'),
        filial: CNPJ_FILIAL_EQS[destCnpj] || '',
        total,
        items,
        dups,
    };
}
