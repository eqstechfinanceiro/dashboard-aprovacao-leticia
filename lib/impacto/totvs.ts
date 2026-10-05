/**
 * Impacto Financeiro — sync da consulta IMP FIN.C4W ("IMPACTO_FINANCEIRO") via
 * TOTVS genericQuery REST API (sem browser).
 *
 * Fonte: SE2 (Contas a Pagar) — títulos BAIXADOS com acréscimo
 * (E2_MULTA+E2_JUROS+E2_ACRESC > 0), excluindo tipos/naturezas de colaborador.
 * Joins: SA2 (nome fornecedor), SED (descr. natureza), SEZ+CTT (centro de custo
 * — E2_CCUSTO é sempre vazio, CC só existe via rateio SEZ).
 *
 * Tenants no mesmo servidor/token: EQS=02,02 / BRATEC=11,01.
 * Campos manuais (validacao/observacao/setor/gestor) são preservados no upsert.
 */
import https from 'https';
import { sql } from '../db/neon';

const BASE = (process.env.TOTVS_BASE_URL || 'https://totvs.eqsengenharia.com.br:8880').replace(/\/$/, '');
const USER = process.env.TOTVS_USER || 'bot.contabil';
const PASS = process.env.TOTVS_PASSWORD || '';

export const EMPRESAS: Record<string, string> = { EQS: '02,02', BRATEC: '11,01' };

// Tipos/naturezas de colaborador — excluídos do relatório (ver publichelp.md
// do protheus-reports-vex: RES/FOL/FER/DP/INS/NDF e naturezas de folha).
const EXCL_TIPOS = ['RES', 'FOL', 'FER', 'DP', 'INS', 'NDF'];
const EXCL_NATS = ['2010001', '2010012', '2010014', '2010020', '2060002', '2060003', '2070001003'];

const SE2_FIELDS = [
  'E2_FILIAL', 'E2_PREFIXO', 'E2_NUM', 'E2_PARCELA', 'E2_TIPO', 'E2_NATUREZ',
  'E2_FORNECE', 'E2_LOJA', 'E2_EMISSAO', 'E2_VENCTO', 'E2_VENCREA', 'E2_BAIXA',
  'E2_VALOR', 'E2_MULTA', 'E2_JUROS', 'E2_ACRESC', 'E2_DESCONT', 'E2_DECR',
  'E2_VALLIQ', 'E2_ORIGEM', 'E2_BCOPAG', 'E2_DTCONT', 'E2_HIST', 'E2_NUMBORO',
  'E2_FATURA', 'E2_DATALIB', 'E2_APROVA', 'E2_IDAGIL', 'E2_STATLIB',
  'E2_FORMPAG', 'E2_DTDIGIT',
].join(',');

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

type Json = any;

/** HTTPS request com TLS permissivo (cert do appserver tem cadeia incompleta). */
function http(method: string, url: string, headers: Record<string, string>, body?: string): Promise<{ status: number; text: string; setCookies: string[] }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        agent: insecureAgent,
        headers: { ...headers, 'Content-Length': body ? Buffer.byteLength(body) : 0 },
        timeout: 90000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode || 0,
            text: Buffer.concat(chunks).toString('utf-8'),
            setCookies: (res.headers['set-cookie'] as string[]) || [],
          })
        );
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Sessão compartilhada: cookie de proxy + bearer token (expira ~1h).
let sessionCookies = '';
let bearerToken = '';
let tokenAt = 0;

async function login() {
  const s = await http('GET', `${BASE}/app-root/servicos/`, {}, undefined);
  sessionCookies = s.setCookies.map((c) => c.split(';')[0]).join('; ');
  const r = await http(
    'POST',
    `${BASE}/app-root/servicos/api/oauth2/v1/token`,
    { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', Cookie: sessionCookies },
    new URLSearchParams({ grant_type: 'password', username: USER, password: PASS }).toString()
  );
  const data = JSON.parse(r.text || '{}');
  if (!data.access_token) throw new Error(`TOTVS token falhou (HTTP ${r.status}): ${r.text.slice(0, 200)}`);
  bearerToken = data.access_token;
  tokenAt = Date.now();
}

/** genericQuery com retry + re-login (o proxy derruba conexões com frequência). */
export async function genericQuery(tenantId: string, params: Record<string, string>): Promise<Json> {
  let lastErr: any = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      if (!bearerToken || Date.now() - tokenAt > 55 * 60 * 1000) await login();
      const qs = new URLSearchParams(params).toString();
      const r = await http('GET', `${BASE}/app-root/servicos/api/framework/v1/genericQuery?${qs}`, {
        Authorization: `Bearer ${bearerToken}`,
        Accept: 'application/json',
        tenantId,
        Cookie: sessionCookies,
      });
      if (r.status === 200) return JSON.parse(r.text);
      if (r.status === 401 || r.status === 403) { bearerToken = ''; lastErr = new Error(`HTTP ${r.status}: ${r.text.slice(0, 150)}`); continue; }
      return { error: `HTTP ${r.status}: ${r.text.slice(0, 300)}`, items: [] };
    } catch (e: any) {
      lastErr = e;
      bearerToken = ''; // força re-login — conexão pode ter morrido com a sessão
      await new Promise((r2) => setTimeout(r2, 1000));
    }
  }
  return { error: String(lastErr?.message || lastErr), items: [] };
}

