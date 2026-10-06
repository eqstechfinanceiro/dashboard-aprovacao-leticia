/**
 * Regras de definição de TES — port fiel de conferencia-notas-mercadoria/tes_rules.py.
 * (F3 migra as tabelas de decisão pro Postgres; a lógica de avaliação fica aqui.)
 */

export const NATUREZA_CODIGO: Record<string, number> = {
  // CÓDIGO 0 - Padrão
  '2020067': 0, '2020085': 0, '2020047': 0, '2020049': 0, '2020055': 0,
  '2020045': 0, '2020006': 0, '2020041': 0, '2020048': 0, '2020042': 0,
  '2020046': 0, '2020030': 0, '2020031': 0, '2020074': 0, '2020019': 0,
  '2020040': 0, '2020056': 0, '2020075': 0, '2010016': 0,
  // CÓDIGO 1 - Importação
  '2010005': 1, '2020027': 1, '2020036': 1,
  // CÓDIGO 2 - EQS Especial
  '2050003': 2, '2050004': 2, '2050005': 2, '2050006': 2,
  '2050007': 2, '2050008': 2, '2050009': 2,
  // CÓDIGO 3
  '2050001': 3,
  // CÓDIGO 4
  '2040005': 4,
  // CÓDIGO 5
  '2020029': 5, '2020053': 5,
  // CÓDIGO 6 - Itens Especiais
  '2020018': 6, '2040001': 6, '2040003': 6, '2020101': 6,
  '2020103': 6, '2020105': 6, '2020034': 6,
  // CÓDIGO 7 - Bratec DIFAL
  '2020109': 7, '2020108': 7,
};

export const NATUREZA_REESCRITA: Record<string, string> = {
  '2020081': '2050006',
  '2020060': '2050004',
  '2020082': '2050008',
  '2020083': '2050008',
};

export const CENTROS_CUSTO_ESPECIAIS = new Set([
  '12010480001', '12010420001', '12010800001', '12010760001', '12010560001',
  '12010410001', '12010490001', '12010450001', '12010470001', '12010380001',
  '12010730001', '12010390001', '1210370001', '1201013', '12010400001',
  '11062040001', '12010790001',
]);

export const ITENS_ESPECIAIS = new Set([
  '0207000001', '1312000156', '999920091200', '999949011000', '1303102887',
  '1302578', '1303100449', '1303100601', '1303100602', '1303100603',
  '1312000122', '1312000124', '1312000125', '1312000126', '1312000144',
  '1308002', '1312024', '1303100550', '1303100600', '1303101290',
  '1303101291', '1303103835', '1303103836', '1303103837', '1312000141',
]);

export const CENTRO_USIMINAS = '22040230001';
export const NATUREZAS_USIMINAS = new Set(['2020109', '2020108']);
export const MAPA_USIMINAS: Record<string, string> = {
  '301': '301', '302': '302', '303': '303', '304': '304', '305': '305',
};

export const DIFAL_MAP: Record<string, string> = {
  '448': '438', '443': '433', '445': '435', '444': '434',
  '446': '436', '447': '437', '423': '473', '304': '302',
};

const ZERAR_ICMS_POR_CONTEXTO: Record<string, string[]> = {
  'Nenhum imposto': [],
  'Apenas o ICMSST': ['102', '405', '433', '408', '436', '406', '439', '421', '423', '438'],
  'Apenas o IPI': ['406', '439', '421', '438', '423', '102', '403', '434', '411', '437'],
  'Apenas ICMSST e IPI': ['406', '439', '421', '438', '423', '102', '411', '437'],
};

const ZERAR_ICMSST_POR_CONTEXTO: Record<string, string[]> = {
  'Nenhum imposto': ['406', '439', '421', '423', '438'],
  'Apenas o ICMS': ['406', '439', '421', '423', '438'],
  'Apenas o ICMSST': ['102', '405', '433', '408', '436', '406', '439', '421', '423', '438'],
};

