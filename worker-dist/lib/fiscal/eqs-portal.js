"use strict";
// Integração com o portal EQS / Protheus REST (microsiga).
// O Protheus já faz a distribuição DF-e da SEFAZ server-side (com o certificado
// da EQS no servidor), então conseguimos metadados + DANFE de qualquer NF-e
// recebida só com a chave de acesso — sem certificado local.
//
// Endpoints usados (descobertos no bundle Angular do portal):
//   POST {base}/api/oauth2/v1/token       → JWT (grant_type=password)
//   GET  {base}/wsrnfesefaz/{chave44}     → metadados da nota recebida
//   GET  {base}/wsrdanfe/entrada/{chave}  → DANFE em PDF
//   POST {base}/wsrprocpag/capturarXML    → cria processo + captura XML da SEFAZ pro SDS
//
// Credenciais via env: PORTAL_EQS_USER / PORTAL_EQS_PASS (mesma conta da
// automação). Se ausentes, as funções retornam null — a feature degrada
// silenciosamente em vez de quebrar a página fiscal.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.eqsPortalConfigured = eqsPortalConfigured;
exports.eqsGetNotaByChave = eqsGetNotaByChave;
exports.eqsGetDanfePdf = eqsGetDanfePdf;
exports.eqsCapturarXml = eqsCapturarXml;
exports.eqsGetFornecedorByCnpj = eqsGetFornecedorByCnpj;
exports.eqsGetProcesso = eqsGetProcesso;
exports.eqsListProcpag = eqsListProcpag;
exports.eqsGetProcessoRecno = eqsGetProcessoRecno;
const https_1 = __importDefault(require("https"));
const BASE = (process.env.PORTAL_EQS_BASE || 'https://microsiga.eqsengenharia.com.br:17080/rest').replace(/\/+$/, '');
const USER = process.env.PORTAL_EQS_USER || '';
const PASS = process.env.PORTAL_EQS_PASS || '';
const TENANT = process.env.PORTAL_EQS_TENANT || '02,02';
const TIMEOUT_MS = 25000;
function eqsPortalConfigured() {
    return !!USER && !!PASS;
}
// ---- HTTP helper (cert do microsiga é auto-assinado → rejectUnauthorized:false)
function httpRequest(path, opts = {}) {
    return new Promise((resolve, reject) => {
        const req = https_1.default.request(`${BASE}${path}`, {
            method: opts.method || 'GET',
            headers: opts.headers || {},
            rejectUnauthorized: false,
            timeout: TIMEOUT_MS,
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({
                status: res.statusCode || 0,
                contentType: String(res.headers['content-type'] || ''),
                body: Buffer.concat(chunks),
            }));
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
        if (opts.body)
            req.write(opts.body);
        req.end();
    });
}
// ---- JWT com cache (reutiliza até expirar)
let cachedToken = '';
let tokenExpiresAt = 0;
async function getToken() {
    if (cachedToken && Date.now() < tokenExpiresAt)
        return cachedToken;
    const res = await httpRequest('/api/oauth2/v1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: `grant_type=password&username=${encodeURIComponent(USER)}&password=${encodeURIComponent(PASS)}`,
    });
    if (res.status < 200 || res.status >= 300)
        throw new Error(`token HTTP ${res.status}`);
    const data = JSON.parse(res.body.toString('utf-8'));
    const token = data.access_token || '';
    if (!token)
        throw new Error('token ausente na resposta');
    cachedToken = token;
    // Protheus devolve expires_in (s). Margem de 1min; fallback 5min.
    const ttl = Number(data.expires_in) > 0 ? Number(data.expires_in) * 1000 : 300000;
    tokenExpiresAt = Date.now() + ttl - 60000;
    return token;
}
function authHeaders(token, tenant = TENANT) {
    return {
        Authorization: `Bearer ${token}`,
        tenantid: tenant,
        CUSRID: '001859',
        TIPOUSUARIO: 'protheus',
        'X-PO-Screen-Lock': 'true',
        Accept: 'application/json, text/plain, */*',
    };
}
// Metadados da NF-e recebida (inbox SEFAZ do Protheus). null se não achar.
async function eqsGetNotaByChave(chave) {
    if (!eqsPortalConfigured() || !/^\d{44}$/.test(chave))
        return null;
    const token = await getToken();
    const res = await httpRequest(`/wsrnfesefaz/${chave}`, { headers: authHeaders(token) });
    if (res.status < 200 || res.status >= 300)
        return null;
    const d = JSON.parse(res.body.toString('utf-8'));
    if (!d || !d.CC00CHVNFE)
        return null;
    return {
        filial: String(d.CC00FILIAL || ''),
        cnpjEmitente: String(d.CC00CNPJEM || ''),
        emitente: String(d.CC00NOEMIT || ''),
        chave: String(d.CC00CHVNFE || ''),
        numero: String(d.CC00NUMNFE || ''),
        serie: String(d.CC00SERNFE || ''),
        situacaoDoc: String(d.CC00SITDOC || ''),
        dataRecebimento: String(d.DC00DTREC || ''),
        valor: Number(d.NC00VLDOC) || 0,
        cnpjDestino: String(d.CCNPJDESTINO || d.CCNPJ_DESTINO || ''),
        raw: d,
    };
}
// DANFE em PDF renderizado pelo Protheus. null se indisponível.
async function eqsGetDanfePdf(chave) {
    if (!eqsPortalConfigured() || !/^\d{44}$/.test(chave))
        return null;
    const token = await getToken();
    const res = await httpRequest(`/wsrdanfe/entrada/${chave}`, { headers: authHeaders(token) });
    if (res.status < 200 || res.status >= 300 || !res.body.subarray(0, 5).equals(Buffer.from('%PDF-')))
        return null;
    return res.body;
}
// CNPJ destino padrão por empresa (matriz) — usado quando a nota não está no
// inbox CC00 e não dá pra ler o destino real da filial.
const CNPJ_DESTINO_PADRAO = {
    EQS: '80464753000197',
    BRATEC: '27462720000125',
};
// POST /wsrprocpag/capturarXML — mesmo fluxo do botão "Criar Processo" do
// portal: cria o processo de pagamento e puxa o XML da NF-e da SEFAZ pro SDS.
// Payload extraído do bundle Angular (criarProcessoCapturarXML):
//   {CDESTINO_XML:"1", CCNPJDESTINO, CENTIDADE:"", CCHAVEDANFE, CUSUARIO:"001859"}
// CUSUARIO é a string do CUSRID — objeto quebra o TLPP com type mismatch.
async function eqsCapturarXml(chave, opts = {}) {
    if (!eqsPortalConfigured() || !/^\d{44}$/.test(chave))
        return { ok: false, error: 'chave inválida ou portal não configurado' };
    const cnpjDestino = opts.cnpjDestino || (opts.empresa ? CNPJ_DESTINO_PADRAO[opts.empresa] : '') || CNPJ_DESTINO_PADRAO.EQS;
    const token = await getToken();
    const body = JSON.stringify({
        CDESTINO_XML: '1',
        CCNPJDESTINO: cnpjDestino,
        CENTIDADE: '',
        CCHAVEDANFE: chave,
        CUSUARIO: '001859',
    });
    const res = await httpRequest('/wsrprocpag/capturarXML', {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body,
    });
    const text = res.body.toString('utf-8');
    let data = {};
    try {
        data = JSON.parse(text);
    }
    catch { /* corpo não-json */ }
    if (res.status >= 200 && res.status < 300) {
        return { ok: true, ndsRecno: data.NDSRECNO ? String(data.NDSRECNO) : undefined };
    }
    const msg = String(data.message || text.slice(0, 300));
    return { ok: false, jaEmProcesso: /ja em processo/i.test(msg), error: msg };
}
// Fornecedor pelo CNPJ (14 dígitos). Retorna {cod, loja} do SA2 ou null.
async function eqsGetFornecedorByCnpj(cnpj, tenant = TENANT) {
    if (!eqsPortalConfigured() || !/^\d{14}$/.test(cnpj))
        return null;
    const token = await getToken();
    const res = await httpRequest(`/wsrfornecedor?CA2CGC=${cnpj}&page=1&pageSize=3`, { headers: authHeaders(token, tenant) });
    if (res.status < 200 || res.status >= 300)
        return null;
    const items = JSON.parse(res.body.toString('utf-8')).items || [];
    const f = items.find((x) => String(x.CA2CGC || '').trim() === cnpj) || items[0];
    if (!f)
        return null;
    return { cod: String(f.CA2COD || '').trim(), loja: String(f.CA2LOJA || '01').trim() };
}
// Processo de pagamento pela nota (doc + fornecedor). Retorna o item completo
// (CDSDOC/CDSSERIE/CDSFORNEC/CDSLOJA/NDSRECNO/CENTNREDUZ/DDSEMISSA...) — usado
// no deep link e na chave de documentos do portal antigo. Primeiro tenta
// modelo 'S' (serviço); se não achar, repete sem filtro de modelo — notas de
// mercadoria usam modelo '1'/'55' e morreriam no filtro de serviço.
async function eqsGetProcesso(doc, fornecCod, tenant = TENANT) {
    if (!eqsPortalConfigured() || !doc || !fornecCod)
        return null;
    const token = await getToken();
    const base = {
        page: '1',
        pageSize: '50',
        DDSEMISSA_DE: '2024-01-01T00:00:00-03:00',
        DDSEMISSA_ATE: '2030-12-31',
        CDSDOC: doc.trim(),
        CDSFORNEC: fornecCod,
    };
    const tentativas = [
        { ...base, CDSMODELO: 'S', CDSMODELO_NOT_IN: 'R' },
        base,
    ];
    for (const params of tentativas) {
        const res = await httpRequest(`/wsrprocpag?${new URLSearchParams(params)}`, { headers: authHeaders(token, tenant) });
        if (res.status < 200 || res.status >= 300)
            continue;
        const items = JSON.parse(res.body.toString('utf-8')).items || [];
        if (items[0])
            return items[0];
    }
    return null;
}
// Lista processos de pagamento com filtros (DDSPVENC_DE/ATE, CDSDOC etc),
// paginando até esgotar. Cada item é o header SDS + campos do processo.
async function eqsListProcpag(params, tenant = TENANT, maxPages = 20) {
    if (!eqsPortalConfigured())
        return [];
    const token = await getToken();
    const out = [];
    for (let page = 1; page <= maxPages; page++) {
        const q = new URLSearchParams({ ...params, page: String(page), pageSize: '100' });
        const res = await httpRequest(`/wsrprocpag?${q}`, { headers: authHeaders(token, tenant) });
        if (res.status < 200 || res.status >= 300)
            break;
        const data = JSON.parse(res.body.toString('utf-8'));
        const items = data.items || [];
        out.push(...items);
        if (!data.hasNext || items.length < 100)
            break;
    }
    return out;
}
// Mesma busca, retornando só o NDSRECNO (deep link do portal Angular).
async function eqsGetProcessoRecno(doc, fornecCod) {
    const proc = await eqsGetProcesso(doc, fornecCod);
    const recno = proc?.NDSRECNO;
    return recno ? String(recno).trim() : null;
}
