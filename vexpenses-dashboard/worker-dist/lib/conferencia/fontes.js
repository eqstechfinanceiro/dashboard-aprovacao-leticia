"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDocCacheTable = ensureDocCacheTable;
exports.cacheHasChaves = cacheHasChaves;
exports.prepararSieg = prepararSieg;
exports.obterXmlNfe = obterXmlNfe;
/**
 * Fontes de documento da conferência — cadeia:
 *   1. fiscal_doc_cache (Postgres — XML já obtido antes)
 *   2. Z01_XMLNFE (XML embutido na tabela Z01 do TOTVS — zero custo, mesmo genericQuery)
 *   3. SIEG (download por chave — cookies COFRE.AUTH / login Playwright)
 * Todo XML obtido de 2-3 é persistido no cache pra não baixar de novo.
 */
const neon_1 = require("../db/neon");
const totvs_1 = require("./totvs");
const sieg_1 = require("./sieg");
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
    return null;
}