const ZERAR_IPI_POR_CONTEXTO: Record<string, string[]> = {
  'Apenas o ICMS': ['406', '439', '421', '438', '423', '102', '403', '434', '411', '437'],
  'Apenas o ICMSST': ['406', '439', '421', '438', '423', '102', '403', '434', '411', '437'],
  'Apenas ICMS e ICMSST': ['406', '439', '421', '438', '423', '102', '411', '437'],
};

export interface TesInput {
  natureza: string;
  ctrl_imposto: string;
  empresa?: string;
  centro_custo?: string | null;
  produto?: string | null;
  cfop?: string | null;
  icms_aliq?: number | null;
  tes_atual?: string | null;
  presenca_comp?: string | null;
  cfop_xml?: string | null;
  icms_aliq_xml?: number | null;
}

export interface TesResult {
  tes: string;
  meta: {
    codigo: number | null;
    regra_aplicada: string | null;
    especial: boolean;
    difal: boolean;
    natureza_corrigida?: string;
    tes_original?: string;
  };
}

export function precisaZerarIcms(tes: string, ctrl: string): boolean {
  if (ctrl === 'Nenhum imposto') return true;
  return (ZERAR_ICMS_POR_CONTEXTO[ctrl] || []).includes(tes);
}

export function precisaZerarIcmsSt(tes: string, ctrl: string): boolean {
  return (ZERAR_ICMSST_POR_CONTEXTO[ctrl] || []).includes(tes);
}

export function precisaZerarIpi(tes: string, ctrl: string): boolean {
  return (ZERAR_IPI_POR_CONTEXTO[ctrl] || []).includes(tes);
}

function tesCodigo0(ctrl: string, empresa: string): string {
  if (empresa.toUpperCase() === 'EQS') {
    return ctrl === 'Nenhum imposto' ? '420' : '421';
  }
  return ctrl === 'Nenhum imposto' ? '420' : '448';
}

function tesCodigo1Bratec(ctrl: string): string {
  if (ctrl === 'Nenhum imposto') return '402';
  if (['Apenas ICMS e ICMSST', 'Apenas o ICMS', 'Apenas o ICMSST'].includes(ctrl)) return '443';
  if (ctrl === 'Todos os impostos') return '445';
  return '444';
}

function tesCodigo2Eqs(ctrl: string): string {
  if (!['Todos os impostos', 'Apenas ICMS e IPI', 'Apenas ICMSST e IPI', 'Apenas o IPI'].includes(ctrl)) {
    return '408';
  }
  return '411';
}

function tesCodigo2Bratec(ctrl: string): string {
  if (!['Todos os impostos', 'Apenas ICMS e IPI', 'Apenas ICMSST e IPI', 'Apenas o IPI'].includes(ctrl)) {
    return '446';
  }
  return '447';
}

function tesCodigo345(ctrl: string): string {
  if (ctrl === 'Nenhum imposto') return '402';
  if (['Apenas o ICMS', 'Apenas o ICMSST', 'Apenas ICMS e ICMSST'].includes(ctrl)) return '405';
  if (ctrl === 'Todos os impostos') return '407';
  return '403';
}

function tesCodigo4(ctrl: string): string {
  if (!['Todos os impostos', 'Apenas ICMS e IPI', 'Apenas ICMSST e IPI', 'Apenas o IPI'].includes(ctrl)) {
    return '102';
  }
  return '432';
}

function tesCodigo6(ctrl: string): string {
  return tesCodigo345(ctrl);
}

function tesCodigo6Bratec(ctrl: string): string {
  if (ctrl === 'Nenhum imposto') return '402';
  if (['Apenas ICMS e ICMSST', 'Apenas o ICMS', 'Apenas o ICMSST'].includes(ctrl)) return '443';
  if (ctrl === 'Todos os impostos') return '445';
  return '444';
}

function tesCodigo5Bratec(ctrl: string, tesAtual: string): string {
  if (tesAtual === '406' || tesAtual === '439') return '439';
  if (ctrl === 'Nenhum imposto') return '402';
  if (ctrl === 'Todos os impostos') return '445';
  if (['Apenas ICMS e ICMSST', 'Apenas o ICMS', 'Apenas o ICMSST'].includes(ctrl)) return '443';
  return '444';
}

