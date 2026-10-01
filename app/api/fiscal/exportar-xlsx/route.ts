import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx-js-style';
import { sql } from '@/lib/db/neon';
import { ensureFiscalTables } from '@/lib/fiscal/fiscal-db';
import { logAudit } from '@/lib/db/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/fiscal/exportar-xlsx — mesmos filtros do /fila
// (tipo, status, scope, from, to, q). Gera planilha formatada no padrão Aery
// para as três visões da página (Mercadoria, Serviço, Histórico).

const STATUS_LABEL: Record<string, string> = {
  auto_ok: 'Conferida (auto)',
  pendente: 'Pendente',
  falha_tecnica: 'Falha técnica',
  confirmado_ok: 'Confirmada OK',
  confirmado_erro: 'Erro confirmado',
  cancelado: 'Cancelada',
};

const ERRO_LABEL: Record<string, string> = {
  valor_errado: 'Valor errado',
  tipo_errado: 'Tipo errado',
  fornecedor_errado: 'Fornecedor errado',
  tes_errado: 'TES errada',
  imposto_errado: 'Imposto errado',
  doc_invalido: 'Documento inválido',
  sem_documento: 'Sem documento',
  outro: 'Outro',
};

export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco de dados não disponível' }, { status: 503 });
  await ensureFiscalTables();

  const sp = request.nextUrl.searchParams;
  const tipo = sp.get('tipo') || 'all';
  const status = sp.get('status') || 'all';
  const scope = sp.get('scope') || 'all';
  const from = sp.get('from') || null;
  const to = sp.get('to') || null;
  const q = (sp.get('q') || '').trim().toLowerCase();
  const limit = Math.min(parseInt(sp.get('limit') || '1000', 10) || 1000, 5000);

  const notas: any[] = await sql`
    SELECT n.id, n.tipo, n.doc, n.serie, n.filial, n.fornecedor, n.cnpj,
           n.valor, n.emissao::text, n.chave_acesso, n.auto_status,
           n.auto_resumo, n.review_status, n.reviewed_by, n.reviewed_at,
           n.erro_tipo, n.erro_descricao, n.cancelled_by, n.cancelled_at,
           n.cancel_motivo, n.created_at
    FROM fiscal_notas n
    WHERE (${tipo} = 'all' OR n.tipo = ${tipo})
      AND (${status} = 'all' OR n.review_status = ${status})
      AND (${scope} <> 'fila' OR n.review_status NOT IN ('confirmado_ok', 'confirmado_erro', 'cancelado'))
      AND (${scope} <> 'historico' OR n.review_status IN ('confirmado_erro', 'cancelado'))
      AND (${from}::date IS NULL OR n.emissao >= ${from}::date)
      AND (${to}::date IS NULL OR n.emissao <= ${to}::date)
      AND (${q} = '' OR
           lower(n.doc) LIKE ${'%' + q + '%'} OR
           lower(COALESCE(n.fornecedor, '')) LIKE ${'%' + q + '%'} OR
           lower(COALESCE(n.chave_acesso, '')) LIKE ${'%' + q + '%'})
    ORDER BY n.emissao DESC NULLS LAST, n.doc DESC
    LIMIT ${limit}
  `;

  // ===== Paleta Aery (mesma do fechamento) =====
  const corPrimaria = '1E3A5F';
  const corSecundaria = '2E86C1';
  const corVerde = '1E8449';
  const corVermelho = 'C0392B';
  const corLaranja = 'D35400';
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
  const sErro = { ...sCellC, font: { sz: 10, bold: true, color: { rgb: corVermelho } } };
  const sCancel = { ...sCellC, font: { sz: 10, color: { rgb: '7F8C8D' } } };
  const sPend = { ...sCellC, font: { sz: 10, bold: true, color: { rgb: corLaranja } } };
  const sOk = { ...sCellC, font: { sz: 10, color: { rgb: corVerde } } };

  const statusStyle = (s: string) =>
    s === 'confirmado_erro' ? sErro :
    s === 'cancelado' ? sCancel :
    s === 'pendente' || s === 'falha_tecnica' ? sPend : sOk;

  const escopoLabel =
    scope === 'historico' ? 'Histórico (erros e canceladas)' :
    `Fila — ${tipo === 'servico' ? 'Serviço' : tipo === 'mercadoria' ? 'Mercadoria' : tipo === 'vexpenses' ? 'VExpenses' : 'Todos'}`;

  const COLS = [
    'NF', 'Série', 'Tipo', 'Filial', 'Fornecedor', 'CNPJ', 'Emissão',
    'Valor', 'Chave de Acesso', 'Status', 'Conferência auto', 'Resumo auto',
    'Tipo de erro', 'Descrição do erro', 'Revisado por', 'Revisado em',
    'Cancelada por', 'Cancelada em', 'Motivo cancelamento',
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['AERY — CONFERÊNCIA FISCAL'],
    [`${escopoLabel} · ${status === 'all' ? 'todos os status' : (STATUS_LABEL[status] || status)} · gerado em ${new Date().toLocaleString('pt-BR')} · ${notas.length} nota(s)`],
    [],
    COLS,
  ]);

  // Células com estilo: título mesclado + subtítulo + header.
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
  ws['!rows'] = [{ hpt: 28 }, { hpt: 18 }, { hpt: 6 }, { hpt: 30 }];

  const fmtDt = (v: any) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
  const fmtDtHora = (v: any) => (v ? new Date(v).toLocaleString('pt-BR') : '');
  const fmtCnpj = (v: any) => {
    const d = String(v || '').replace(/\D/g, '');
    return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
      : d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (v || '');
  };

  // status col index = 9; erro tipo = 12; descricao = 13
  notas.forEach((n, i) => {
    const r = 4 + i;
    const values: any[] = [
      n.doc, n.serie || '', n.tipo === 'servico' ? 'Serviço' : n.tipo === 'vexpenses' ? 'VExpenses' : 'Mercadoria',
      n.filial || '', n.fornecedor || '', fmtCnpj(n.cnpj), fmtDt(n.emissao),
      n.valor !== null ? Number(n.valor) : '', n.chave_acesso || '',
      STATUS_LABEL[n.review_status] || n.review_status,
      n.auto_status === 'match' ? 'OK' : n.auto_status === 'divergente' ? 'Divergente' : n.auto_status === 'erro' ? 'Falha técnica' : 'Pendente',
      n.auto_resumo || '',
      ERRO_LABEL[n.erro_tipo] || n.erro_tipo || '',
      n.erro_descricao || '',
      n.reviewed_by || '', fmtDtHora(n.reviewed_at),
      n.cancelled_by || '', fmtDtHora(n.cancelled_at), n.cancel_motivo || '',
    ];
    values.forEach((v, c) => {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell: any = { t: typeof v === 'number' ? 'n' : 's', v };
      cell.s =
        c === 7 ? sMoney :
        c === 9 ? statusStyle(n.review_status) :
        c === 12 && v ? sErro :
        c === 1 || c === 3 || c === 5 || c === 6 ? sCellC : sCell;
      ws[ref] = cell;
    });
    // Zebra
    if (i % 2 === 1) {
      values.forEach((_, c) => {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref]?.s) ws[ref].s = { ...ws[ref].s, fill: { fgColor: { rgb: corCinzaClaro } } };
      });
    }
  });

  ws['!cols'] = [
    { wch: 12 }, { wch: 6 }, { wch: 11 }, { wch: 7 }, { wch: 38 }, { wch: 20 },
    { wch: 11 }, { wch: 13 }, { wch: 48 }, { wch: 16 }, { wch: 14 }, { wch: 34 },
    { wch: 16 }, { wch: 34 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 30 },
  ];
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 3 + notas.length, c: COLS.length - 1 } });
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 3 + notas.length, c: COLS.length - 1 } }) };

  XLSX.utils.book_append_sheet(wb, ws, 'Conferência Fiscal');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  await logAudit(request, {
    action: 'fiscal.exportar_xlsx',
    entity_type: 'fiscal_nota',
    entity_id: '-',
    details: { tipo, status, scope, total: notas.length },
  });

  const fname = `fiscal-${scope}-${tipo}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fname}"`,
    },
  });
}
