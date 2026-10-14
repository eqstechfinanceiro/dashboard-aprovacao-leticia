/**
 * Comparator — port de conferencia-notas-mercadoria/comparator.py.
 * Compara NF do TOTVS (SF1/SD1) com XML NF-e parseado, campo a campo.
 *
 * Divergência deliberada do legado: lá `EMPRESA` era constante 'EQS' — regras
 * de TES EQS eram aplicadas também a notas BRATEC (falsas divergências).
 * Aqui a empresa vem do header (_empresa) e fica registrada em meta.empresa.
 */
import {
  definirTes, precisaZerarIcms, precisaZerarIcmsSt, precisaZerarIpi,
} from './tes-rules';
import { resolverTesOverride, type TesOverrideCfg } from './tes-override';
import type { NfeXml, NfeXmlItem } from './xml-parser';

export const TOLERANCE = 0.02;

export interface Check {
  field: string;
  expected: string;
  actual: string;
  match: boolean;
  missing_xml?: boolean;
}

export interface CompareResult {
  status: 'MATCH' | 'MISMATCH' | 'ERROR';
  header_checks: Check[];
  item_checks: Check[][];
  summary: string;
  mismatch_count: number;
  empresa: string;
  // true quando a ÚNICA divergência da nota é Origem CST (item) —
  // vira aviso/auto_ok_aviso em vez de pendente.
  cst_only: boolean;
}

const _toFloat = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(',', '.'));
  return isFinite(n) ? n : 0;
};

const _normStr = (v: any): string => (v === null || v === undefined ? '' : String(v).trim().toUpperCase());

const _normCnpj = (v: any): string => String(v ?? '').replace(/\D/g, '');

const _normDate = (v: any): string => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (s.includes('T') || s.includes('-')) return s.slice(0, 10);
  if (s.includes('/')) {
    const p = s.split('/');
    if (p.length === 3) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
  }
  if (s.length === 8 && /^\d+$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
};

const _cmpFloat = (a: number, b: number, tol = TOLERANCE) => Math.abs(a - b) <= tol;
const _cmpStr = (a: string, b: string) => _normStr(a) === _normStr(b);
const _cmpCnpj = (a: string, b: string) => { const x = _normCnpj(a), y = _normCnpj(b); return !!x && !!y && x === y; };
const _cmpDate = (a: string, b: string) => _normDate(a) === _normDate(b);

/** Deriva ctrl_imposto dos impostos do item XML (mesma tabela do Python). */
function deriveCtrlImposto(xmlItem: Partial<NfeXmlItem>): string {
  const hasIcms = _toFloat(xmlItem.v_icms) > 0;
  const hasSt = _toFloat(xmlItem.v_icms_st) > 0;
  const hasIpi = _toFloat(xmlItem.v_ipi) > 0;
  if (hasIcms && hasSt && hasIpi) return 'Todos os impostos';
  if (hasIcms && hasSt && !hasIpi) return 'Apenas ICMS e ICMSST';
  if (hasIcms && !hasSt && hasIpi) return 'Apenas ICMS e IPI';
  if (!hasIcms && hasSt && hasIpi) return 'Apenas ICMSST e IPI';
  if (hasIcms && !hasSt && !hasIpi) return 'Apenas o ICMS';
  if (!hasIcms && hasSt && !hasIpi) return 'Apenas o ICMSST';
  if (!hasIcms && !hasSt && hasIpi) return 'Apenas o IPI';
  return 'Nenhum imposto';
}