const trim = (v: any) => (v === null || v === undefined ? '' : String(v).trim());
const nul = (v: any) => { const s = trim(v); return s === '' ? null : s; };
const dt = (v: any) => { const s = trim(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };
const num = (v: any) => { const n = Number(v); return isFinite(n) ? n : 0; };

interface TituloRow {
  [k: string]: any;
}

/** Busca títulos baixados com acréscimo no range E2_BAIXA [from,to] (YYYY-MM-DD). */
async function fetchTitulos(tenantId: string, from: string, to: string): Promise<{ rows: TituloRow[]; error?: string }> {
  const d1 = from.replace(/-/g, '');
  const d2 = to.replace(/-/g, '');
  const where =
    `SE2.D_E_L_E_T_=' ' AND SA2.D_E_L_E_T_=' ' AND SED.D_E_L_E_T_=' '` +
    ` AND A2_COD=E2_FORNECE AND A2_LOJA=E2_LOJA AND ED_CODIGO=E2_NATUREZ` +
    ` AND E2_BAIXA>='${d1}' AND E2_BAIXA<='${d2}'` +
    ` AND (E2_MULTA+E2_JUROS+E2_ACRESC)>0` +
    ` AND E2_TIPO NOT IN (${EXCL_TIPOS.map((t) => `'${t}'`).join(',')})` +
    ` AND E2_NATUREZ NOT IN (${EXCL_NATS.map((t) => `'${t}'`).join(',')})`;

  const fields = `${SE2_FIELDS},A2_NOME,ED_DESCRIC`;
  const out: TituloRow[] = [];
  const seen = new Set<string>();
  let page = 1;
  for (;;) {
    const d = await genericQuery(tenantId, {
      tables: 'SE2,SA2,SED', fields, where, page: String(page), pageSize: '1000',
    });
    if (d.error) return { rows: out, error: d.error };
    for (const it of d.items || []) {
      // SED pode duplicar por filial — dedupe pela chave do título
      const k = [it.e2_filial, it.e2_prefixo, it.e2_num, it.e2_parcela, it.e2_tipo, it.e2_fornece, it.e2_loja].map(trim).join('|');
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(it);
    }
    if (!d.hasNext) break;
    page++;
  }
  return { rows: out };
}

/** CC por título via SEZ (rateio) + descrição CTT. Retorna mapa chave→{cc,desc}. */
async function fetchCentrosCusto(tenantId: string, rows: TituloRow[]): Promise<Map<string, { cc: string; desc: string }>> {
  const map = new Map<string, { cc: string; desc: string; perc: number }>();
  const nums = [...new Set(rows.map((r) => trim(r.e2_num)).filter(Boolean))];
  // SEZ tem várias linhas por título (rateio) — chunk menor + paginação completa
  const CHUNK = 120;
  for (let i = 0; i < nums.length; i += CHUNK) {
    const chunk = nums.slice(i, i + CHUNK);
    const where =
      `SEZ.D_E_L_E_T_=' ' AND CTT.D_E_L_E_T_=' ' AND CTT_CUSTO=EZ_CCUSTO` +
      ` AND EZ_RECPAG='P' AND EZ_NUM IN (${chunk.map((n) => `'${n}'`).join(',')})`;
    let page = 1;
    for (;;) {
      const d = await genericQuery(tenantId, {
        tables: 'SEZ,CTT',
        fields: 'EZ_NUM,EZ_PREFIXO,EZ_PARCELA,EZ_CLIFOR,EZ_LOJA,EZ_TIPO,EZ_CCUSTO,EZ_PERC,CTT_DESC01',
        where, page: String(page), pageSize: '1000',
      });
      if (d.error) { console.error('[impacto] SEZ chunk falhou:', d.error); break; }
      for (const it of d.items || []) {
        const k = [it.ez_prefixo, it.ez_num, it.ez_parcela, it.ez_tipo, it.ez_clifor, it.ez_loja].map(trim).join('|');
        const perc = num(it.ez_perc);
        const cur = map.get(k);
        if (!cur || perc >= cur.perc) {
          map.set(k, { cc: trim(it.ez_ccusto), desc: trim(it.ctt_desc01), perc });
        }
      }
      if (!d.hasNext) break;
      page++;
    }
  }
  return new Map([...map.entries()].map(([k, v]) => [k, { cc: v.cc, desc: v.desc }]));
}

export async function ensureImpactoTables() {
  if (!sql) throw new Error('Banco não disponível');
  await sql`
    CREATE TABLE IF NOT EXISTS impacto_titulos (
      id SERIAL PRIMARY KEY,
      empresa TEXT NOT NULL,
      filial TEXT NOT NULL DEFAULT '',
      prefixo TEXT NOT NULL DEFAULT '',
      num TEXT NOT NULL DEFAULT '',
      parcela TEXT NOT NULL DEFAULT '',
      tipo TEXT NOT NULL DEFAULT '',
      fornecedor TEXT NOT NULL DEFAULT '',
      loja TEXT NOT NULL DEFAULT '',
      fornecedor_nome TEXT,
      natureza TEXT,
      natureza_desc TEXT,
      emissao DATE, vencto DATE, vencto_real DATE, baixa DATE,
      valor NUMERIC(15,2) DEFAULT 0, multa NUMERIC(15,2) DEFAULT 0,
      juros NUMERIC(15,2) DEFAULT 0, acresc NUMERIC(15,2) DEFAULT 0,
      desconto NUMERIC(15,2) DEFAULT 0, decrescimo NUMERIC(15,2) DEFAULT 0,
      val_liq_baix NUMERIC(15,2) DEFAULT 0,
      ccusto TEXT, ccusto_desc TEXT,
      origem TEXT, bco_pgto TEXT, dt_contab DATE, historico TEXT,
      num_bordero TEXT, num_fatura TEXT, dt_liberacao DATE, aprovador TEXT,
      id_agilitas TEXT, status_lib TEXT, forma_pgto TEXT, dt_inclusao DATE,
      validacao TEXT, observacao TEXT, setor TEXT, gestor TEXT,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (empresa, filial, prefixo, num, parcela, tipo, fornecedor, loja)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_impacto_baixa ON impacto_titulos(baixa)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_impacto_empresa ON impacto_titulos(empresa)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_impacto_setor ON impacto_titulos(setor)`;
  await sql`
    CREATE TABLE IF NOT EXISTS impacto_sync_state (
      empresa TEXT PRIMARY KEY,
      last_sync_at TIMESTAMPTZ,
      last_full_from DATE,
      last_count INT DEFAULT 0
    )
  `;
  // reparo: 'LOGÍSTICA' veio com surrogate solto do Excel legado
  await sql.query(
    `UPDATE impacto_titulos SET setor='LOGÍSTICA'
     WHERE setor LIKE 'LOG%STICA%' AND setor <> 'LOGÍSTICA'`
  ).then((r: any) => console.log('[impacto] setor fix rows:', r.rowCount))
    .catch((e: any) => console.error('[impacto] setor fix falhou:', e?.message));
}

/** Intervalo incremental: últimos `monthsBack` meses (baixas e acréscimos podem mudar retroativamente). */
function monthRange(monthsBack: number, fullFrom?: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const d = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);
  const from = fullFrom || d.toISOString().slice(0, 10);
  return { from, to };
}

