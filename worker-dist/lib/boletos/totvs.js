"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureBoletosTables = ensureBoletosTables;
exports.syncBoletosEmpresa = syncBoletosEmpresa;
exports.syncBoletos = syncBoletos;
exports.reflagBoletos = reflagBoletos;
/**
 * Boletos — sync de títulos a pagar (SE2) com código de barras/linha digitável
 * e validação FEBRABAN. Segue o mesmo padrão de lib/impacto/totvs.ts.
 *
 * Escopo do fetch: títulos em aberto (E2_BAIXA=' ', vencto >= 2024) +
 * baixados nos últimos 60 dias — histórico suficiente pra auditoria sem
 * carregar os ~160k títulos da base.
 */
const neon_1 = require("../db/neon");
const totvs_1 = require("../impacto/totvs");
const barcode_1 = require("./barcode");
const FIELDS = [
    'E2_FILIAL', 'E2_PREFIXO', 'E2_NUM', 'E2_PARCELA', 'E2_TIPO', 'E2_NATUREZ',
    'E2_FORNECE', 'E2_LOJA', 'E2_EMISSAO', 'E2_VENCTO', 'E2_VENCREA', 'E2_BAIXA',
    'E2_VALOR', 'E2_MULTA', 'E2_JUROS', 'E2_ACRESC', 'E2_CODBAR', 'E2_LINDIG',
    'E2_PORTADO', 'E2_BCOPAG', 'E2_HIST', 'E2_DTDIGIT', 'E2_ORIGEM', 'E2_SALDO',
    'A2_NOME', 'ED_DESCRIC',
].join(',');
const trim = (v) => (v === null || v === undefined ? '' : String(v).trim());
const nul = (v) => { const s = trim(v); return s === '' ? null : s; };
const dt = (v) => { const s = trim(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };
const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const KEY = (r) => [r.e2_filial, r.e2_prefixo, r.e2_num, r.e2_parcela, r.e2_tipo, r.e2_fornece, r.e2_loja]
    .map(trim)
    .join('|');
/** Busca títulos por where-livre, paginando tudo. */
async function fetchRows(tenantId, where) {
    const out = [];
    const seen = new Set();
    let page = 1;
    for (;;) {
        const d = await (0, totvs_1.genericQuery)(tenantId, {
            tables: 'SE2,SA2,SED',
            fields: FIELDS,
            where: `SE2.D_E_L_E_T_=' ' AND SA2.D_E_L_E_T_=' ' AND SED.D_E_L_E_T_=' '` +
                ` AND A2_COD=E2_FORNECE AND A2_LOJA=E2_LOJA AND ED_CODIGO=E2_NATUREZ AND (${where})`,
            page: String(page),
            pageSize: '1000',
        });
        if (d.error)
            return { rows: out, error: d.error };
        for (const it of d.items || []) {
            const k = KEY(it);
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
async function ensureBoletosTables() {
    if (!neon_1.sql)
        throw new Error('Banco não disponível');
    await (0, neon_1.sql) `
    CREATE TABLE IF NOT EXISTS boletos_titulos (
      id SERIAL PRIMARY KEY,
      empresa TEXT NOT NULL,
      filial TEXT NOT NULL DEFAULT '',
      prefixo TEXT NOT NULL DEFAULT '',
      num TEXT NOT NULL DEFAULT '',
      parcela TEXT NOT NULL DEFAULT '',
      tipo TEXT NOT NULL DEFAULT '',
      natureza TEXT, natureza_desc TEXT,
      fornecedor TEXT NOT NULL DEFAULT '',
      loja TEXT NOT NULL DEFAULT '',
      fornecedor_nome TEXT,
      emissao DATE, vencto DATE, vencto_real DATE, baixa DATE, dt_digit DATE,
      valor NUMERIC(15,2) DEFAULT 0, acresc NUMERIC(15,2) DEFAULT 0,
      multa NUMERIC(15,2) DEFAULT 0, juros NUMERIC(15,2) DEFAULT 0,
      saldo NUMERIC(15,2) DEFAULT 0,
      codbar TEXT, lindig TEXT, portado TEXT, bco_pgto TEXT,
      historico TEXT, origem TEXT,
      flags JSONB NOT NULL DEFAULT '[]',
      flag_count INT NOT NULL DEFAULT 0,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (empresa, filial, prefixo, num, parcela, tipo, fornecedor, loja)
    )
  `;
    await (0, neon_1.sql) `CREATE INDEX IF NOT EXISTS idx_boletos_flags ON boletos_titulos(flag_count) WHERE flag_count > 0`;
    await (0, neon_1.sql) `CREATE INDEX IF NOT EXISTS idx_boletos_empresa ON boletos_titulos(empresa)`;
    await (0, neon_1.sql) `CREATE INDEX IF NOT EXISTS idx_boletos_baixa ON boletos_titulos(baixa)`;
    await (0, neon_1.sql) `
    CREATE TABLE IF NOT EXISTS boletos_sync_state (
      empresa TEXT PRIMARY KEY,
      last_sync_at TIMESTAMPTZ,
      last_count INT DEFAULT 0,
      last_flagged INT DEFAULT 0
    )
  `;
}
/** Sincroniza títulos com código de barras de uma empresa. */
async function syncBoletosEmpresa(empresa) {
    await ensureBoletosTables();
    const tenantId = totvs_1.EMPRESAS[empresa];
    const started = new Date();
    const baixaDesde = new Date();
    baixaDesde.setDate(baixaDesde.getDate() - 60);
    const baixaD = baixaDesde.toISOString().slice(0, 10).replace(/-/g, '');
    // Abertos (qualquer vencto >= 2024) + baixados nos últimos 60 dias
    const [abertos, baixados] = await Promise.all([
        fetchRows(tenantId, `E2_BAIXA=' ' AND E2_VENCREA>='20240101'`),
        fetchRows(tenantId, `E2_BAIXA>='${baixaD}'`),
    ]);
    const err = abertos.error || baixados.error;
    if (err && !abertos.rows.length && !baixados.rows.length) {
        return { empresa, fetched: 0, upserted: 0, flagged: 0, error: err };
    }
    const byKey = new Map();
    for (const r of [...abertos.rows, ...baixados.rows])
        byKey.set(KEY(r), r);
    const rows = [...byKey.values()];
    // duplicado: mesmo codbar/lindig em mais de um título
    const byCodigo = new Map();
    for (const r of rows) {
        const c = trim(r.e2_lindig) || trim(r.e2_codbar);
        if (!c)
            continue;
        if (!byCodigo.has(c))
            byCodigo.set(c, new Set());
        byCodigo.get(c).add(KEY(r));
    }
    const codigosDuplicados = new Set([...byCodigo.entries()].filter(([, ks]) => ks.size > 1).map(([c]) => c));
    let upserted = 0;
    let flagged = 0;
    for (const r of rows) {
        const codigo = (trim(r.e2_lindig) || trim(r.e2_codbar)).replace(/\D/g, '');
        const flags = (0, barcode_1.validarTitulo)({
            lindig: trim(r.e2_lindig),
            codbar: trim(r.e2_codbar),
            valor: num(r.e2_valor),
            venctoReal: dt(r.e2_vencrea),
        });
        if (codigo && codigosDuplicados.has(codigo)) {
            flags.push({ tipo: 'codbar_duplicado', detalhe: 'Mesmo código em mais de um título' });
        }
        try {
            await (0, neon_1.sql) `
        INSERT INTO boletos_titulos (
          empresa, filial, prefixo, num, parcela, tipo, natureza, natureza_desc,
          fornecedor, loja, fornecedor_nome,
          emissao, vencto, vencto_real, baixa, dt_digit,
          valor, acresc, multa, juros, saldo,
          codbar, lindig, portado, bco_pgto, historico, origem,
          flags, flag_count, synced_at
        ) VALUES (
          ${empresa}, ${trim(r.e2_filial)}, ${trim(r.e2_prefixo)}, ${trim(r.e2_num)},
          ${trim(r.e2_parcela)}, ${trim(r.e2_tipo)}, ${nul(r.e2_naturez)}, ${nul(r.ed_descric)},
          ${trim(r.e2_fornece)}, ${trim(r.e2_loja)}, ${nul(r.a2_nome)},
          ${dt(r.e2_emissao)}, ${dt(r.e2_vencto)}, ${dt(r.e2_vencrea)}, ${dt(r.e2_baixa)},
          ${dt(r.e2_dtdigit)},
          ${num(r.e2_valor)}, ${num(r.e2_acresc)}, ${num(r.e2_multa)}, ${num(r.e2_juros)},
          ${num(r.e2_saldo)},
          ${nul(r.e2_codbar)}, ${nul(r.e2_lindig)}, ${nul(r.e2_portado)}, ${nul(r.e2_bcopag)},
          ${nul(r.e2_hist)}, ${nul(r.e2_origem)},
          ${JSON.stringify(flags)}::jsonb, ${flags.length}, NOW()
        )
        ON CONFLICT (empresa, filial, prefixo, num, parcela, tipo, fornecedor, loja)
        DO UPDATE SET
          natureza = EXCLUDED.natureza, natureza_desc = EXCLUDED.natureza_desc,
          fornecedor_nome = EXCLUDED.fornecedor_nome,
          emissao = EXCLUDED.emissao, vencto = EXCLUDED.vencto,
          vencto_real = EXCLUDED.vencto_real, baixa = EXCLUDED.baixa,
          dt_digit = EXCLUDED.dt_digit, valor = EXCLUDED.valor,
          acresc = EXCLUDED.acresc, multa = EXCLUDED.multa, juros = EXCLUDED.juros,
          saldo = EXCLUDED.saldo, codbar = EXCLUDED.codbar, lindig = EXCLUDED.lindig,
          portado = EXCLUDED.portado, bco_pgto = EXCLUDED.bco_pgto,
          historico = EXCLUDED.historico, origem = EXCLUDED.origem,
          flags = EXCLUDED.flags, flag_count = EXCLUDED.flag_count,
          synced_at = NOW()
      `;
            upserted++;
            if (flags.length)
                flagged++;
        }
        catch (e) {
            console.error(`[boletos] upsert falhou ${r.e2_num}:`, e?.message);
        }
    }
    // Remove títulos que saíram da janela (baixados > 60d atrás)
    await (0, neon_1.sql) `
    DELETE FROM boletos_titulos
    WHERE empresa = ${empresa} AND synced_at < ${started.toISOString()}
  `;
    await (0, neon_1.sql) `
    INSERT INTO boletos_sync_state (empresa, last_sync_at, last_count, last_flagged)
    VALUES (${empresa}, NOW(), ${rows.length}, ${flagged})
    ON CONFLICT (empresa) DO UPDATE SET
      last_sync_at = NOW(), last_count = ${rows.length}, last_flagged = ${flagged}
  `;
    return { empresa, fetched: rows.length, upserted, flagged, error: err };
}
async function syncBoletos() {
    const results = [];
    for (const emp of Object.keys(totvs_1.EMPRESAS)) {
        results.push(await syncBoletosEmpresa(emp));
    }
    return results;
}
/** Recomputa flags a partir dos códigos já gravados — sem novo fetch no TOTVS. */
async function reflagBoletos() {
    await ensureBoletosTables();
    const rows = await (0, neon_1.sql) `SELECT id, lindig, codbar, valor, vencto_real FROM boletos_titulos`;
    // duplicados calculados na base inteira
    const porCodigo = new Map();
    for (const r of rows) {
        const c = trim(r.lindig) || trim(r.codbar);
        if (c)
            porCodigo.set(c, (porCodigo.get(c) || 0) + 1);
    }
    let updated = 0;
    let flagged = 0;
    for (const r of rows) {
        const flags = (0, barcode_1.validarTitulo)({
            lindig: r.lindig || '',
            codbar: r.codbar || '',
            valor: Number(r.valor) || 0,
            venctoReal: r.vencto_real ? r.vencto_real.toISOString().slice(0, 10) : null,
        });
        const codigo = (trim(r.lindig) || trim(r.codbar)).replace(/\D/g, '');
        if (codigo && (porCodigo.get(codigo) || 0) > 1) {
            flags.push({ tipo: 'codbar_duplicado', detalhe: 'Mesmo código em mais de um título' });
        }
        await (0, neon_1.sql) `UPDATE boletos_titulos SET flags=${JSON.stringify(flags)}::jsonb, flag_count=${flags.length} WHERE id=${r.id}`;
        updated++;
        if (flags.length)
            flagged++;
    }
    return { updated, flagged };
}
