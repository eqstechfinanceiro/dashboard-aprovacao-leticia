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
import type { Se2Parcela } from './totvs';

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

/** Deriva ctrl_imposto dos impostos do item XML (mesma tabela do Python).
 * Paridade com documento_entrada_handler._determinar_tipo do Lince: imposto
 * conta quando o VALOR **ou a BASE** é > 0 — CST 051/70 e afins têm base sem
 * valor destacado e antes caíam em 'Nenhum imposto' (TES esperada errada). */
function deriveCtrlImposto(xmlItem: Partial<NfeXmlItem>): string {
  const hasIcms = _toFloat(xmlItem.v_icms) > 0 || _toFloat(xmlItem.v_bc_icms) > 0;
  const hasSt = _toFloat(xmlItem.v_icms_st) > 0 || _toFloat(xmlItem.v_bc_icms_st) > 0;
  const hasIpi = _toFloat(xmlItem.v_ipi) > 0 || _toFloat(xmlItem.v_bc_ipi) > 0;
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
  extras?: { se2Parcelas?: Se2Parcela[] },
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

  // valbrut só mascara qtd quando HÁ itens no TOTVS (fracionamento). Nota de
  // mercadoria com ZERO linhas SD1 é lançamento quebrado/incompleto — diverge
  // mesmo com o total batendo. Com SD1 vazia a falha mora em 'Itens no TOTVS'
  // (abaixo): 'Qtd. Itens' vira informativo pra não contar a mesma causa 2x.
  const semItensTotvs = totvsItems.length === 0 && xmlData.items.length > 0;
  const itemCountMatch = totvsItems.length === xmlData.items.length;
  chk('Qtd. Itens', String(totvsItems.length), String(xmlData.items.length),
    semItensTotvs || (valbrutMatch && totvsItems.length > 0) ? true : itemCountMatch);

  // Quando a NF fraciona itens (1 XML → N SD1) o total da NF bate mas nenhum
  // item casa 1:1 — aí o valbrut "amortece" checks de item. Quando a qtd de
  // itens bate, divergência de item é real e NÃO pode ser mascarada.
  const valbrutMask = valbrutMatch && !itemCountMatch && totvsItems.length > 0;

  // ── Itens — fase 1: par 1:1 greedy por total (desempate qtd+vunit) ────
  const xmlItems = xmlData.items || [];
  const xmlMatched = new Array(xmlItems.length).fill(false);
  const matchXi: (number | null)[] = new Array(totvsItems.length).fill(null);
  for (let ti = 0; ti < totvsItems.length; ti++) {
    const totvsItem = totvsItems[ti];
    let bestXi: number | null = null;
    let bestScore = -1;
    for (let xi = 0; xi < xmlItems.length; xi++) {
      if (xmlMatched[xi]) continue;
      if (!_cmpFloat(_toFloat(totvsItem.d1_total), xmlItems[xi].v_prod)) continue;
      let score = 0;
      if (_cmpFloat(_toFloat(totvsItem.d1_quant), xmlItems[xi].q_com)) score++;
      if (_cmpFloat(_toFloat(totvsItem.d1_vunit), xmlItems[xi].v_un_com)) score++;
      if (score > bestScore) { bestScore = score; bestXi = xi; }
    }
    if (bestXi !== null) { xmlMatched[bestXi] = true; matchXi[ti] = bestXi; }
  }

  // ── Fase 2: fracionamento — N linhas SD1 do mesmo produto cuja Σ fecha
  // no v_prod de UM item XML sem par. Todas as linhas do grupo casam com
  // esse item (checks somados); sem o grupo cada linha divergia sozinha.
  const fracionado = new Map<number, { xi: number; idxs: number[] }>();
  {
    const porProd = new Map<string, number[]>();
    for (let i = 0; i < totvsItems.length; i++) {
      if (matchXi[i] !== null) continue;
      const k = _normStr(totvsItems[i].d1_cod);
      const g = porProd.get(k) || [];
      g.push(i);
      porProd.set(k, g);
    }
    for (const idxs of porProd.values()) {
      if (idxs.length < 2) continue;
      const soma = idxs.reduce((s, i) => s + _toFloat(totvsItems[i].d1_total), 0);
      for (let xi = 0; xi < xmlItems.length; xi++) {
        if (xmlMatched[xi]) continue;
        if (!_cmpFloat(soma, xmlItems[xi].v_prod)) continue;
        xmlMatched[xi] = true;
        for (const i of idxs) fracionado.set(i, { xi, idxs });
        break;
      }
    }
  }

  for (let ti = 0; ti < totvsItems.length; ti++) {
    const totvsItem = totvsItems[ti];
    const list: Check[] = [];

    const frac = fracionado.get(ti) || null;
    const bestXi = matchXi[ti] !== null ? matchXi[ti] : (frac ? frac.xi : null);
    const xmlItem: NfeXmlItem | Record<string, never> = bestXi !== null ? xmlItems[bestXi as number] : {};
    const noXml = bestXi === null;

    // Agregados do grupo fracionado (ou do item sozinho quando não é).
    const grp = frac ? frac.idxs.map((i) => totvsItems[i]) : [totvsItem];
    const sum = (k: string) => grp.reduce((s, t) => s + _toFloat(t[k]), 0);

    const pfx = `Item ${_normStr(totvsItem.d1_cod) || _normStr((xmlItem as NfeXmlItem).c_prod) || ti + 1} · `;
    const itemChk = (field: string, expected: any, actual: any, match: boolean) => {
      list.push({ field: pfx + field, expected: String(expected ?? ''), actual: String(actual ?? ''), match, missing_xml: noXml });
      if (!match) hasMismatch = true;
    };
    const itemInfo = (field: string, expected: any, actual: any) => {
      list.push({ field: pfx + field, expected: String(expected ?? ''), actual: String(actual ?? ''), match: true, missing_xml: noXml });
    };

    itemInfo('Produto', _normStr(totvsItem.d1_cod), _normStr((xmlItem as NfeXmlItem).c_prod));
    if (frac) {
      itemInfo('Fracionado', `${frac.idxs.length} linhas SD1`, `itens ${frac.idxs.map((i) => _normStr(totvsItems[i].d1_item) || i + 1).join('+')}`);
    }

    const totvsTotal = sum('d1_total');
    const totalMatch = bestXi !== null ? _cmpFloat(totvsTotal, (xmlItem as NfeXmlItem).v_prod) : false;
    itemChk('Vlr. Total Item', totvsTotal.toFixed(2),
      bestXi !== null ? (xmlItem as NfeXmlItem).v_prod.toFixed(2) : '—',
      valbrutMask ? true : totalMatch);

    const totvsQtd = sum('d1_quant');
    const qtdMatch = bestXi !== null ? _cmpFloat(totvsQtd, (xmlItem as NfeXmlItem).q_com) : false;
    itemChk('Quantidade', totvsQtd.toFixed(4),
      bestXi !== null ? (xmlItem as NfeXmlItem).q_com.toFixed(4) : '—',
      (totalMatch || valbrutMask) ? true : qtdMatch);

    const totvsVunit = totvsQtd ? totvsTotal / totvsQtd : sum('d1_vunit');
    const vunitMatch = bestXi !== null ? _cmpFloat(totvsVunit, (xmlItem as NfeXmlItem).v_un_com) : false;
    itemChk('Vlr. Unitário', totvsVunit.toFixed(4),
      bestXi !== null ? (xmlItem as NfeXmlItem).v_un_com.toFixed(4) : '—',
      (totalMatch || valbrutMask) ? true : vunitMatch);

    // TES via regras Lince — empresa vem do header (corrige bug EQS-fixo do legado)
    const totvsTes = String(totvsItem.d1_tes || '').trim();
    const natureza = String(totvsHeader.f1_naturez || '').trim();
    const ctrlImposto = bestXi !== null ? deriveCtrlImposto(xmlItem as NfeXmlItem) : '';
    let expectedTes = '';
    let tesMatch = true;
    let tesRegra: string | null = null;
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
      tesRegra = r.meta?.regra_aplicada || null;
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
    // "Não verificável" ≠ match: a regra não consegue decidir a TES esperada
    // (natureza cód.8, CC especial sem TES, tes_vazio_no_siga). Informativo —
    // sai do silêncio sem criar fila sem dono.
    if (bestXi !== null && natureza && !expectedTes) {
      itemInfo('Não verificável', tesRegra || '—', totvsTes || '—');
    }

    const zerarIcms = !!totvsTes && precisaZerarIcms(totvsTes, ctrlImposto);
    const zerarIpi = !!totvsTes && precisaZerarIpi(totvsTes, ctrlImposto);
    const zerarSt = !!totvsTes && precisaZerarIcmsSt(totvsTes, ctrlImposto);

    // ICMS item — D1_VALICMS nunca é gravada neste ambiente: a SF4 das TES
    // zera o campo na gravação (0 linhas >0 em set–out/2026; a prova real do
    // imposto são Base ICMS + Aliq ICMS abaixo). Aceita 0 ou o valor do XML
    // (se alguma TES contabilizar); um terceiro valor é divergência real.
    const totvsIcmsItem = sum('d1_valicms');
    const xmlIcmsItem = bestXi !== null ? (xmlItem as NfeXmlItem).v_icms : 0;
    const icmsItemMatch = bestXi !== null &&
      (totvsIcmsItem === 0 || _cmpFloat(totvsIcmsItem, xmlIcmsItem));
    itemChk('ICMS Item', '0.00', totvsIcmsItem.toFixed(2),
      valbrutMask ? true : icmsItemMatch);

    // IPI item — valida regra zerar
    const totvsIpiItem = sum('d1_valipi');
    const xmlIpiItem = bestXi !== null ? (xmlItem as NfeXmlItem).v_ipi : 0;
    const ipiItemMatch = bestXi !== null && zerarIpi
      ? totvsIpiItem === 0 || _cmpFloat(totvsIpiItem, xmlIpiItem)
      : bestXi !== null ? _cmpFloat(totvsIpiItem, xmlIpiItem) : false;
    itemChk('IPI Item', (zerarIpi ? 0 : xmlIpiItem).toFixed(2),
      totvsIpiItem.toFixed(2),
      valbrutMask ? true : ipiItemMatch);

    // ── Campos que o Lince escreve e ninguém conferia ────────────────────
    // Alíquotas/bases/impostos-a-mais por item. Contexto "zerar": a SF4 às
    // vezes conserva base/aliq residuais (TES 421 grava picm em ~12% das
    // notas) — aceita 0 OU o valor do XML; um terceiro valor diverge.
    if (bestXi !== null) {
      const xi = xmlItem as NfeXmlItem;
      const campo = (field: string, xmlV: number, d1V: number, zerar: boolean) => {
        const ok = zerar ? (d1V === 0 || _cmpFloat(d1V, xmlV)) : _cmpFloat(d1V, xmlV);
        itemChk(field, (zerar ? 0 : xmlV).toFixed(2), d1V.toFixed(2),
          valbrutMask ? true : ok);
      };
      campo('Aliq ICMS', xi.p_icms, _toFloat(totvsItem.d1_picm), zerarIcms);
      campo('Base ICMS', xi.v_bc_icms, sum('d1_baseicm'), zerarIcms);
      campo('Aliq IPI', xi.p_ipi, _toFloat(totvsItem.d1_ipi), zerarIpi);
      campo('Base IPI', xi.v_bc_ipi, sum('d1_baseipi'), zerarIpi);
      campo('ST Item', xi.v_icms_st, sum('d1_icmsret'), zerarSt);
      campo('Base ST', xi.v_bc_icms_st, sum('d1_bricms'), zerarSt);
      campo('Desconto', xi.v_desc, sum('d1_valdesc'), false);
      campo('Frete', xi.v_frete, sum('d1_valfre'), false);
      campo('Seguro', xi.v_seg, sum('d1_seguro'), false);
      campo('Despesa', xi.v_outro, sum('d1_despesa'), false);
    }

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

  // Itens do XML sem par no TOTVS — informativos quando NF total bate.
  // SD1 completamente vazia = leitura durante o lançamento ou lançamento
  // quebrado: a divergência é UMA ('Itens no TOTVS'), não N por campo. Os
  // valores do XML ficam informativos e a TES que a regra Lince espera
  // aparece pro revisor conferir o lançamento quando ele terminar.
  if (semItensTotvs) {
    itemChecks.push([{
      field: 'Itens no TOTVS',
      expected: `${xmlItems.length} item(ns) no XML`,
      actual: '0 lançados — possível leitura durante o lançamento',
      match: false,
    }]);
    hasMismatch = true;
  }
  for (let xi = 0; xi < xmlItems.length; xi++) {
    if (xmlMatched[xi]) continue;
    const xi2 = xmlItems[xi];
    const m2 = semItensTotvs || valbrutMask;
    const pfx = `Item ${_normStr(xi2.c_prod) || xi + 1} · `;
    const list: Check[] = [
      { field: pfx + 'Produto', expected: '—', actual: _normStr(xi2.c_prod), match: m2 },
      { field: pfx + 'Quantidade', expected: '—', actual: xi2.q_com.toFixed(4), match: m2 },
      { field: pfx + 'Vlr. Unitário', expected: '—', actual: xi2.v_un_com.toFixed(4), match: m2 },
      { field: pfx + 'Vlr. Total Item', expected: '—', actual: xi2.v_prod.toFixed(2), match: m2 },
      { field: pfx + 'ICMS Item', expected: '—', actual: xi2.v_icms.toFixed(2), match: m2 },
      { field: pfx + 'IPI Item', expected: '—', actual: xi2.v_ipi.toFixed(2), match: m2 },
      { field: pfx + 'CFOP', expected: '—', actual: _normStr(xi2.cfop), match: true },
    ];
    if (!semItensTotvs) {
      list.splice(4, 0, { field: pfx + 'TES', expected: '—', actual: '—', match: m2 });
    } else {
      const natureza = String(totvsHeader.f1_naturez || '').trim();
      if (natureza) {
        const r = definirTes({
          natureza,
          ctrl_imposto: deriveCtrlImposto(xi2),
          empresa,
          produto: _normStr(xi2.c_prod) || null,
          cfop: _normStr(xi2.cfop) || null,
          presenca_comp: xmlData.ind_pres || null,
          cfop_xml: _normStr(xi2.cfop) || null,
          icms_aliq_xml: xi2.p_icms || null,
        });
        let tesEsp = r.tes;
        if (tesOverride && tesEsp) {
          const ov = resolverTesOverride(tesOverride,
            xmlData.emit_cnpj || totvsHeader.a2_cgc, [_normStr(xi2.c_prod)], tesEsp);
          if (ov.tes) tesEsp = ov.tes;
        }
        list.push({
          field: pfx + 'TES esperada (regra)',
          expected: '—',
          actual: tesEsp || r.meta?.regra_aplicada || 'não determinável',
          match: true,
        });
      }
    }
    if (!m2) hasMismatch = true;
    itemChecks.push(list);
  }

  // ── Duplicatas (SE2 parcelas × XML cobr.dup) ─────────────────────────
  // O Lince gera as parcelas no SE2 a partir do XML — qtd e valor têm que
  // bater (hard); vencimento é informativo (cond. pagto pode mudar
  // legitimamente) e natureza é conferida só em nível informativo.
  const se2Parcelas = extras?.se2Parcelas || [];
  const xmlDups = xmlData.dups || [];
  if (se2Parcelas.length || xmlDups.length) {
    const uniq = new Map<string, Se2Parcela>();
    for (const p of se2Parcelas) {
      const k = `${p.parcela}|${p.valor.toFixed(2)}|${p.vencto || ''}`;
      if (!uniq.has(k)) uniq.set(k, p);
    }
    const parcelas = [...uniq.values()].sort(
      (a, b) => a.parcela.localeCompare(b.parcela, 'pt-BR', { numeric: true }) || String(a.vencto).localeCompare(String(b.vencto))
    );
    const dups = [...xmlDups].sort((a, b) => String(a.d_venc).localeCompare(String(b.d_venc)));

    if (dups.length) {
      chk('Qtd. parcelas', String(dups.length), String(parcelas.length), dups.length === parcelas.length);
      const n = Math.max(dups.length, parcelas.length);
      for (let i = 0; i < n; i++) {
        const xd = dups[i];
        const sp = parcelas[i];
        const label = `Parcela ${i + 1}`;
        if (!sp) {
          chk(`${label} Vlr.`, xd.v_dup.toFixed(2), '—', false);
          continue;
        }
        if (!xd) {
          chk(`${label} Vlr.`, '—', sp.valor.toFixed(2), false);
          continue;
        }
        chk(`${label} Vlr.`, xd.v_dup.toFixed(2), sp.valor.toFixed(2), _cmpFloat(xd.v_dup, sp.valor, 0.02));
        // Vencimento: warning-only — informativo mesmo quando diverge.
        const dv = _normDate(xd.d_venc);
        const sv = _normDate(sp.vencto || '');
        headerChecks.push({ field: `${label} Vencimento`, expected: dv, actual: sv || '—', match: true });
      }
    } else {
      info('Qtd. parcelas', '— (XML sem cobr)', String(parcelas.length));
    }
    const natDom = parcelas.length ? parcelas[0].natureza : '';
    if (natDom) info('Natureza título', _normStr(totvsHeader.f1_naturez), _normStr(natDom));
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
    summary: semItensTotvs
      ? `0 itens lançados no TOTVS — possível leitura durante o lançamento`
      : cstOnly
      ? `${mismatchCount} divergência(s) apenas de Origem CST (aviso)`
      : mismatchCount === 0 ? 'Tudo conferiu' : `${mismatchCount} divergência(s)`,
    mismatch_count: mismatchCount,
    empresa,
    cst_only: cstOnly,
  };
}
