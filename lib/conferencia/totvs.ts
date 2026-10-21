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
}

/**
 * Verifica se o título da NF está em borderô de pagamento (SEA — "Títulos
 * Enviados ao Banco") e complementa com a baixa no SE2. A linha SEA persiste
 * após o pagamento, então serve tanto pra "está em borderô" quanto "foi paga
 * via borderô N em data D". Filtro só por doc+série no where (campos char
 * têm padding variável) — fornecedor/loja filtrados no cliente.
 */
export async function checkTituloBordero(
  doc: string, serie: string, fornec: string, loja: string, empresa?: string
): Promise<BorderoInfo[]> {
  const out: BorderoInfo[] = [];
  const doc9 = String(doc || '').trim().padStart(9, '0');
  const serieT = String(serie || '').trim();
  const emps = empresa && EMPRESAS[empresa] ? [empresa] : Object.keys(EMPRESAS);
  for (const emp of emps) {
    const tenantId = EMPRESAS[emp];
    if (!tenantId) continue;
    try {
      const d = await genericQuery(tenantId, {
        tables: 'SEA',
        fields: 'EA_NUMBOR,EA_DATABOR,EA_PORTADO,EA_AGEDEP,EA_NUMCON,EA_SITUACA,EA_OCORR,EA_FORNECE,EA_LOJA,EA_TIPO,EA_NUM,EA_PARCELA',
        where: `SEA.D_E_L_E_T_=' ' AND (EA_NUM='${doc9}' OR EA_NUM='${doc}') AND EA_PREFIXO='${serieT}'`,
        page: '1',
        pageSize: '50',
      });
      const rows = (d.items || []).filter(
        (it: any) =>
          (!fornec || trim(it.ea_fornece) === fornec) &&
          (!loja || trim(it.ea_loja) === loja)
      );
      if (!rows.length) continue;
      // Baixa no SE2 do(s) título(s) encontrados — borderô pode já ter pago.
      const b = await genericQuery(tenantId, {
        tables: 'SE2',
        fields: 'E2_NUM,E2_PARCELA,E2_BAIXA,E2_VALLIQ',
        where: `SE2.D_E_L_E_T_=' ' AND (E2_NUM='${doc9}' OR E2_NUM='${doc}') AND E2_PREFIXO='${serieT}'`,
        page: '1',
        pageSize: '50',
      });
      const baixas = new Map<string, string>();
      for (const it of b.items || []) {
        const bx = trim(it.e2_baixa);
        if (bx) baixas.set(`${trim(it.e2_num)}|${trim(it.e2_parcela)}`, bx);
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
    } catch {}
  }
  return out;
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
  errors: string[];
}

const SEA_FIELDS = 'EA_NUMBOR,EA_DATABOR,EA_PORTADO,EA_AGEDEP,EA_NUMCON,EA_SITUACA,EA_OCORR,EA_FORNECE,EA_LOJA,EA_TIPO,EA_NUM,EA_PARCELA,EA_PREFIXO';
const SE2_FIELDS = 'E2_NUM,E2_PARCELA,E2_BAIXA,E2_VALLIQ,E2_FORNECE,E2_LOJA,E2_PREFIXO';
const BATCH_CHUNK = 120; // tamanho do IN(...) — URL da genericQuery tem limite

function docVariants(doc: string): string[] {
  const d = trim(doc);
  const d9 = d.padStart(9, '0');
  return d9 === d ? [d9] : [d9, d];
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
  const errors: string[] = [];
  if (!notas.length) return { porNota, errors };

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
        const d = await genericQuery(tenantId, {
          tables: 'SEA', fields: SEA_FIELDS,
          where: `SEA.D_E_L_E_T_=' ' AND EA_NUM IN (${inList})${serieFilter}`,
          page: '1', pageSize: '1000',
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

    // Baixas SE2 do mesmo conjunto de docs — uma passada por chunk.
    if (porNota.size) {
      for (let i = 0; i < docNums.length; i += BATCH_CHUNK) {
        const chunk = docNums.slice(i, i + BATCH_CHUNK);
        const inList = chunk.map((d) => `'${d}'`).join(',');
        try {
          const b = await genericQuery(tenantId, {
            tables: 'SE2', fields: SE2_FIELDS,
            where: `SE2.D_E_L_E_T_=' ' AND E2_NUM IN (${inList})`,
            page: '1', pageSize: '1000',
          });
          if (b.error) { errors.push(`${emp} SE2: ${b.error}`); continue; }
          const baixas = new Map<string, string>();
          for (const it of b.items || []) {
            const bx = trim(it.e2_baixa);
            if (bx) baixas.set(`${trim(it.e2_num)}|${trim(it.e2_parcela)}`, bx);
          }
          for (const arr of porNota.values()) {
            for (const info of arr as (BorderoInfo & { _num?: string; _parcela?: string })[]) {
              if (info.empresa !== emp) continue;
              info.baixa = baixas.get(`${info._num}|${info._parcela}`) || info.baixa;
              delete info._num; delete info._parcela;
            }
          }
        } catch (e: any) {
          errors.push(`${emp} SE2: ${e?.message || e}`);
        }
      }
    }
  }
  return { porNota, errors };
}

// ── Monitor de re-lançamento (notas canceladas) ─────────────────────────────

export interface NfIdentidade {
  doc: string;
  serie: string;
  fornec: string; // código SA2
  loja: string;
  empresa: string; // '' = tenta todos os tenants
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
      const hd = await genericQuery(tenantId, {
        tables: 'SF1,SA2',
        fields: SF1_SA2_FIELDS + ',SF1.D_E_L_E_T_',
        where: `SF1.F1_DOC IN (${docIn})` +
          (ref.serie ? ` AND SF1.F1_SERIE='${ref.serie}'` : '') +
          (ref.fornec ? ` AND SF1.F1_FORNECE='${ref.fornec}'` : '') +
          ` AND SA2.D_E_L_E_T_=' ' AND SF1.F1_FORNECE=SA2.A2_COD AND SF1.F1_LOJA=SA2.A2_LOJA`,
        page: '1', pageSize: '50',
      });
      if (hd.error) continue;
      const rows = (hd.items || []).filter(
        (it: any) => !ref.loja || trim(it.f1_loja) === ref.loja
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