export function compareNf(
  totvsHeader: Record<string, any>,
  totvsItems: Record<string, any>[],
  xmlData: NfeXml,
  tesOverride?: TesOverrideCfg,
): CompareResult {
  const empresa = _normStr(totvsHeader._empresa) || 'EQS';
  const headerChecks: Check[] = [];
  const itemChecks: Check[][] = [];
  let hasMismatch = false;
  const chk = (field: string, expected: any, actual: any, match: boolean) => {
    headerChecks.push({ field, expected: String(expected ?? ''), actual: String(actual ?? ''), match });
    if (!match) hasMismatch = true;
  };
  const info = (field: string, expected: any, actual: any) => {
    headerChecks.push({ field, expected: String(expected ?? ''), actual: String(actual ?? ''), match: true });
  };

  // ── Cabeçalho ────────────────────────────────────────────────────────
  const totvsDoc = _normStr(totvsHeader.f1_doc);
  const xmlDoc = _normStr(xmlData.numero);
  let docMatch: boolean;
  try {
    docMatch = totvsDoc && xmlDoc ? parseInt(totvsDoc, 10) === parseInt(xmlDoc, 10) : _cmpStr(totvsDoc, xmlDoc);
    if (isNaN(parseInt(totvsDoc, 10)) || isNaN(parseInt(xmlDoc, 10))) docMatch = _cmpStr(totvsDoc, xmlDoc);
  } catch {
    docMatch = _cmpStr(totvsDoc, xmlDoc);
  }
  chk('Documento', totvsDoc, xmlDoc, docMatch);

  chk('Série', _normStr(totvsHeader.f1_serie), _normStr(xmlData.serie),
    _cmpStr(totvsHeader.f1_serie, xmlData.serie));

  const totvsChave = String(totvsHeader.f1_chvnfe || '').trim();
  const xmlChave = (xmlData.chave || '').trim();
  chk('Chave NFe', totvsChave, xmlChave, !!(totvsChave && xmlChave && totvsChave === xmlChave));

  chk('Dt. Emissão', _normDate(totvsHeader.f1_emissao), _normDate(xmlData.emissao),
    _cmpDate(totvsHeader.f1_emissao || '', xmlData.emissao));

  chk('CNPJ Fornecedor', _normCnpj(totvsHeader.a2_cgc), _normCnpj(xmlData.emit_cnpj),
    _cmpCnpj(totvsHeader.a2_cgc || '', xmlData.emit_cnpj));

  // Nome fornecedor — informativo (TOTVS trunca)
  info('Nome Fornecedor', _normStr(totvsHeader.a2_nome), _normStr(xmlData.emit_nome));

  const totvsValbrut = _toFloat(totvsHeader.f1_valbrut);
  const xmlVnf = xmlData.total?.vNF ?? 0;
  const valbrutMatch = Math.abs(totvsValbrut - xmlVnf) <= 0.05;
  chk('Valor Total', totvsValbrut.toFixed(2), xmlVnf.toFixed(2), valbrutMatch);

  // ICMS/IPI total — informativos (TOTVS zera por regra de TES)
  info('Vlr. ICMS', _toFloat(totvsHeader.f1_valicms).toFixed(2), (xmlData.total?.vICMS ?? 0).toFixed(2));
  info('Vlr. IPI', _toFloat(totvsHeader.f1_valipi).toFixed(2), (xmlData.total?.vIPI ?? 0).toFixed(2));

  // ICMS-ST — valida por TES do primeiro item.
  // O SF1 guarda o ST retido em F1_ICMSRET (F1_ICMST não existe na base) —
  // ler só ICMST reportava "lançado zerado" em nota com ST (falso divergente).
  const totvsIcmst = _toFloat(totvsHeader.f1_icmst) || _toFloat(totvsHeader.f1_icmsret);
  const xmlIcmst = xmlData.total?.vST ?? 0;
  let icmstMatch: boolean;
  if (totvsItems.length && xmlData.items.length) {
    const firstTes = String(totvsItems[0].d1_tes || '').trim();
    const firstCtrl = deriveCtrlImposto(xmlData.items[0]);
    icmstMatch = precisaZerarIcmsSt(firstTes, firstCtrl)
      ? totvsIcmst === 0
      : _cmpFloat(totvsIcmst, xmlIcmst);
  } else {
    icmstMatch = _cmpFloat(totvsIcmst, xmlIcmst);
  }
  chk('Vlr. ICMS-ST', totvsIcmst.toFixed(2), xmlIcmst.toFixed(2), icmstMatch);

  info('Descontos', _toFloat(totvsHeader.f1_descont).toFixed(2), (xmlData.total?.vDesc ?? 0).toFixed(2));
  info('Vlr. Produtos', 'N/A', (xmlData.total?.vProd ?? 0).toFixed(2));

  const itemCountMatch = totvsItems.length === xmlData.items.length;
  chk('Qtd. Itens', String(totvsItems.length), String(xmlData.items.length),
    valbrutMatch ? true : itemCountMatch);

  // ── Itens (greedy match por total, pontuado por qtd+vunit) ───────────
  const xmlItems = xmlData.items || [];
  const xmlMatched = new Array(xmlItems.length).fill(false);

  for (let ti = 0; ti < totvsItems.length; ti++) {
    const totvsItem = totvsItems[ti];
    const list: Check[] = [];

    let bestXi: number | null = null;
    let bestScore = -1;
    for (let xi = 0; xi < xmlItems.length; xi++) {
      if (xmlMatched[xi]) continue;
      const xt = xmlItems[xi].v_prod;
      if (!_cmpFloat(_toFloat(totvsItem.d1_total), xt)) continue;
      let score = 0;
      if (_cmpFloat(_toFloat(totvsItem.d1_quant), xmlItems[xi].q_com)) score++;
      if (_cmpFloat(_toFloat(totvsItem.d1_vunit), xmlItems[xi].v_un_com)) score++;
      if (score > bestScore) { bestScore = score; bestXi = xi; }
    }

    let xmlItem: NfeXmlItem | Record<string, never>;
    if (bestXi !== null) {
      xmlMatched[bestXi] = true;
      xmlItem = xmlItems[bestXi];
    } else {
      xmlItem = {};
    }
    const noXml = bestXi === null;

    const pfx = `Item ${_normStr(totvsItem.d1_cod) || _normStr((xmlItem as NfeXmlItem).c_prod) || ti + 1} · `;
    const itemChk = (field: string, expected: any, actual: any, match: boolean) => {
      list.push({ field: pfx + field, expected: String(expected ?? ''), actual: String(actual ?? ''), match, missing_xml: noXml });
      if (!match) hasMismatch = true;
    };
    const itemInfo = (field: string, expected: any, actual: any) => {
      list.push({ field: pfx + field, expected: String(expected ?? ''), actual: String(actual ?? ''), match: true, missing_xml: noXml });
    };

    itemInfo('Produto', _normStr(totvsItem.d1_cod), _normStr((xmlItem as NfeXmlItem).c_prod));

    const totvsTotal = _toFloat(totvsItem.d1_total);
    const totalMatch = bestXi !== null ? _cmpFloat(totvsTotal, (xmlItem as NfeXmlItem).v_prod) : false;
    itemChk('Vlr. Total Item', totvsTotal.toFixed(2),
      bestXi !== null ? (xmlItem as NfeXmlItem).v_prod.toFixed(2) : '—',
      valbrutMatch ? true : totalMatch);

    const totvsQtd = _toFloat(totvsItem.d1_quant);
    const qtdMatch = bestXi !== null ? _cmpFloat(totvsQtd, (xmlItem as NfeXmlItem).q_com) : false;
    itemChk('Quantidade', totvsQtd.toFixed(4),
      bestXi !== null ? (xmlItem as NfeXmlItem).q_com.toFixed(4) : '—',
      (totalMatch || valbrutMatch) ? true : qtdMatch);

    const totvsVunit = _toFloat(totvsItem.d1_vunit);
    const vunitMatch = bestXi !== null ? _cmpFloat(totvsVunit, (xmlItem as NfeXmlItem).v_un_com) : false;
    itemChk('Vlr. Unitário', totvsVunit.toFixed(4),
      bestXi !== null ? (xmlItem as NfeXmlItem).v_un_com.toFixed(4) : '—',
      (totalMatch || valbrutMatch) ? true : vunitMatch);

    // TES via regras Lince — empresa vem do header (corrige bug EQS-fixo do legado)
    const totvsTes = String(totvsItem.d1_tes || '').trim();
    const natureza = String(totvsHeader.f1_naturez || '').trim();
    const ctrlImposto = bestXi !== null ? deriveCtrlImposto(xmlItem as NfeXmlItem) : '';
    let expectedTes = '';
    let tesMatch = true;
    if (bestXi !== null && natureza) {
      const xi = xmlItem as NfeXmlItem;
      const r = definirTes({
        natureza,
        ctrl_imposto: ctrlImposto,
        empresa,
        produto: String(totvsItem.d1_cod || '').trim() || null,
        cfop: String(totvsItem.d1_cf || '').trim() || null,
        tes_atual: totvsTes,
        presenca_comp: xmlData.ind_pres || null,
        cfop_xml: String(xi.cfop || '').trim() || null,
        icms_aliq_xml: xi.p_icms || null,
      });
      expectedTes = r.tes;
      // Parametrização lince_tes_regras — o bot aplica esse override depois de
      // definir_tes (cred ICMS: fornecedor+produto+TES nas listas do banco).
      // Sem isso a conferência esperava a TES padrão e falhava nos dois
      // sentidos: override certo virava divergência, override faltando virava match.
      if (tesOverride && expectedTes) {
        const ov = resolverTesOverride(
          tesOverride,
          xmlData.emit_cnpj || totvsHeader.a2_cgc,
          [totvsItem.d1_cod, (xmlItem as NfeXmlItem).c_prod],
          expectedTes,
        );
        if (ov.tes) expectedTes = ov.tes;
      }
      tesMatch = expectedTes ? expectedTes === totvsTes : true;
    }
    itemChk('TES', expectedTes || totvsTes, totvsTes, tesMatch);

    // ICMS item — valida regra zerar
    const totvsIcmsItem = _toFloat(totvsItem.d1_valicms);
    const xmlIcmsItem = bestXi !== null ? (xmlItem as NfeXmlItem).v_icms : 0;
    const icmsItemMatch = bestXi !== null && totvsTes && precisaZerarIcms(totvsTes, ctrlImposto)
      ? totvsIcmsItem === 0
      : bestXi !== null ? _cmpFloat(totvsIcmsItem, xmlIcmsItem) : false;
    itemChk('ICMS Item', totvsIcmsItem.toFixed(2),
      bestXi !== null ? xmlIcmsItem.toFixed(2) : '—',
      valbrutMatch ? true : icmsItemMatch);

    // IPI item — valida regra zerar
    const totvsIpiItem = _toFloat(totvsItem.d1_valipi);
    const xmlIpiItem = bestXi !== null ? (xmlItem as NfeXmlItem).v_ipi : 0;
    const ipiItemMatch = bestXi !== null && totvsTes && precisaZerarIpi(totvsTes, ctrlImposto)
      ? totvsIpiItem === 0
      : bestXi !== null ? _cmpFloat(totvsIpiItem, xmlIpiItem) : false;
    itemChk('IPI Item', totvsIpiItem.toFixed(2),
      bestXi !== null ? xmlIpiItem.toFixed(2) : '—',
      valbrutMatch ? true : ipiItemMatch);

    // CFOP — informativo
    itemInfo('CFOP', _normStr(totvsItem.d1_cf),
      bestXi !== null ? _normStr((xmlItem as NfeXmlItem).cfop) : '—');

    // Origem CST — TOTVS D1_CLASFIS × XML orig+CST
    const totvsClasfis = String(totvsItem.d1_clasfis || '').replace(/\D/g, '').padStart(3, '0').slice(-3);
    let xmlCstFull = '';
    if (bestXi !== null) {
      const xi = xmlItem as NfeXmlItem;
      const xo = String(xi.orig || '').trim();
      const xc = String(xi.cst || '').trim();
      xmlCstFull = (xo + xc.padStart(2, '0')) || '';
      if (!xo && !xc) xmlCstFull = '';
    }
    if (totvsClasfis && xmlCstFull) {
      itemChk('Origem CST', totvsClasfis, xmlCstFull, totvsClasfis === xmlCstFull);
    } else {
      itemInfo('Origem CST', totvsClasfis || '—', xmlCstFull || '—');
    }

    itemChecks.push(list);
  }

  // Itens do XML sem par no TOTVS — informativos quando NF total bate
  for (let xi = 0; xi < xmlItems.length; xi++) {
    if (xmlMatched[xi]) continue;
    const xi2 = xmlItems[xi];
    const m2 = valbrutMatch;
    const pfx = `Item ${_normStr(xi2.c_prod) || xi + 1} · `;
    const list: Check[] = [
      { field: pfx + 'Produto', expected: '—', actual: _normStr(xi2.c_prod), match: m2 },
      { field: pfx + 'Quantidade', expected: '—', actual: xi2.q_com.toFixed(4), match: m2 },
      { field: pfx + 'Vlr. Unitário', expected: '—', actual: xi2.v_un_com.toFixed(4), match: m2 },
      { field: pfx + 'Vlr. Total Item', expected: '—', actual: xi2.v_prod.toFixed(2), match: m2 },
      { field: pfx + 'TES', expected: '—', actual: '—', match: m2 },
      { field: pfx + 'ICMS Item', expected: '—', actual: xi2.v_icms.toFixed(2), match: m2 },
      { field: pfx + 'IPI Item', expected: '—', actual: xi2.v_ipi.toFixed(2), match: m2 },
      { field: pfx + 'CFOP', expected: '—', actual: _normStr(xi2.cfop), match: true },
    ];
    if (!m2) hasMismatch = true;
    itemChecks.push(list);
  }

  const allChecks = [...headerChecks, ...itemChecks.flat()];
  const mismatchCount = allChecks.filter((c) => !c.match).length;
  const status = mismatchCount === 0 ? 'MATCH' : 'MISMATCH';
  const falhas = allChecks.filter((c) => !c.match);
  const cstOnly = falhas.length > 0 &&
    falhas.every((c) => (c.field.split('·').pop() || c.field).trim() === 'Origem CST');
  return {
    status,
    header_checks: headerChecks,
    item_checks: itemChecks,
    summary: cstOnly
      ? `${mismatchCount} divergência(s) apenas de Origem CST (aviso)`
      : mismatchCount === 0 ? 'Tudo conferiu' : `${mismatchCount} divergência(s)`,
    mismatch_count: mismatchCount,
    empresa,
    cst_only: cstOnly,
  };
}