function tesCodigo7Bratec(ctrl: string, tesAtual: string): string {
  if (!tesAtual || tesAtual === '303') return '303';
  if (ctrl === 'Nenhum imposto') return '301';
  if (['Apenas ICMS e ICMSST', 'Apenas o ICMS', 'Apenas o ICMSST'].includes(ctrl)) return '304';
  if (ctrl !== 'Nenhum imposto') return '305';
  return '303';
}

function aplicarDifal(tes: string, meta: TesResult['meta'], difal: boolean): string {
  if (!difal) return tes;
  const mapped = DIFAL_MAP[tes];
  if (mapped) {
    meta.regra_aplicada = `${meta.regra_aplicada}_difal`;
    meta.tes_original = tes;
    meta.especial = true;
    return mapped;
  }
  return tes;
}

function mapearTesPadrao(codigo: number, ctrl: string, empresa: string): string {
  switch (codigo) {
    case 0: return tesCodigo0(ctrl, empresa);
    case 1: return empresa.toUpperCase() === 'BRATEC' ? tesCodigo1Bratec(ctrl) : tesCodigo345(ctrl);
    case 2: return empresa.toUpperCase() === 'BRATEC' ? tesCodigo2Bratec(ctrl) : tesCodigo2Eqs(ctrl);
    case 3: return '423';
    case 4: return tesCodigo4(ctrl);
    case 5: return empresa.toUpperCase() === 'BRATEC' ? tesCodigo5Bratec(ctrl, '') : tesCodigo345(ctrl);
    case 6: return empresa.toUpperCase() === 'BRATEC' ? tesCodigo6Bratec(ctrl) : tesCodigo6(ctrl);
    case 7:
      if (empresa.toUpperCase() === 'BRATEC') return tesCodigo7Bratec(ctrl, '');
      return '';
    default: return '';
  }
}