export interface SyncResult {
  empresa: string;
  from: string;
  to: string;
  fetched: number;
  upserted: number;
  error?: string;
}

/** Sincroniza títulos com acréscimo de uma empresa para `impacto_titulos`. */
export async function syncImpactoEmpresa(empresa: 'EQS' | 'BRATEC', opts: { monthsBack?: number; fullFrom?: string } = {}): Promise<SyncResult> {
  await ensureImpactoTables();
  const tenantId = EMPRESAS[empresa];
  const { from, to } = monthRange(opts.monthsBack ?? 3, opts.fullFrom);
  const { rows, error } = await fetchTitulos(tenantId, from, to);
  if (error && !rows.length) return { empresa, from, to, fetched: 0, upserted: 0, error };

  const ccMap = await fetchCentrosCusto(tenantId, rows);
  let upserted = 0;
  for (const r of rows) {
    const cc = ccMap.get(
      [r.e2_prefixo, r.e2_num, r.e2_parcela, r.e2_tipo, r.e2_fornece, r.e2_loja].map(trim).join('|')
    );
    try {
      await sql`
        INSERT INTO impacto_titulos (
          empresa, filial, prefixo, num, parcela, tipo, fornecedor, loja,
          fornecedor_nome, natureza, natureza_desc,
          emissao, vencto, vencto_real, baixa,
          valor, multa, juros, acresc, desconto, decrescimo, val_liq_baix,
          ccusto, ccusto_desc, origem, bco_pgto, dt_contab, historico,
          num_bordero, num_fatura, dt_liberacao, aprovador, id_agilitas,
          status_lib, forma_pgto, dt_inclusao, synced_at
        ) VALUES (
          ${empresa}, ${trim(r.e2_filial)}, ${trim(r.e2_prefixo)}, ${trim(r.e2_num)},
          ${trim(r.e2_parcela)}, ${trim(r.e2_tipo)}, ${trim(r.e2_fornece)}, ${trim(r.e2_loja)},
          ${nul(r.a2_nome)}, ${nul(r.e2_naturez)}, ${nul(r.ed_descric)},
          ${dt(r.e2_emissao)}, ${dt(r.e2_vencto)}, ${dt(r.e2_vencrea)}, ${dt(r.e2_baixa)},
          ${num(r.e2_valor)}, ${num(r.e2_multa)}, ${num(r.e2_juros)}, ${num(r.e2_acresc)},
          ${num(r.e2_descont)}, ${num(r.e2_decr)}, ${num(r.e2_valliq)},
          ${nul(cc?.cc)}, ${nul(cc?.desc)}, ${nul(r.e2_origem)}, ${nul(r.e2_bcopag)},
          ${dt(r.e2_dtcont)}, ${nul(r.e2_hist)}, ${nul(r.e2_numboro)}, ${nul(r.e2_fatura)},
          ${dt(r.e2_datalib)}, ${nul(r.e2_aprova)}, ${nul(r.e2_idagil)},
          ${nul(r.e2_statlib)}, ${nul(r.e2_formpag)}, ${dt(r.e2_dtdigit)}, NOW()
        )
        ON CONFLICT (empresa, filial, prefixo, num, parcela, tipo, fornecedor, loja)
        DO UPDATE SET
          fornecedor_nome = EXCLUDED.fornecedor_nome,
          natureza = EXCLUDED.natureza, natureza_desc = EXCLUDED.natureza_desc,
          emissao = EXCLUDED.emissao, vencto = EXCLUDED.vencto,
          vencto_real = EXCLUDED.vencto_real, baixa = EXCLUDED.baixa,
          valor = EXCLUDED.valor, multa = EXCLUDED.multa, juros = EXCLUDED.juros,
          acresc = EXCLUDED.acresc, desconto = EXCLUDED.desconto,
          decrescimo = EXCLUDED.decrescimo, val_liq_baix = EXCLUDED.val_liq_baix,
          ccusto = EXCLUDED.ccusto, ccusto_desc = EXCLUDED.ccusto_desc,
          origem = EXCLUDED.origem, bco_pgto = EXCLUDED.bco_pgto,
          dt_contab = EXCLUDED.dt_contab, historico = EXCLUDED.historico,
          num_bordero = EXCLUDED.num_bordero, num_fatura = EXCLUDED.num_fatura,
          dt_liberacao = EXCLUDED.dt_liberacao, aprovador = EXCLUDED.aprovador,
          id_agilitas = EXCLUDED.id_agilitas, status_lib = EXCLUDED.status_lib,
          forma_pgto = EXCLUDED.forma_pgto, dt_inclusao = EXCLUDED.dt_inclusao,
          synced_at = NOW()
      `;
      upserted++;
    } catch (e: any) {
      console.error(`[impacto] upsert falhou ${r.e2_num}:`, e?.message);
    }
  }
  await sql`
    INSERT INTO impacto_sync_state (empresa, last_sync_at, last_full_from, last_count)
    VALUES (${empresa}, NOW(), ${opts.fullFrom || null}, ${rows.length})
    ON CONFLICT (empresa) DO UPDATE SET last_sync_at = NOW(), last_count = ${rows.length}
  `;
  return { empresa, from, to, fetched: rows.length, upserted, error };
}

export async function syncImpacto(opts: { monthsBack?: number; full?: boolean } = {}): Promise<SyncResult[]> {
  const fullFrom = opts.full ? '2024-01-01' : undefined;
  const results: SyncResult[] = [];
  for (const emp of Object.keys(EMPRESAS) as ('EQS' | 'BRATEC')[]) {
    results.push(await syncImpactoEmpresa(emp, { monthsBack: opts.monthsBack ?? 3, fullFrom }));
  }
  return results;
}
