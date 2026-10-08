"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.carregarTesOverride = carregarTesOverride;
exports.resolverTesOverride = resolverTesOverride;
/**
 * Parametrização de TES — crédito de ICMS (fornecedor + produto + TES).
 * Port do Lince src/utils/tes_overrides.py: mesma regra que o bot aplica
 * no lançamento, para a conferência esperar a mesma TES final.
 *
 * Regra: fornecedor (CNPJ do emit) ∈ lince_tes_fornecedores
 *      E produto (SB1 ou cProd)    ∈ lince_tes_produtos
 *      E TES calculada             ∈ lince_tes_mapa.tes_origem
 *   → espera-se a tes_destino.
 *
 * As 3 tabelas moram no mesmo banco do dashboard — lidas 1x por empresa
 * com cache de 60s (mesmo TTL do bot).
 */
const neon_1 = require("../db/neon");
const TTL_MS = 60000;
const _cache = new Map();
const _normCnpj = (s) => String(s ?? '').replace(/\D/g, '');
const _canonProd = (s) => {
    const p = String(s ?? '').trim().toUpperCase();
    return p.replace(/^0+/, '') || p;
};
const EMPTY = { cnpjs: new Set(), produtos: new Set(), mapa: {} };
async function carregarTesOverride(empresa) {
    const emp = (empresa || 'EQS').toUpperCase();
    const hit = _cache.get(emp);
    if (hit && Date.now() - hit.ts < TTL_MS)
        return hit.cfg;
    if (!neon_1.sql)
        return EMPTY;
    try {
        const [f, p, m] = await Promise.all([
            (0, neon_1.sql) `SELECT cnpj FROM lince_tes_fornecedores
          WHERE ativo AND cnpj IS NOT NULL AND cnpj <> '' AND (empresa = ${emp} OR empresa = '*')`,
            (0, neon_1.sql) `SELECT produto FROM lince_tes_produtos WHERE ativo`,
            (0, neon_1.sql) `SELECT tes_origem, tes_destino FROM lince_tes_mapa
          WHERE ativo AND (empresa = ${emp} OR empresa = '*')`,
        ]);
        const cfg = {
            cnpjs: new Set(f.map((r) => _normCnpj(r.cnpj))),
            produtos: new Set(p.map((r) => _canonProd(r.produto))),
            mapa: Object.fromEntries(m.map((r) => [String(r.tes_origem).trim().toUpperCase(), String(r.tes_destino).trim().toUpperCase()])),
        };
        _cache.set(emp, { ts: Date.now(), cfg });
        return cfg;
    }
    catch {
        return EMPTY; // nunca bloqueia a conferência
    }
}
/** Mesma semântica de resolver_tes: retorna a TES destino ou null. */
function resolverTesOverride(cfg, cnpjEmit, codigosProduto, tesAtual) {
    if (!cfg.cnpjs.size || !cfg.produtos.size || !Object.keys(cfg.mapa).length) {
        return { tes: null, produto: null };
    }
    if (!cfg.cnpjs.has(_normCnpj(cnpjEmit)))
        return { tes: null, produto: null };
    let prodCasado = null;
    for (const cod of codigosProduto) {
        if (cod && cfg.produtos.has(_canonProd(cod))) {
            prodCasado = cod.trim().toUpperCase();
            break;
        }
    }
    if (!prodCasado)
        return { tes: null, produto: null };
    const tesDestino = cfg.mapa[String(tesAtual ?? '').trim().toUpperCase()];
    return { tes: tesDestino ?? null, produto: prodCasado };
}