export function definirTes(input: TesInput): TesResult {
  const empresa = (input.empresa || 'EQS').toUpperCase();
  const ctrl = input.ctrl_imposto;
  const meta: TesResult['meta'] = {
    codigo: null, regra_aplicada: null, especial: false, difal: false,
  };

  // 1. Reescrita de natureza
  const natureza = NATUREZA_REESCRITA[input.natureza] || input.natureza;
  if (natureza !== input.natureza) meta.natureza_corrigida = natureza;

  // 2. Código da natureza
  const codigo = NATUREZA_CODIGO[natureza] ?? 8;
  meta.codigo = codigo;

  // 3. Código 8 = não mapeada
  if (codigo === 8) {
    meta.regra_aplicada = 'natureza_nao_mapeada';
    return { tes: '', meta };
  }

  // 3.5 Flag DIFAL (Bratec): aliq 4/7/12 + CFOP iniciando em 6 + indPres fora de 1/5.
  const cfopDifal = input.cfop_xml || input.cfop || '';
  const aliqDifal = input.icms_aliq_xml ?? input.icms_aliq;
  const difal =
    empresa === 'BRATEC' &&
    aliqDifal != null && [4.0, 7.0, 12.0].includes(aliqDifal) &&
    !!cfopDifal && String(cfopDifal).trim().startsWith('6') &&
    (input.presenca_comp == null || !['1', '5'].includes(input.presenca_comp));
  meta.difal = difal;

  // 4. Regras especiais

  // 4.1 EQS Código 2
  if (codigo === 2 && empresa === 'EQS') {
    if (input.centro_custo && CENTROS_CUSTO_ESPECIAIS.has(input.centro_custo)) {
      meta.regra_aplicada = 'eqs_cod2_centro_especial_sem_tes';
      return { tes: '', meta };
    }
    if (!['Todos os impostos', 'Apenas ICMS e IPI', 'Apenas ICMSST e IPI', 'Apenas o IPI'].includes(ctrl)) {
      meta.regra_aplicada = 'eqs_cod2_nao_especial_sem_ipi';
      return { tes: '175', meta };
    }
    meta.regra_aplicada = 'eqs_cod2_nao_especial_com_ipi';
    return { tes: '176', meta };
  }

  // 4.3 Código 5 e 6 EQS: legado lê TES atual do grid
  const tesAtual = (input.tes_atual || '').trim();
  if ([5, 6].includes(codigo) && empresa === 'EQS') {
    if (!tesAtual) {
      meta.regra_aplicada = 'tes_vazio_no_siga';
      return { tes: '', meta };
    }
  }

  // 4.3.1 Código 5, 6 e 7 Bratec
  if ([5, 6, 7].includes(codigo) && empresa === 'BRATEC') {
    if (codigo === 5) {
      const tes = tesCodigo5Bratec(ctrl, tesAtual);
      meta.regra_aplicada = `bratec_cod5_${ctrl}`;
      return { tes: aplicarDifal(tes, meta, difal), meta };
    }
    if (codigo === 6) {
      if (tesAtual === '' || tesAtual === '439') {
        meta.regra_aplicada = 'cod6_bratec_padrao_439';
        return { tes: '439', meta };
      }
      if (input.produto && ITENS_ESPECIAIS.has(input.produto)) {
        if (ctrl === 'Nenhum imposto') {
          meta.regra_aplicada = 'cod6_bratec_item_especial_sem_imposto';
          return { tes: '420', meta };
        }
        meta.regra_aplicada = 'cod6_bratec_item_especial_com_imposto';
        return { tes: aplicarDifal('448', meta, difal), meta };
      }
      if (ctrl === 'Nenhum imposto') {
        meta.regra_aplicada = 'cod6_bratec_sem_imposto';
        return { tes: '402', meta };
      }
      if (['Apenas ICMS e ICMSST', 'Apenas o ICMS', 'Apenas o ICMSST'].includes(ctrl)) {
        meta.regra_aplicada = 'cod6_bratec_com_icms';
        return { tes: aplicarDifal('443', meta, difal), meta };
      }
      if (ctrl === 'Todos os impostos') {
        meta.regra_aplicada = 'cod6_bratec_todos';
        return { tes: aplicarDifal('445', meta, difal), meta };
      }
      meta.regra_aplicada = 'cod6_bratec_outros';
      return { tes: aplicarDifal('444', meta, difal), meta };
    }
    if (codigo === 7) {
      const tes = tesCodigo7Bratec(ctrl, tesAtual);
      meta.regra_aplicada = 'cod7_bratec';
      return { tes: aplicarDifal(tes, meta, difal), meta };
    }
  }

  // 4.4 Código 6 com itens especiais (apenas EQS)
  if (codigo === 6 && empresa === 'EQS' && input.produto && ITENS_ESPECIAIS.has(input.produto)) {
    meta.especial = true;
    if (ctrl === 'Nenhum imposto') {
      meta.regra_aplicada = 'cod6_item_especial_sem_imposto';
      return { tes: '420', meta };
    }
    meta.regra_aplicada = 'cod6_item_especial_com_imposto';
    return { tes: '421', meta };
  }

  // 4.5 Regra USIMINAS (apenas Bratec)
  if (
    empresa === 'BRATEC' &&
    input.centro_custo === CENTRO_USIMINAS &&
    NATUREZAS_USIMINAS.has(natureza)
  ) {
    const tesPadrao = mapearTesPadrao(codigo, ctrl, empresa);
    const tes = MAPA_USIMINAS[tesPadrao] || tesPadrao;
    if (tes !== tesPadrao) {
      meta.regra_aplicada = 'usiminas';
      meta.especial = true;
      meta.tes_original = tesPadrao;
      return { tes, meta };
    }
  }

  // 5. Mapeamento padrão
  const tesPadrao = mapearTesPadrao(codigo, ctrl, empresa);
  meta.regra_aplicada = `padrao_codigo_${codigo}`;

  // 6. DIFAL
  return { tes: aplicarDifal(tesPadrao, meta, difal), meta };
}
