/**
 * Conferência de mercadoria — consulta TOTVS REST (SF1+SA2 cabeçalho,
 * SD1+SB1 itens) para NFs lançadas (bot OU humano), EQS + BRATEC.
 *
 * Port de conferencia-notas-mercadoria/totvs_mercadoria_api.py sobre o client
 * compartilhado lib/impacto/totvs.ts (cookie + OAuth2 + genericQuery paginada).
 */
import { createHash } from 'crypto';
import { genericQuery, EMPRESAS } from '../impacto/totvs';

export const SF1_SA2_FIELDS = [
  'F1_FILIAL', 'F1_DOC', 'F1_SERIE', 'F1_FORNECE', 'F1_LOJA', 'F1_EMISSAO', 'F1_VALBRUT',
  'F1_DTDIGIT', 'F1_DTLANC', 'F1_ESPECIE', 'F1_HORA', 'F1_COND', 'F1_TIPO',
  'F1_DESCONT', 'F1_IRRF', 'F1_INSS', 'F1_ISS', 'F1_STATUS', 'F1_USERLGI',
  'F1_TIPODOC', 'F1_VALPIS', 'F1_VALCSLL', 'F1_CHVNFE', 'F1_NATUREZ',
  'F1_VALICMS', 'F1_VALIPI', 'F1_BRICMS', 'F1_BRIPI', 'F1_ICMST', 'F1_ICMSRET',
  'A2_NOME', 'A2_CGC',
].join(',');

export const SD1_SB1_FIELDS = [
  'D1_FILIAL', 'D1_DOC', 'D1_SERIE', 'D1_FORNECE', 'D1_LOJA', 'D1_COD', 'D1_ITEM',
  'D1_QUANT', 'D1_VUNIT', 'D1_TOTAL', 'D1_VALICMS', 'D1_VALIPI', 'D1_TES', 'D1_CF', 'D1_ICMSRET',
  'D1_BASEICM', 'D1_BASEIPI', 'D1_VALDESC', 'D1_CLASFIS',
  // Conferência Lince-parity: alíquotas, frete/seguro/despesa por item.
  'D1_PICM', 'D1_IPI', 'D1_VALFRE', 'D1_SEGURO', 'D1_DESPESA', 'D1_BRICMS',
  'B1_DESC', 'B1_UM',
].join(',');

