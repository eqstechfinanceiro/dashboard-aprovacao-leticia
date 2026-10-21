"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDocCacheTable = ensureDocCacheTable;
exports.cacheHasChaves = cacheHasChaves;
exports.prepararSieg = prepararSieg;
exports.salvarXmlCache = salvarXmlCache;
exports.obterXmlNfe = obterXmlNfe;
/**
 * Fontes de documento da conferência — cadeia:
 *   1. fiscal_doc_cache (Postgres — XML já obtido antes, inclui uploads do bot)
 *   2. Z01_XMLNFE (XML embutido na tabela Z01 do TOTVS — zero custo, mesmo genericQuery)
 *   3. SDS.DS_XML (XML da fila MATA143 — cobre nota já lançada, zero custo)
 *   4. Protheus capturarXML (cria processo de pagamento que puxa o XML da SEFAZ
 *      pro SDS — mesma ação do botão "Criar Processo" do portal EQS)
 *   5. SIEG (download por chave — cookies COFRE.AUTH / login Playwright)
 *   6. MeuDanfe get/xml (GRÁTIS — só XMLs já no repositório da conta; nunca paga)
 * Todo XML obtido de 2-6 é persistido no cache pra não baixar de novo.
 */
const neon_1 = require("../db/neon");
const totvs_1 = require("./totvs");
const sieg_1 = require("./sieg");
const meudanfe_1 = require("./meudanfe");
const eqs_portal_1 = require("../fiscal/eqs-portal");
const xml_parser_1 = require("./xml-parser");
let cacheEnsured = false;
async function ensureDocCacheTable() {
    if (cacheEnsured || !neon_1.sql)
        return;
    cacheEnsured = true;
    await (0, neon_1.sql) `
    CREATE TABLE IF NOT EXISTS fiscal_doc_cache (
      chave_acesso VARCHAR(44) PRIMARY KEY,
      xml TEXT,
      mime VARCHAR(64) NOT NULL DEFAULT 'text/xml',
      fonte VARCHAR(32) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
}
async function cacheGet(chave) {
    try {
        const rows = await (0, neon_1.sql) `SELECT xml FROM fiscal_doc_cache WHERE chave_acesso=${chave} AND xml IS NOT NULL`;
        return rows[0]?.xml || null;
    }
    catch {
        return null;
    }
}
async function cachePut(chave, xml, fonte) {
    try {
        await (0, neon_1.sql) `INSERT INTO fiscal_doc_cache (chave_acesso, xml, mime, fonte)
      VALUES (${chave}, ${xml}, 'text/xml', ${fonte})
      ON CONFLICT (chave_acesso) DO UPDATE SET xml=EXCLUDED.xml, fonte=EXCLUDED.fonte`;
    }
    catch { }
}
/** Chaves que já têm XML em cache — usado pra decidir quais pré-registrar no SIEG. */
async function cacheHasChaves(chaves) {
    const out = new Set();
    if (!chaves.length)
        return out;
    try {
        const rows = await (0, neon_1.sql) `SELECT chave_acesso FROM fiscal_doc_cache WHERE chave_acesso = ANY(${chaves}) AND xml IS NOT NULL`;
        for (const r of rows)
            out.add(r.chave_acesso);
    }
    catch { }
    return out;
}
/** Pré-registra chaves no SIEG em lote (uma vez por ciclo — evita 10s/NF). */
async function prepararSieg(chaves) {
    const auth = await (0, sieg_1.garantirAutenticacao)();
    if (!auth)
        return -1;
    return (0, sieg_1.preAdicionarChaves)(chaves);
}
/**
 * Obtém o XML da NF pela chave — cache → Z01 → SIEG.
 * Retorna { xml, parsed, fonte } ou null se nenhuma fonte produziu XML parseável.
 */
/** Persiste XML obtido por fonte externa (ex.: upload do bot Lince via /api/fiscal/doc-cache). */
async function salvarXmlCache(chaveAcesso, xml, fonte) {
    const chave = (chaveAcesso || '').trim();
    if (!/^\d{44}$/.test(chave) || !xml || !xml.includes('<'))
        return false;
    await ensureDocCacheTable();
    await cachePut(chave, xml, fonte);
    return true;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Captura o XML via Protheus (POST /wsrprocpag/capturarXML) e aguarda ele cair
 * no SDS — a captura SEFAZ é assíncrona dentro do Protheus. Quando a nota já
 * está em processo de pagamento o Protheus recusa com "ja em processo"; nesse
 * caso re-olhamos o SDS uma última vez (o XML pode ter chegado depois da nossa
 * primeira consulta). Retorna o XML ou null.
 */
async function capturarXmlProtheus(chave) {
    try {
        const nota = await (0, eqs_portal_1.eqsGetNotaByChave)(chave);
        const cap = await (0, eqs_portal_1.eqsCapturarXml)(chave, { cnpjDestino: nota?.cnpjDestino || undefined });
        if (!cap.ok && !cap.jaEmProcesso) {
            console.warn(`[fontes] capturarXML ${chave.slice(0, 10)}… → ${cap.error || 'falhou'}`);
            return null;
        }
        const tentativas = cap.ok ? 6 : 1; // criou processo → captura assíncrona; já-em-processo → re-check único
        for (let i = 0; i < tentativas; i++) {
            if (i > 0)
                await sleep(4000);
            const xml = (await (0, totvs_1.fetchSdsXmlByChave)(chave)) || (await (0, totvs_1.fetchZ01XmlByChave)(chave));
            if (xml)
                return xml;
        }
        return null;
    }
    catch (e) {
        console.warn(`[fontes] capturarXML ${chave.slice(0, 10)}… erro:`, e?.message);
        return null;
    }
}
async function obterXmlNfe(chaveAcesso, opts = {}) {
    const chave = (chaveAcesso || '').trim();
    if (chave.length !== 44)
        return null;
    const cached = await cacheGet(chave);
    if (cached) {
        const parsed = (0, xml_parser_1.parseNfeXml)(cached);
        if (parsed)
            return { xml: cached, parsed, fonte: 'cache' };
    }
    const z01xml = await (0, totvs_1.fetchZ01XmlByChave)(chave);
    if (z01xml) {
        const parsed = (0, xml_parser_1.parseNfeXml)(z01xml);
        if (parsed) {
            await cachePut(chave, z01xml, 'z01_xmlnfe');
            return { xml: z01xml, parsed, fonte: 'z01_xmlnfe' };
        }
    }
    const sdsXml = await (0, totvs_1.fetchSdsXmlByChave)(chave);
    if (sdsXml) {
        const parsed = (0, xml_parser_1.parseNfeXml)(sdsXml);
        if (parsed) {
            await cachePut(chave, sdsXml, 'sds');
            return { xml: sdsXml, parsed, fonte: 'sds' };
        }
    }
    if (opts.protheusCapture !== false && (0, eqs_portal_1.eqsPortalConfigured)()) {
        const capXml = await capturarXmlProtheus(chave);
        if (capXml) {
            const parsed = (0, xml_parser_1.parseNfeXml)(capXml);
            if (parsed) {
                await cachePut(chave, capXml, 'protheus_capture');
                return { xml: capXml, parsed, fonte: 'protheus_capture' };
            }
        }
    }
    if (opts.sieg !== false) {
        if (await (0, sieg_1.garantirAutenticacao)()) {
            const xml = await (0, sieg_1.baixarXmlSieg)(chave);
            if (xml) {
                const parsed = (0, xml_parser_1.parseNfeXml)(xml);
                if (parsed) {
                    await cachePut(chave, xml, 'sieg');
                    return { xml, parsed, fonte: 'sieg' };
                }
            }
        }
    }
    if (opts.meudanfe !== false && (0, meudanfe_1.meudanfeEnabled)()) {
        const xml = await (0, meudanfe_1.baixarXmlMeudanfe)(chave);
        if (xml) {
            const parsed = (0, xml_parser_1.parseNfeXml)(xml);
            if (parsed) {
                await cachePut(chave, xml, 'meudanfe');
                return { xml, parsed, fonte: 'meudanfe' };
            }
        }
    }
    return null;
}
