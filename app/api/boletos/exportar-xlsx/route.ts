import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx-js-style';
import { sql } from '@/lib/db/neon';
import { ensureBoletosTables } from '@/lib/boletos/totvs';
import { logAudit } from '@/lib/db/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/boletos/exportar-xlsx — mesmos filtros do GET /api/boletos
// (empresas, flags, status, q, so_flags). Planilha formatada no padrão Aery.

const FLAG_LABEL: Record<string, string> = {
  valor_divergente: 'Valor divergente',
  vencimento_divergente: 'Vencimento divergente',
  dv_geral_invalido: 'DV geral inválido',
  dv_campo_invalido: 'DV de campo inválido',
  lindig_diverge_codbar: 'Linha × código divergem',
  formato_invalido: 'Formato inválido',
  codbar_duplicado: 'Código duplicado',
  lado_ausente: 'Lado ausente',
};

const csv = (v: string | null) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
const esc = (s: string) => s.replace(/'/g, "''");

export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco de dados não disponível' }, { status: 503 });
  await ensureBoletosTables();

  const p = request.nextUrl.searchParams;
  const empresas = csv(p.get('empresas')).map((e) => e.toUpperCase()).filter((e) => e === 'EQS' || e === 'BRATEC');
  const flagTipos = csv(p.get('flags'));
  const status = p.get('status') || '';
  const busca = (p.get('q') || '').trim();
  const soComFlags = p.get('so_flags') !== '0';
  const limit = Math.min(parseInt(p.get('limit') || '5000', 10) || 5000, 20000);

  const conds: string[] = [];
  if (soComFlags) conds.push('flag_count > 0');
  if (empresas.length) conds.push(`empresa IN (${empresas.map((e) => `'${esc(e)}'`).join(',')})`);
  if (status === 'aberto') conds.push('baixa IS NULL');
  if (status === 'baixado') conds.push('baixa IS NOT NULL');
  if (flagTipos.length) {
    conds.push(`EXISTS (SELECT 1 FROM jsonb_array_elements(flags) f WHERE f->>'tipo' IN (${flagTipos.map((f) => `'${esc(f)}'`).join(',')}))`);
  }
  if (busca) {
    const b = esc(busca);
    conds.push(`(num ILIKE '%${b}%' OR fornecedor ILIKE '%${b}%' OR fornecedor_nome ILIKE '%${b}%' OR lindig ILIKE '%${b}%')`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const [titulos, resumoFlags] = await Promise.all([
    sql.query(
      `SELECT id, empresa, filial, prefixo, num, parcela, tipo, natureza, natureza_desc,
              fornecedor, fornecedor_nome, emissao, vencto, vencto_real, baixa, dt_digit,
              valor, acresc, multa, juros, saldo, codbar, lindig, portado, bco_pgto,
              historico, origem, flags, flag_count
       FROM boletos_titulos ${where}
       ORDER BY flag_count DESC, vencto_real ASC NULLS LAST, id LIMIT ${limit}`
    ),
    sql.query(
      `SELECT f->>'tipo' AS tipo, COUNT(*) AS qtd
       FROM boletos_titulos, jsonb_array_elements(flags) f
       ${where ? `${where} AND` : 'WHERE'} flag_count > 0
       GROUP BY 1 ORDER BY qtd DESC`
    ),
  ]);

  // ===== Paleta Aery (mesma do fiscal/fechamento) =====
  const corPrimaria = '1E3A5F';
  const corSecundaria = '2E86C1';
  const corVerde = '1E8449';
  const corVermelho = 'C0392B';
  const corLaranja = 'D35400';
  const corAmbar = 'B9770E';
  const corCinzaClaro = 'F2F2F2';
  const corCinzaMedio = 'D5D8DC';
  const corBranco = 'FFFFFF';
  const fmtBRL = '"R$" #,##0.00';

  const border = {
    top: { style: 'thin', color: { rgb: corCinzaMedio } },
    bottom: { style: 'thin', color: { rgb: corCinzaMedio } },
    left: { style: 'thin', color: { rgb: corCinzaMedio } },
    right: { style: 'thin', color: { rgb: corCinzaMedio } },
  };
  const sTitle = {
    font: { bold: true, sz: 16, color: { rgb: corBranco } },
    fill: { fgColor: { rgb: corPrimaria } },
    alignment: { horizontal: 'center', vertical: 'center' },
  };
  const sSubtitle = {
    font: { sz: 10, color: { rgb: corBranco } },
    fill: { fgColor: { rgb: corPrimaria } },
    alignment: { horizontal: 'center', vertical: 'center' },
  };
  const sHeader = {
    font: { bold: true, sz: 10, color: { rgb: corBranco } },
    fill: { fgColor: { rgb: corSecundaria } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border,
  };
  const sCell = { font: { sz: 10 }, alignment: { vertical: 'center' }, border };
  const sCellC = { ...sCell, alignment: { horizontal: 'center', vertical: 'center' } };
  const sMoney = { ...sCell, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: fmtBRL };
  const sMono = { ...sCell, font: { sz: 9, name: 'Consolas' } };
  const sFlagVermelho = { ...sCellC, font: { sz: 10, bold: true, color: { rgb: corVermelho } } };
  const sFlagLaranja = { ...sCellC, font: { sz: 10, color: { rgb: corLaranja } } };
  const sFlagAmbar = { ...sCellC, font: { sz: 10, color: { rgb: corAmbar } } };
  const sOk = { ...sCellC, font: { sz: 10, bold: true, color: { rgb: corVerde } } };

  const flagStyle = (tipo: string) =>
    tipo === 'valor_divergente' || tipo === 'vencimento_divergente' ? sFlagVermelho :
    tipo === 'codbar_duplicado' || tipo === 'lado_ausente' ? sFlagAmbar : sFlagLaranja;

  const fmtDt = (v: any) => {
    const s = v?.toISOString?.().slice(0, 10) ?? String(v || '').slice(0, 10);
    return s ? s.split('-').reverse().join('/') : '';
  };

  const filtroLabel = [
    empresas.length ? `Empresa: ${empresas.join(', ')}` : 'Todas empresas',
    status === 'aberto' ? 'Em aberto' : status === 'baixado' ? 'Baixados' : 'Todos os status',
    flagTipos.length ? `Tipos: ${flagTipos.map((f) => FLAG_LABEL[f] || f).join(', ')}` : 'Todos os tipos',
    busca ? `Busca: "${busca}"` : null,
    soComFlags ? 'somente com inconsistência' : 'incluindo sem inconsistência',
  ].filter(Boolean).join(' · ');

  const COLS = [
    'Empresa', 'Filial', 'Nº Título', 'Tipo', 'Fornecedor', 'Cód. Fornecedor',
    'Natureza', 'Emissão', 'Vencimento', 'Vencto Real', 'Baixa', 'Status',
    'Valor', 'Acréscimo', 'Multa', 'Juros', 'Saldo',
    'Inconsistências', 'Detalhes', 'Linha Digitável', 'Código de Barras',
    'Portador', 'Banco Pgto', 'Origem', 'Digitação', 'Histórico',
  ];

  const wb = XLSX.utils.book_new();

  // ===== Sheet 1: dados =====
  const ws = XLSX.utils.aoa_to_sheet([
    ['AERY — BOLETOS: INCONSISTÊNCIAS EM TÍTULOS A PAGAR'],
    [`${filtroLabel} · gerado em ${new Date().toLocaleString('pt-BR')} · ${titulos.rows.length} título(s)`],
    [],
    COLS,
  ]);

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: COLS.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: COLS.length - 1 } },
  ];
  ws['A1'].s = sTitle;
  ws['A2'].s = sSubtitle;
  for (let c = 0; c < COLS.length; c++) {
    const ref = XLSX.utils.encode_cell({ r: 3, c });
    if (ws[ref]) ws[ref].s = sHeader;
  }
  ws['!rows'] = [{ hpt: 28 }, { hpt: 18 }, { hpt: 6 }, { hpt: 32 }];

  titulos.rows.forEach((t: any, i: number) => {
    const r = 4 + i;
    const flags: { tipo: string; detalhe: string }[] = Array.isArray(t.flags) ? t.flags : [];
    const flagLabels = flags.map((f) => FLAG_LABEL[f.tipo] || f.tipo).join('; ');
    const flagDetalhes = flags.map((f) => `${FLAG_LABEL[f.tipo] || f.tipo}: ${f.detalhe}`).join('\n');
    const aberto = !t.baixa;
    const values: any[] = [
      t.empresa, t.filial || '',
      `${t.prefixo || ''}/${t.num || ''}${t.parcela ? `-${t.parcela}` : ''}`,
      t.tipo || '', t.fornecedor_nome || t.fornecedor || '', t.fornecedor || '',
      t.natureza_desc || t.natureza || '', fmtDt(t.emissao), fmtDt(t.vencto),
      fmtDt(t.vencto_real), fmtDt(t.baixa), aberto ? 'Aberto' : 'Baixado',
      Number(t.valor) || 0, Number(t.acresc) || 0, Number(t.multa) || 0,
      Number(t.juros) || 0, Number(t.saldo) || 0,
      flagLabels, flagDetalhes, t.lindig || '', t.codbar || '',
      t.portado || '', t.bco_pgto || '', t.origem || '', fmtDt(t.dt_digit),
      t.historico || '',
    ];
    const moneyCols = new Set([12, 13, 14, 15, 16]);
    const centerCols = new Set([0, 1, 3, 7, 8, 9, 10, 22, 23, 24]);
    const monoCols = new Set([2, 5, 19, 20]);
    values.forEach((v, c) => {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell: any = { t: typeof v === 'number' ? 'n' : 's', v };
      cell.s =
        moneyCols.has(c) ? sMoney :
        monoCols.has(c) ? sMono :
        c === 11 ? (aberto ? sFlagAmbar : sOk) :
        c === 17 && v ? flagStyle(flags[0]?.tipo || '') :
        c === 18 ? { ...sCell, font: { sz: 9 }, alignment: { vertical: 'center', wrapText: true } } :
        centerCols.has(c) ? sCellC : sCell;
      ws[ref] = cell;
    });
    if (i % 2 === 1) {
      values.forEach((_, c) => {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref]?.s) ws[ref].s = { ...ws[ref].s, fill: { fgColor: { rgb: corCinzaClaro } } };
      });
    }
  });

  ws['!cols'] = [
    { wch: 8 }, { wch: 6 }, { wch: 16 }, { wch: 7 }, { wch: 38 }, { wch: 14 },
    { wch: 24 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 9 },
    { wch: 14 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 14 },
    { wch: 34 }, { wch: 48 }, { wch: 50 }, { wch: 50 },
    { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 11 }, { wch: 40 },
  ];
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 3 + titulos.rows.length, c: COLS.length - 1 } });
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 3 + titulos.rows.length, c: COLS.length - 1 } }) };

  XLSX.utils.book_append_sheet(wb, ws, 'Títulos');

  // ===== Sheet 2: resumo por tipo de inconsistência =====
  const ws2 = XLSX.utils.aoa_to_sheet([
    ['AERY — RESUMO POR TIPO DE INCONSISTÊNCIA'],
    [`${filtroLabel} · gerado em ${new Date().toLocaleString('pt-BR')}`],
    [],
    ['Tipo de inconsistência', 'Títulos', '% dos flagados'],
  ]);
  ws2['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
  ];
  ws2['A1'].s = sTitle;
  ws2['A2'].s = sSubtitle;
  for (let c = 0; c < 3; c++) {
    const ref = XLSX.utils.encode_cell({ r: 3, c });
    if (ws2[ref]) ws2[ref].s = sHeader;
  }
  ws2['!rows'] = [{ hpt: 28 }, { hpt: 18 }, { hpt: 6 }, { hpt: 24 }];
  const totalFlag = resumoFlags.rows.reduce((a: number, r: any) => a + Number(r.qtd), 0);
  resumoFlags.rows.forEach((r: any, i: number) => {
    const row = 4 + i;
    const vals: any[] = [FLAG_LABEL[r.tipo] || r.tipo, Number(r.qtd), totalFlag ? Number(r.qtd) / totalFlag : 0];
    vals.forEach((v, c) => {
      const ref = XLSX.utils.encode_cell({ r: row, c });
      const cell: any = { t: typeof v === 'number' ? 'n' : 's', v };
      cell.s = c === 0 ? sCell : c === 2
        ? { ...sCellC, numFmt: '0.0%' }
        : { ...sCellC, font: { sz: 10, bold: true, color: { rgb: flagStyle(r.tipo).font.color.rgb } } };
      if (i % 2 === 1) cell.s = { ...cell.s, fill: { fgColor: { rgb: corCinzaClaro } } };
      ws2[ref] = cell;
    });
  });
  ws2['!cols'] = [{ wch: 34 }, { wch: 12 }, { wch: 14 }];
  ws2['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 3 + resumoFlags.rows.length, c: 2 } });
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumo por tipo');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  await logAudit(request, {
    action: 'boletos.exportar_xlsx',
    entity_type: 'boletos_titulo',
    entity_id: '-',
    details: { empresas, status, flags: flagTipos, q: busca, so_flags: soComFlags, total: titulos.rows.length },
  });

  const fname = `boletos-inconsistencias-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fname}"`,
    },
  });
}