/** F1_USERLGI codificado → usuário (prefixo até os 2 dígitos após '@='). */
const USERLGI_PREFIX_MAP: Record<string, string> = {
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

export function decodeUserlgi(userlgi: string): string {
  if (!userlgi) return '';
  const s = userlgi.trim();
  for (const [prefix, name] of Object.entries(USERLGI_PREFIX_MAP)) {
    if (s.startsWith(prefix)) return name;
  }
  return s;
}

export interface NfMercadoria {
  header: Record<string, any> & { _empresa: string };
  items: Record<string, any>[];
}

const trim = (v: any) => (v === null || v === undefined ? '' : String(v).trim());

function whereEspecie(especie: string): string {
  const parts = especie.split(',').map((e) => `'${e.trim()}'`).join(',');
  return `AND SF1.F1_ESPECIE IN (${parts}) `;
}

async function fetchHeaders(
  tenantId: string, dateFrom: string, dateTo: string, especie: string
): Promise<{ rows: any[]; error?: string }> {
  const where =
    `SF1.F1_DTDIGIT>='${dateFrom}' AND SF1.F1_DTDIGIT<='${dateTo}' ` +
    whereEspecie(especie) +
    `AND SF1.D_E_L_E_T_=' ' AND SA2.D_E_L_E_T_=' '` +
    `AND SF1.F1_FORNECE=SA2.A2_COD AND SF1.F1_LOJA=SA2.A2_LOJA`;
  const out: any[] = [];
  const seen = new Set<string>();
  let page = 1;
  for (;;) {
    const d = await genericQuery(tenantId, {
      tables: 'SF1,SA2', fields: SF1_SA2_FIELDS, where, page: String(page), pageSize: '1000',
    });
    if (d.error) return { rows: out, error: d.error };
    for (const it of d.items || []) {
      const k = [it.f1_filial, it.f1_doc, it.f1_serie, it.f1_fornece, it.f1_loja, it.f1_dtdigit].map(trim).join('|');
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(it);
    }
    if (!d.hasNext) break;
    page++;
  }
  return { rows: out };
}

/** Todos os itens SD1+SB1 do período em lote, agrupados por (doc,serie,fornec,loja). */
async function fetchAllItems(
  tenantId: string, dateFrom: string, dateTo: string
): Promise<{ groups: Map<string, any[]>; error?: string }> {
  const where =
    `SD1.D1_DTDIGIT>='${dateFrom}' AND SD1.D1_DTDIGIT<='${dateTo}' ` +
    `AND SD1.D_E_L_E_T_=' ' AND SB1.D_E_L_E_T_=' ' AND SD1.D1_COD=SB1.B1_COD`;
  const groups = new Map<string, any[]>();
  let page = 1;
  for (;;) {
    const d = await genericQuery(tenantId, {
      tables: 'SD1,SB1', fields: SD1_SB1_FIELDS, where, page: String(page), pageSize: '1000',
    });
    if (d.error) return { groups, error: d.error };
    for (const it of d.items || []) {
      const key = [it.d1_doc, it.d1_serie, it.d1_fornece, it.d1_loja].map(trim).join('|');
      const g = groups.get(key);
      if (g) g.push(it);
      else groups.set(key, [it]);
    }
    if (!d.hasNext) break;
    page++;
  }
  return { groups };
}

/**
 * Busca NFs de mercadoria (espécies) por data de digitação numa janela
 * YYYYMMDD — todas as empresas em EMPRESAS (EQS + BRATEC).
 */
export async function fetchMercadoriaNfs(
  dateFrom: string, dateTo: string, especie = 'SPED',
  empresas: string[] = Object.keys(EMPRESAS),
): Promise<{ nfs: NfMercadoria[]; errors: string[] }> {
  const nfs: NfMercadoria[] = [];
  const errors: string[] = [];
  for (const emp of empresas) {
    const tenantId = EMPRESAS[emp];
    if (!tenantId) continue;
    const [headers, items] = await Promise.all([
      fetchHeaders(tenantId, dateFrom, dateTo, especie),
      fetchAllItems(tenantId, dateFrom, dateTo),
    ]);
    if (headers.error && !headers.rows.length) {
      errors.push(`${emp} headers: ${headers.error}`);
      continue;
    }
    if (headers.error) errors.push(`${emp} headers parcial: ${headers.error}`);
    if (items.error) errors.push(`${emp} itens: ${items.error}`);
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
export async function fetchZ01XmlByChave(chave: string): Promise<string | null> {
  if (!/^\d{44}$/.test(chave)) return null;
  for (const emp of Object.keys(EMPRESAS)) {
    const tenantId = EMPRESAS[emp];
    if (!tenantId) continue;
    try {
      const d = await genericQuery(tenantId, {
        tables: 'Z01',
        // Z01_XMLNFE é memo — sozinho no fields dá HTTP 500; precisa de outra coluna.
        fields: 'Z01_CHVNFE,Z01_XMLNFE',
        where: `Z01.Z01_CHVNFE='${chave}' AND Z01.D_E_L_E_T_=' '`,
        page: '1',
        pageSize: '5',
      });
      for (const it of d.items || []) {
        const xml = String(it.z01_xmlnfe || '').trim();
        if (xml.includes('infNFe')) return xml;
      }
    } catch {}
  }
  return null;
}

/**
 * Fonte zero-custo alternativa: a fila "XMLs Disponíveis" do MATA143 (SDS)
 * guarda o XML completo da NF-e em DS_XML — inclusive de notas já lançadas
 * (DS_STATUS='G'), cobrindo casos que a Z01 não tem. Mesma genericQuery.
 */
export async function fetchSdsXmlByChave(chave: string): Promise<string | null> {
  if (!/^\d{44}$/.test(chave)) return null;
  for (const emp of Object.keys(EMPRESAS)) {
    const tenantId = EMPRESAS[emp];
    if (!tenantId) continue;
    try {
      const d = await genericQuery(tenantId, {
        tables: 'SDS',
        // DS_XML é memo — precisa de coluna companheira no fields (igual Z01).
        fields: 'DS_DOC,DS_CHAVENF,DS_XML',
        where: `SDS.DS_CHAVENF='${chave}' AND SDS.D_E_L_E_T_=' '`,
        page: '1',
        pageSize: '5',
      });
      for (const it of d.items || []) {
        const xml = String(it.ds_xml || '').trim();
        if (xml.includes('infNFe')) return xml;
      }
    } catch {}
  }
  return null;
}

// ── Duplicatas SE2 ──────────────────────────────────────────────────────────
// Parcelas da NF no contas a pagar — conferidas contra <cobr><dup> do XML.

export interface Se2Parcela {
  parcela: string;
  tipo: string;
  natureza: string;
  valor: number;
  vencto: string | null;
}

const SE2_PARC_FIELDS = 'E2_NUM,E2_PREFIXO,E2_PARCELA,E2_TIPO,E2_NATUREZ,E2_VALOR,E2_VENCTO,E2_VENCREA,E2_FORNECE,E2_LOJA,E2_BAIXA';

/** Chave canônica doc|serie|fornec|loja (doc pad-9) — mesma do mapa de retorno. */
export function se2ParcelaKey(doc: string, serie: string, fornec: string, loja: string): string {
  return `${trim(doc).padStart(9, '0')}|${trim(serie)}|${trim(fornec)}|${trim(loja)}`;
}

/** Parcelas SE2 por nota (doc+serie+fornec+loja), batch com IN(...) paginado.
 * Chave de retorno: `se2ParcelaKey(doc, serie, fornec, loja)`. */
export async function fetchSe2Parcelas(
  refs: { doc: string; serie: string; fornec: string; loja: string; empresa: string }[]
): Promise<Map<string, Se2Parcela[]>> {
  const out = new Map<string, Se2Parcela[]>();
  if (!refs.length) return out;
  const allEmps = Object.keys(EMPRESAS);
  const porEmpresa = new Map<string, typeof refs>();
  for (const n of refs) {
    const emps = n.empresa && EMPRESAS[n.empresa] ? [n.empresa] : allEmps;
    for (const emp of emps) {
      const g = porEmpresa.get(emp);
      if (g) g.push(n); else porEmpresa.set(emp, [n]);
    }
  }
  const keyOf = se2ParcelaKey;
  for (const [emp, grupo] of porEmpresa) {
    const tenantId = EMPRESAS[emp];
    const docNums = [...new Set(grupo.flatMap((n) => docVariants(n.doc)))];
    for (let i = 0; i < docNums.length; i += BATCH_CHUNK) {
      const inList = docNums.slice(i, i + BATCH_CHUNK).map((d) => `'${d}'`).join(',');
      try {
        const d = await queryAllPages(tenantId, {
          tables: 'SE2', fields: SE2_PARC_FIELDS,
          where: `SE2.D_E_L_E_T_=' ' AND E2_NUM IN (${inList})`,
          pageSize: '1000',
        });
        for (const it of d.items || []) {
          for (const n of grupo) {
            if (!docVariants(n.doc).includes(trim(it.e2_num))) continue;
            if (n.serie && trim(it.e2_prefixo) !== n.serie) continue;
            if (n.fornec && trim(it.e2_fornece) !== n.fornec) continue;
            if (n.loja && trim(it.e2_loja) !== n.loja) continue;
            const k = keyOf(n.doc, n.serie, n.fornec, n.loja);
            const arr = out.get(k) || [];
            const ven = trim(it.e2_vencrea || it.e2_vencto);
            arr.push({
              parcela: trim(it.e2_parcela),
              tipo: trim(it.e2_tipo),
              natureza: trim(it.e2_naturez),
              valor: Number(it.e2_valor) || 0,
              vencto: /^\d{4}-\d{2}-\d{2}/.test(ven) ? ven.slice(0, 10) : null,
            });
            out.set(k, arr);
          }
        }
      } catch {}
    }
  }
  return out;
}

export interface BorderoInfo {
  empresa: string;
  numbor: string;
  databor: string | null;
  banco: string;
  agencia: string;
  conta: string;
  situacao: string;
  ocorrencia: string;
  baixa: string | null;
  /** Preenchido quando o título foi pago via fatura/boletão (E2_FATURA→FT). */
  via_fatura?: string | null;
}

/**
 * Verifica se o título da NF está em borderô de pagamento (SEA — "Títulos
 * Enviados ao Banco") e complementa com a baixa no SE2. A linha SEA persiste
 * após o pagamento, então serve tanto pra "está em borderô" quanto "foi paga
 * via borderô N em data D". Filtro só por doc+série no where (campos char
 * têm padding variável) — fornecedor/loja filtrados no cliente.
 *
 * Também segue o hop de boletão: SE2.E2_FATURA aponta pra FT que agrupou a
 * NF — o borderô está no título FT, não na NF.
 */
export async function checkTituloBordero(
  doc: string, serie: string, fornec: string, loja: string, empresa?: string
): Promise<{ borderos: BorderoInfo[]; baixaDireta: string | null }> {
  const out: BorderoInfo[] = [];
  let baixaDireta: string | null = null;
  const doc9 = String(doc || '').trim().padStart(9, '0');
  const serieT = String(serie || '').trim();
  const emps = empresa && EMPRESAS[empresa] ? [empresa] : Object.keys(EMPRESAS);
  for (const emp of emps) {
    const tenantId = EMPRESAS[emp];
    if (!tenantId) continue;
    try {
      const d = await queryAllPages(tenantId, {
        tables: 'SEA',
        fields: 'EA_NUMBOR,EA_DATABOR,EA_PORTADO,EA_AGEDEP,EA_NUMCON,EA_SITUACA,EA_OCORR,EA_FORNECE,EA_LOJA,EA_TIPO,EA_NUM,EA_PARCELA',
        where: `SEA.D_E_L_E_T_=' ' AND (EA_NUM='${doc9}' OR EA_NUM='${doc}') AND EA_PREFIXO='${serieT}'`,
        pageSize: '200',
      }, 5);
      const rows = (d.items || []).filter(
        (it: any) =>
          (!fornec || trim(it.ea_fornece) === fornec) &&
          (!loja || trim(it.ea_loja) === loja)
      );
      // Baixa no SE2 — mesmo sem linha SEA a NF pode ter sido paga via
      // fatura agrupada (E2_FATURA) ou direto com E2_NUMBOR.
      const b = await queryAllPages(tenantId, {
        tables: 'SE2',
        fields: 'E2_NUM,E2_PARCELA,E2_BAIXA,E2_VALLIQ,E2_FATURA,E2_NUMBOR,E2_FORNECE,E2_LOJA,E2_PORTADO',
        where: `SE2.D_E_L_E_T_=' ' AND (E2_NUM='${doc9}' OR E2_NUM='${doc}') AND E2_PREFIXO='${serieT}'`,
        pageSize: '200',
      }, 5);
      const se2Rows = (b.items || []).filter(
        (it: any) =>
          (!fornec || trim(it.e2_fornece) === fornec) &&
          (!loja || trim(it.e2_loja) === loja)
      );
      const baixas = new Map<string, string>();
      const faturas = new Set<string>();
      for (const it of se2Rows) {
        const bx = trim(it.e2_baixa);
        if (bx) baixas.set(`${trim(it.e2_num)}|${trim(it.e2_parcela)}`, bx);
        const nb = trim(it.e2_numbor);
        if (nb) {
          // Título pago via borderô próprio mesmo sem linha SEA ativa.
          out.push({
            empresa: emp, numbor: nb,
            databor: bx ? bx.slice(0, 10) : null,
            banco: trim(it.e2_portado), agencia: '', conta: '',
            situacao: '', ocorrencia: '', baixa: bx || null,
          });
        }
        const fat = trim(it.e2_fatura);
        if (fat && fat !== 'NOTFAT') faturas.add(fat);
      }
      for (const it of rows) {
        out.push({
          empresa: emp,
          numbor: trim(it.ea_numbor),
          databor: (() => { const s = trim(it.ea_databor); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; })(),
          banco: trim(it.ea_portado),
          agencia: trim(it.ea_agedep),
          conta: trim(it.ea_numcon),
          situacao: trim(it.ea_situaca),
          ocorrencia: trim(it.ea_ocorr),
          baixa: baixas.get(`${trim(it.ea_num)}|${trim(it.ea_parcela)}`) || null,
        });
      }
      // Hop de boletão: o borderô está no título FT, não na NF.
      if (faturas.size) {
        const fList = [...faturas].map((f) => `'${f}'`).join(',');
        const fd = await queryAllPages(tenantId, {
          tables: 'SEA', fields: SEA_FIELDS,
          where: `SEA.D_E_L_E_T_=' ' AND EA_NUM IN (${fList})`,
          pageSize: '200',
        }, 5).catch(() => null);
        for (const it of fd?.items || []) {
          if (fornec && trim(it.ea_fornece) !== fornec) continue;
          if (loja && trim(it.ea_loja) !== loja) continue;
          if (!faturas.has(trim(it.ea_num))) continue;
          out.push({
            empresa: emp,
            numbor: trim(it.ea_numbor),
            databor: (() => { const s = trim(it.ea_databor); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; })(),
            banco: trim(it.ea_portado),
            agencia: trim(it.ea_agedep),
            conta: trim(it.ea_numcon),
            situacao: trim(it.ea_situaca),
            ocorrencia: trim(it.ea_ocorr),
            baixa: se2Rows.map((x: any) => trim(x.e2_baixa)).find(Boolean) || null,
            via_fatura: trim(it.ea_num),
          });
        }
      }
      // Baixa direta SE2 sem borderô nenhum (pagou fora de borderô).
      if (!out.length && !baixaDireta) {
        const bx = se2Rows.map((x: any) => trim(x.e2_baixa)).find(Boolean);
        if (bx) baixaDireta = bx.slice(0, 10);
      }
    } catch {}
  }
  return { borderos: out, baixaDireta };
}

// ── Batch de borderô ────────────────────────────────────────────────────────
// Mesma lógica de checkTituloBordero, mas uma query SEA/SE2 por tenant com
// EA_NUM/E2_NUM IN (...) — usado pelo syncBorderoStatus do worker (fila de
// remoção do contas a pagar). O match fino (doc/série/fornecedor/loja) continua
// client-side por causa do padding dos campos CHAR.

export interface BorderoNotaRef {
  id: number;
  doc: string;
  serie: string;
  fornec: string;  // código SA2 (já normalizado por tipo pelo chamador)
  loja: string;
  empresa: string; // EQS | BRATEC | '' (vazio = tenta todos os tenants)
}

export interface BorderoBatchResult {
  /** nota_id → borderôs encontrados (vazio = fora de borderô) */
  porNota: Map<number, BorderoInfo[]>;
  /** nota_id → data de baixa quando pagou SEM borderô (baixa direta SE2). */
  baixaDireta: Map<number, string>;
  errors: string[];
}

const SEA_FIELDS = 'EA_NUMBOR,EA_DATABOR,EA_PORTADO,EA_AGEDEP,EA_NUMCON,EA_SITUACA,EA_OCORR,EA_FORNECE,EA_LOJA,EA_TIPO,EA_NUM,EA_PARCELA,EA_PREFIXO';
const SE2_FIELDS = 'E2_NUM,E2_PARCELA,E2_BAIXA,E2_VALLIQ,E2_FORNECE,E2_LOJA,E2_PREFIXO,E2_NUMBOR,E2_FATURA,E2_PORTADO';
// SE2 guarda dezenas de linhas por doc (juros, renegociações, faturas) —
// 40 docs/chunk mantém o volume sob controle pro maxPages do queryAllPages.
const BATCH_CHUNK = 40; // tamanho do IN(...) — URL da genericQuery tem limite

function docVariants(doc: string): string[] {
  const d = trim(doc);
  const d9 = d.padStart(9, '0');
  return d9 === d ? [d9] : [d9, d];
}

// genericQuery paginada — um chunk de IN(...) pode estourar o pageSize (SE2
// tem várias linhas por doc: juros, renegociações, faturas). Sem isso o batch
// perdia silenciosamente docs que caíam na página 2+ (bug da NF 31231).
// Estourar o maxPages sem esgotar vira erro — truncamento nunca é silencioso.
async function queryAllPages(
  tenantId: string,
  params: Record<string, string>,
  maxPages = 30
): Promise<{ items: any[]; error?: string }> {
  const items: any[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const d = await genericQuery(tenantId, { ...params, page: String(page) });
    if (d.error) return { items, error: d.error };
    items.push(...(d.items || []));
    if (!d.hasNext) return { items };
    if (page === maxPages) return { items, error: 'paginação truncada (maxPages)' };
  }
  return { items };
}

function rowMatchesNota(it: any, n: BorderoNotaRef, numField: string): boolean {
  const num = trim(it[numField]);
  if (!docVariants(n.doc).includes(num)) return false;
  if (n.serie && trim(it.ea_prefixo ?? it.e2_prefixo ?? '') !== n.serie) return false;
  const forn = trim(it.ea_fornece ?? it.e2_fornece ?? '');
  const loja = trim(it.ea_loja ?? it.e2_loja ?? '');
  if (n.fornec && forn !== n.fornec) return false;
  if (n.loja && loja !== n.loja) return false;
  return true;
}

export async function fetchBorderoStatusBatch(notas: BorderoNotaRef[]): Promise<BorderoBatchResult> {
  const porNota = new Map<number, BorderoInfo[]>();
  const baixaDireta = new Map<number, string>();
  const errors: string[] = [];
  if (!notas.length) return { porNota, baixaDireta, errors };

  // Agrupa por tenant alvo — nota sem empresa definida consulta todos.
  const allEmps = Object.keys(EMPRESAS);
  const porEmpresa = new Map<string, BorderoNotaRef[]>();
  for (const n of notas) {
    const emps = n.empresa && EMPRESAS[n.empresa] ? [n.empresa] : allEmps;
    for (const emp of emps) {
      const g = porEmpresa.get(emp);
      if (g) g.push(n); else porEmpresa.set(emp, [n]);
    }
  }

  for (const [emp, grupo] of porEmpresa) {
    const tenantId = EMPRESAS[emp];
    const docNums = [...new Set(grupo.flatMap((n) => docVariants(n.doc)))];
    const serieSet = new Set(grupo.map((n) => n.serie).filter(Boolean));

    for (let i = 0; i < docNums.length; i += BATCH_CHUNK) {
      const chunk = docNums.slice(i, i + BATCH_CHUNK);
      const inList = chunk.map((d) => `'${d}'`).join(',');
      const serieFilter = serieSet.size
        ? ` AND EA_PREFIXO IN (${[...serieSet].map((s) => `'${s}'`).join(',')})`
        : '';
      try {
        const d = await queryAllPages(tenantId, {
          tables: 'SEA', fields: SEA_FIELDS,
          where: `SEA.D_E_L_E_T_=' ' AND EA_NUM IN (${inList})${serieFilter}`,
          pageSize: '1000',
        });
        if (d.error) { errors.push(`${emp} SEA: ${d.error}`); continue; }
        for (const it of d.items || []) {
          for (const n of grupo) {
            if (!rowMatchesNota(it, n, 'ea_num')) continue;
            const arr = porNota.get(n.id) || [];
            arr.push({
              empresa: emp,
              numbor: trim(it.ea_numbor),
              databor: (() => { const s = trim(it.ea_databor); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; })(),
              banco: trim(it.ea_portado),
              agencia: trim(it.ea_agedep),
              conta: trim(it.ea_numcon),
              situacao: trim(it.ea_situaca),
              ocorrencia: trim(it.ea_ocorr),
              baixa: null, // preenchido pelo SE2 abaixo
              _num: trim(it.ea_num), _parcela: trim(it.ea_parcela),
            } as BorderoInfo & { _num: string; _parcela: string });
            porNota.set(n.id, arr);
          }
        }
      } catch (e: any) {
        errors.push(`${emp} SEA: ${e?.message || e}`);
      }
    }

    // Baixas SE2 do mesmo conjunto de docs — sempre roda: é onde moram a
    // baixa própria da NF, o E2_NUMBOR direto e o E2_FATURA (boletão).
    const se2PorNota = new Map<number, any[]>();
    for (let i = 0; i < docNums.length; i += BATCH_CHUNK) {
      const chunk = docNums.slice(i, i + BATCH_CHUNK);
      const inList = chunk.map((d) => `'${d}'`).join(',');
      try {
        const b = await queryAllPages(tenantId, {
          tables: 'SE2', fields: SE2_FIELDS,
          where: `SE2.D_E_L_E_T_=' ' AND E2_NUM IN (${inList})`,
          pageSize: '1000',
        });
        if (b.error) { errors.push(`${emp} SE2: ${b.error}`); continue; }
        for (const it of b.items || []) {
          for (const n of grupo) {
            if (!rowMatchesNota(it, n, 'e2_num')) continue;
            const arr2 = se2PorNota.get(n.id) || [];
            arr2.push(it);
            se2PorNota.set(n.id, arr2);
          }
        }
      } catch (e: any) {
        errors.push(`${emp} SE2: ${e?.message || e}`);
      }
    }

    // Aplica baixa nas linhas SEA diretas + colhe numbor/fatura da própria NF.
    const faturasPorNota = new Map<number, Set<string>>();
    const faturaSet = new Set<string>();
    for (const [notaId, se2Rows] of se2PorNota) {
      const arr = porNota.get(notaId) || [];
      const baixas = new Map<string, string>();
      let baixaPropria: string | null = null;
      for (const it of se2Rows) {
        const bx = trim(it.e2_baixa);
        if (bx) {
          baixas.set(`${trim(it.e2_num)}|${trim(it.e2_parcela)}`, bx);
          if (!baixaPropria) baixaPropria = bx;
        }
      }
      for (const info of arr as (BorderoInfo & { _num?: string; _parcela?: string })[]) {
        if (info.empresa !== emp) continue;
        info.baixa = baixas.get(`${info._num}|${info._parcela}`) || info.baixa;
      }
      for (const it of se2Rows) {
        const bx = trim(it.e2_baixa);
        const nb = trim(it.e2_numbor);
        if (nb) {
          // Baixada por borderô próprio mesmo sem linha SEA.
          arr.push({
            empresa: emp, numbor: nb,
            databor: bx ? bx.slice(0, 10) : null,
            banco: trim(it.e2_portado), agencia: '', conta: '',
            situacao: '', ocorrencia: '', baixa: bx || null,
          });
        }
        const fat = trim(it.e2_fatura);
        if (fat && fat !== 'NOTFAT') {
          const s = faturasPorNota.get(notaId) || new Set<string>();
          s.add(fat);
          faturasPorNota.set(notaId, s);
          faturaSet.add(fat);
        }
      }
      if (arr.length) porNota.set(notaId, arr);
      // Paga direto (sem borderô e sem fatura) — informa o chamador pra marcar
      // `pago` sem fingir linha de borderô.
      if (baixaPropria && !arr.length) baixaDireta.set(notaId, baixaPropria.slice(0, 10));
    }

    // Hop do boletão: a NF saiu num borderô via fatura FT — a linha SEA tem
    // EA_NUM = número da FT.
    if (faturaSet.size) {
      const fList = [...faturaSet].map((f) => `'${f}'`).join(',');
      try {
        const fd = await queryAllPages(tenantId, {
          tables: 'SEA', fields: SEA_FIELDS,
          where: `SEA.D_E_L_E_T_=' ' AND EA_NUM IN (${fList})`,
          pageSize: '500',
        });
        if (fd.error) { errors.push(`${emp} SEA-FT: ${fd.error}`); }
        for (const it of fd.items || []) {
          const fnum = trim(it.ea_num);
          for (const [notaId, fats] of faturasPorNota) {
            if (!fats.has(fnum)) continue;
            const n = grupo.find((g) => g.id === notaId)!;
            if (n.fornec && trim(it.ea_fornece) !== n.fornec) continue;
            if (n.loja && trim(it.ea_loja) !== n.loja) continue;
            const bx = (se2PorNota.get(notaId) || []).map((x: any) => trim(x.e2_baixa)).find(Boolean) || null;
            const arr = porNota.get(notaId) || [];
            arr.push({
              empresa: emp,
              numbor: trim(it.ea_numbor),
              databor: (() => { const s = trim(it.ea_databor); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; })(),
              banco: trim(it.ea_portado),
              agencia: trim(it.ea_agedep),
              conta: trim(it.ea_numcon),
              situacao: trim(it.ea_situaca),
              ocorrencia: trim(it.ea_ocorr),
              baixa: bx,
              via_fatura: fnum,
            });
            porNota.set(notaId, arr);
            baixaDireta.delete(notaId);
          }
        }
      } catch (e: any) {
        errors.push(`${emp} SEA-FT: ${e?.message || e}`);
      }
    }
  }
  // limpa os campos internos de match
  for (const arr of porNota.values()) {
    for (const info of arr as any[]) { delete info._num; delete info._parcela; }
  }
  return { porNota, baixaDireta, errors };
}

// ── Monitor de re-lançamento (notas canceladas) ─────────────────────────────

export interface NfIdentidade {
  doc: string;
  serie: string;
  fornec: string; // código SA2
  loja: string;
  empresa: string; // '' = tenta todos os tenants
  cnpj?: string;  // resolve fornec/loja via SA2 quando `fornec` é nome
}

// Códigos SA2 são alfanum curtos sem espaço ('W93259','001234'). Nomes de
// fornecedor não passam — usado pra decidir se vale filtrar F1_FORNECE.
export function isFornecCodigo(v: string): boolean {
  return /^[A-Z0-9]{1,8}$/.test(trim(v));
}

// SA2 por CNPJ — resolve o código/loja do fornecedor quando a nota guarda o
// nome (mercadoria importada por nome ou serviço sem backfill).
export async function sa2ByCnpj(tenantId: string, cnpj: string): Promise<{ cod: string; loja: string } | null> {
  try {
    const d = await genericQuery(tenantId, {
      tables: 'SA2', fields: 'A2_COD,A2_LOJA',
      where: `SA2.A2_CGC='${cnpj}' AND SA2.D_E_L_E_T_=' '`,
      page: '1', pageSize: '5',
    });
    const f = (d.items || [])[0];
    return f ? { cod: trim(f.a2_cod), loja: trim(f.a2_loja) } : null;
  } catch { return null; }
}

// Nome normalizado pra comparar `fiscal_notas.fornecedor` (vem do XML/PDF,
// com acento e sufixo LTDA) com SA2.A2_NOME (truncado ~35 chars, sem acento).
export function normFornecNome(v: string): string {
  return trim(v).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');
}

// SA2 por nome — pra nota cujo `fornecedor` guarda o nome em vez do código e
// não tem CNPJ (importação avulsa). LIKE com as 2 primeiras palavras
// desacentuadas limita a query; o match exato-normalizado é client-side.
export async function sa2ByNome(
  tenantId: string, nome: string
): Promise<{ cod: string; loja: string; nome: string; cgc: string }[]> {
  const alvo = normFornecNome(nome);
  if (alvo.length < 6) return [];
  const like = trim(nome)
    .toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/\s+/).filter(Boolean).slice(0, 2).join(' ')
    .replace(/'/g, '');
  if (like.length < 4) return [];
  try {
    const d = await genericQuery(tenantId, {
      tables: 'SA2', fields: 'A2_COD,A2_LOJA,A2_NOME,A2_CGC',
      where: `UPPER(SA2.A2_NOME) LIKE '${like}%' AND SA2.D_E_L_E_T_=' '`,
      page: '1', pageSize: '50',
    });
    return (d.items || [])
      .filter((it: any) => {
        const n = normFornecNome(it.a2_nome);
        return n.length >= 6 && (alvo.startsWith(n) || n.startsWith(alvo));
      })
      .map((it: any) => ({
        cod: trim(it.a2_cod), loja: trim(it.a2_loja),
        nome: trim(it.a2_nome), cgc: trim(it.a2_cgc),
      }));
  } catch { return []; }
}

export interface NfSnapshot {
  encontrada: boolean;          // existe SF1 ativa (não deletada)
  empresa: string | null;       // tenant onde achou
  header: Record<string, any> | null;
  items: Record<string, any>[];
  fingerprint: string | null;
}

/**
 * Fingerprint estável do estado TOTVS da NF — qualquer edição/re-digitação
 * muda o hash. Campos de valor/imposto/TES do header + itens ordenados.
 */
export function nfFingerprint(header: Record<string, any>, items: Record<string, any>[]): string {
  const H = ['f1_valbrut', 'f1_valicms', 'f1_valipi', 'f1_icmsret', 'f1_icmst', 'f1_tipo',
    'f1_especie', 'f1_dtdigit', 'f1_status', 'f1_irrf', 'f1_inss', 'f1_iss',
    'f1_valpis', 'f1_valcsll', 'f1_cond', 'f1_descont', 'f1_naturez', 'f1_chvnfe'];
  const I = ['d1_cod', 'd1_quant', 'd1_vunit', 'd1_total', 'd1_tes', 'd1_cf',
    'd1_icmsret', 'd1_clasfis', 'd1_valicms', 'd1_valipi', 'd1_valdesc'];
  const h = H.map((k) => trim(header?.[k])).join('|');
  const its = (items || [])
    .map((i) => I.map((k) => trim(i[k])).join(':'))
    .sort()
    .join(';');
  return createHash('sha256').update(`${h}#${its}`).digest('hex').slice(0, 32);
}

/**
 * Busca UMA nota na SF1/SD1 pela identidade (doc+série+fornecedor+loja) em
 * qualquer estado — inclui linhas deletadas (D_E_L_E_T_='*') pra distinguir
 * "excluída aguardando re-lançamento" de "ainda lançada". Sem janela de data.
 */
export async function fetchNfByIdentidade(ref: NfIdentidade): Promise<NfSnapshot> {
  const emps = ref.empresa && EMPRESAS[ref.empresa] ? [ref.empresa] : Object.keys(EMPRESAS);
  const docIn = docVariants(ref.doc).map((d) => `'${d}'`).join(',');
  for (const emp of emps) {
    const tenantId = EMPRESAS[emp];
    try {
      // `fornec` pode vir como nome (nota importada fora do syncConferencia)
      // — resolve o código SA2 por CNPJ nesse tenant antes de filtrar.
      let fornec = ref.fornec;
      let loja = ref.loja;
      if (!isFornecCodigo(fornec)) {
        const cnpj = trim(ref.cnpj || '');
        const f = /^\d{14}$/.test(cnpj) ? await sa2ByCnpj(tenantId, cnpj) : null;
        if (f) {
          fornec = f.cod;
          if (!loja && f.loja) loja = f.loja;
        } else {
          // Sem CNPJ (importação avulsa) — resolve pelo nome via SA2.A2_NOME.
          // Só assume quando o match é inequívoco (um único cod+loja).
          const cand = await sa2ByNome(tenantId, fornec);
          const distintos = [...new Map(cand.map((c) => [`${c.cod}|${c.loja}`, c])).values()];
          if (distintos.length === 1) {
            fornec = distintos[0].cod;
            if (!loja) loja = distintos[0].loja;
          }
        }
      }
      const hd = await genericQuery(tenantId, {
        tables: 'SF1,SA2',
        fields: SF1_SA2_FIELDS + ',SF1.D_E_L_E_T_',
        where: `SF1.F1_DOC IN (${docIn})` +
          (ref.serie ? ` AND SF1.F1_SERIE='${ref.serie}'` : '') +
          (fornec ? ` AND SF1.F1_FORNECE='${fornec}'` : '') +
          ` AND SA2.D_E_L_E_T_=' ' AND SF1.F1_FORNECE=SA2.A2_COD AND SF1.F1_LOJA=SA2.A2_LOJA`,
        page: '1', pageSize: '50',
      });
      if (hd.error) continue;
      const rows = (hd.items || []).filter(
        (it: any) => !loja || trim(it.f1_loja) === loja
      );
      // Prefere a linha ativa; se só houver deletada, reporta como excluída.
      const ativa = rows.find((r: any) => trim(r['d_e_l_e_t_'] ?? r['D_E_L_E_T_'] ?? '') !== '*');
      if (!ativa) {
        if (rows.length) return { encontrada: false, empresa: emp, header: null, items: [], fingerprint: null };
        continue;
      }
      const it = await genericQuery(tenantId, {
        tables: 'SD1,SB1',
        fields: SD1_SB1_FIELDS + ',SD1.D_E_L_E_T_',
        where: `SD1.D1_DOC IN (${docIn})` +
          (ref.serie ? ` AND SD1.D1_SERIE='${ref.serie}'` : '') +
          ` AND SD1.D1_FORNECE='${trim(ativa.f1_fornece)}' AND SD1.D1_LOJA='${trim(ativa.f1_loja)}'` +
          ` AND SD1.D1_COD=SB1.B1_COD`,
        page: '1', pageSize: '500',
      });
      const items = (it.items || []).filter(
        (r: any) => trim(r['d_e_l_e_t_'] ?? r['D_E_L_E_T_'] ?? '') !== '*'
      );
      const header = { ...ativa, _empresa: emp };
      return {
        encontrada: true, empresa: emp, header, items,
        fingerprint: nfFingerprint(ativa, items),
      };
    } catch {}
  }
  return { encontrada: false, empresa: null, header: null, items: [], fingerprint: null };
}

/**
 * Re-leitura dedicada da SD1 de UMA nota (sem janela de data). O batch do
 * ciclo pode reportar 0 itens por corrida — Lince gravando os itens depois do
 * fetch em lote, ou deriva de paginação com a tabela crescendo. Antes de
 * acusar "0 itens no TOTVS", confirma com esta leitura pontual.
 */
export async function fetchSd1ItensNota(
  tenantId: string,
  ref: { doc: string; serie?: string; fornec: string; loja?: string },
): Promise<any[]> {
  const docIn = docVariants(ref.doc).map((d) => `'${d}'`).join(',');
  const it = await genericQuery(tenantId, {
    tables: 'SD1,SB1',
    fields: SD1_SB1_FIELDS,
    where: `SD1.D1_DOC IN (${docIn})` +
      (ref.serie ? ` AND SD1.D1_SERIE='${ref.serie}'` : '') +
      ` AND SD1.D1_FORNECE='${trim(ref.fornec)}'` +
      (ref.loja ? ` AND SD1.D1_LOJA='${trim(ref.loja)}'` : '') +
      ` AND SD1.D1_COD=SB1.B1_COD AND SD1.D_E_L_E_T_=' ' AND SB1.D_E_L_E_T_=' '`,
    page: '1', pageSize: '500',
  });
  return it.items || [];
}
