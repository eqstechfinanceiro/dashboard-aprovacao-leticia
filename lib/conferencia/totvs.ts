/**
 * Conferência de mercadoria — consulta TOTVS REST (SF1+SA2 cabeçalho,
 * SD1+SB1 itens) para NFs lançadas (bot OU humano), EQS + BRATEC.
 *
 * Port de conferencia-notas-mercadoria/totvs_mercadoria_api.py sobre o client
 * compartilhado lib/impacto/totvs.ts (cookie + OAuth2 + genericQuery paginada).
 */
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
  doc: string, serie: string, fornec: string, loja: string
): Promise<BorderoInfo[]> {
  const out: BorderoInfo[] = [];
  const doc9 = String(doc || '').trim().padStart(9, '0');
  const serieT = String(serie || '').trim();
  for (const emp of Object.keys(EMPRESAS)) {
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
