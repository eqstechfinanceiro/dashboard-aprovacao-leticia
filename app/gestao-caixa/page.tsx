'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Search, FileSpreadsheet, Snowflake } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SortIcon } from '@/lib/table-sort';
import { FechamentoWizard } from '@/components/fechamento-wizard';
import * as XLSX from 'xlsx-js-style';

export const dynamic = 'force-dynamic';

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

function Kpi({ label, value, sub, tone = 'default' }: {
  label: string; value: string; sub?: string; tone?: 'default' | 'warn' | 'danger';
}) {
  const accent = tone === 'danger' ? 'border-l-red-500' : tone === 'warn' ? 'border-l-amber-500' : 'border-l-blue-600';
  return (
    <Card className={`h-full border-l-4 ${accent} shadow-sm`}>
      <CardContent className="flex h-full flex-col justify-center p-5 pt-5 pb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        <p className="mt-2 break-words text-2xl font-bold tabular-nums text-gray-900">{value}</p>
        {sub && <p className="mt-1.5 text-xs text-gray-500">{sub}</p>}
      </CardContent>
    </Card>
  );
}

type SortKey = 'colaborador' | 'situacao' | 'regional' | 'saldo_prestacao' | 'saldo_prestacao_hoje' | 'saldo_cartao' | 'saldo_cartao_carga' | 'saldo_cartao_hoje' | 'caixas_abertos' | 'valor_aberto' | 'dias_caixa_aberto' | 'saldo_reembolsar' | 'carga_final' | 'col_qz' | 'alertas';

const TEXT_SORT_KEYS = new Set<SortKey>(['colaborador', 'situacao', 'regional']);

const ALERTA_LABEL: Record<string, string> = {
  inativo_com_saldo: 'Inativo c/ saldo',
  reembolso_maior_quinzena: 'Reembolso > quinzena',
  prestacao_pendente: 'Não prestou contas',
  cartao_parado: 'Dinheiro parado',
};
const ALERTA_TITLE: Record<string, string> = {
  inativo_com_saldo: 'Funcionário inativo/desligado ainda segurando saldo — o gestor precisa agir (prestar contas, reembolsar ou desbloquear cartão)',
  reembolso_maior_quinzena: 'A empresa deve a ele mais do que o valor da quinzena — revisar se deveria receber menos',
  prestacao_pendente: 'Deve prestação de contas e o cartão está quase zerado — o dinheiro foi gasto, falta prestar',
  cartao_parado: 'Valor significativo parado no cartão (≥ metade da quinzena) — candidato a receber menos',
};
const ALERTA_CLS: Record<string, string> = {
  inativo_com_saldo: 'text-purple-700 border-purple-200 bg-purple-50',
  reembolso_maior_quinzena: 'text-red-700 border-red-200 bg-red-50',
  prestacao_pendente: 'text-amber-700 border-amber-200 bg-amber-50',
  cartao_parado: 'text-blue-700 border-blue-200 bg-blue-50',
};

// 'inativo'.includes('ativo') === true — checar por palavra exata, não substring
const INATIVO_RE = /INATIV|DESLIGAD|SUSPENSO|APOSENTADORIA|PERICIA|CANCEL/;
const isSituacaoInativa = (situacao?: string | null) => !!situacao && INATIVO_RE.test(situacao.toUpperCase());

export default function PosicaoCaixa() {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('saldo_prestacao');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [alertFilter, setAlertFilter] = useState('todos');
  const [soComCarga, setSoComCarga] = useState(false);
  const [situacaoFilter, setSituacaoFilter] = useState<'todos' | 'ativos' | 'inativos'>('todos');
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['posicao-caixa'],
    queryFn: async () => {
      const r = await fetch('/api/analytics/posicao-caixa');
      if (!r.ok) throw new Error((await r.json()).error || 'Erro ao carregar');
      return r.json();
    },
    staleTime: 60_000,
  });

  const exportXLSX = () => {
    if (!rows.length || !data) return;
    const per = data.periodo;
    const fmtBRL = '"R$" #,##0.00';

    const cols: { key: string; label: string; money?: boolean }[] = [
      { key: 'colaborador', label: 'Colaborador' },
      { key: 'cpf', label: 'CPF' },
      { key: 'regional', label: 'Regional' },
      { key: 'centro_custo', label: 'Centro de Custo' },
      { key: 'situacao', label: 'Situação' },
      { key: 'col_qz', label: 'Quinzena (valor)', money: true },
      { key: 'carga_final', label: 'Carga nesta Quinzena', money: true },
      { key: 'reembolso', label: 'Reembolso pago na Quinzena', money: true },
      { key: 'saldo_prestacao', label: 'A Prestar Contas', money: true },
      { key: 'saldo_prestacao_hoje', label: 'A Prestar Contas (hoje)', money: true },
      { key: 'saldo_reembolsar', label: 'A Reembolsar (empresa deve)', money: true },
      { key: 'saldo_cartao', label: 'Saldo no Cartão (dia 01)', money: true },
      { key: 'saldo_cartao_carga', label: 'Saldo Cartão no Fechamento', money: true },
      { key: 'saldo_cartao_hoje', label: 'Saldo Cartão Hoje', money: true },
      { key: 'caixas_abertos', label: 'Caixas Abertos' },
      { key: 'valor_aberto', label: 'Valor em Caixas Abertos', money: true },
      { key: 'dias_caixa_aberto', label: 'Caixa Mais Antigo (dias)' },
      { key: 'alertas_txt', label: 'Alertas' },
    ];

    const wsData: unknown[][] = [
      [`POSIÇÃO DE CAIXA — ${String(per.month).padStart(2, '0')}/${per.year} · ${per.quinzena}ª quinzena`, ...Array(cols.length - 1).fill(null)],
      cols.map(c => c.label),
      ...rows.map((r: any) => cols.map(c => {
        if (c.key === 'alertas_txt') return (r.alertas || []).map((a: string) => ALERTA_LABEL[a] || a).join('; ');
        const v = r[c.key];
        return v === null || v === undefined ? '' : v;
      })),
      cols.map(c => {
        if (c.key === 'colaborador') return `TOTAL (${rows.length})`;
        if (c.money || c.key === 'caixas_abertos') return rows.reduce((s: number, r: any) => s + (Number(r[c.key]) || 0), 0);
        return '';
      }),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = cols.map(c => ({ wch: Math.max(c.label.length + 2, 14) }));
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } }];

    const styleTitle = { font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E40AF' } }, alignment: { horizontal: 'left', vertical: 'center' } };
    const styleHead = { font: { bold: true, sz: 10 }, fill: { fgColor: { rgb: 'F1F5F9' } }, alignment: { horizontal: 'left', vertical: 'center' } };
    const styleMoney = { numFmt: fmtBRL, alignment: { horizontal: 'right' }, font: { sz: 10 } };
    const styleCell = { font: { sz: 10 }, alignment: { horizontal: 'left', vertical: 'center' } };
    const styleTotal = { font: { bold: true, sz: 10 }, fill: { fgColor: { rgb: 'E2E8F0' } }, numFmt: fmtBRL, alignment: { horizontal: 'right' } };
    const styleTotalLabel = { font: { bold: true, sz: 10 }, fill: { fgColor: { rgb: 'E2E8F0' } } };
    const totalsRow = wsData.length - 1;

    for (let R = 0; R < wsData.length; R++) {
      for (let C = 0; C < cols.length; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) ws[addr] = { v: '', t: 's' };
        const cell = ws[addr];
        const col = cols[C];
        if (R === 0) { cell.s = styleTitle; continue; }
        if (R === 1) { cell.s = styleHead; continue; }
        if (R === totalsRow) {
          if (col.money) { cell.t = 'n'; cell.z = fmtBRL; cell.s = styleTotal; }
          else cell.s = styleTotalLabel;
          continue;
        }
        if (col.money && typeof cell.v === 'number') { cell.t = 'n'; cell.z = fmtBRL; cell.s = styleMoney; }
        else cell.s = styleCell;
      }
    }

    XLSX.writeFile(wbFromSheet(ws), `posicao_caixa_${per.year}-${String(per.month).padStart(2, '0')}-Q${per.quinzena}.xlsx`);
  };

  function wbFromSheet(ws: XLSX.WorkSheet) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Posição de Caixa');
    return wb;
  }

  const rows = useMemo(() => {
    if (!data) return [];
    let r = [...(data.rows as any[])];
    if (search) {
      const t = search.toLowerCase();
      const digits = search.replace(/\D/g, '');
      r = r.filter(x =>
        x.colaborador?.toLowerCase().includes(t) ||
        (digits !== '' && x.cpf?.replace(/\D/g, '').includes(digits)) ||
        x.regional?.toLowerCase().includes(t) ||
        x.centro_custo?.toLowerCase().includes(t)
      );
    }
    if (soComCarga) {
      r = r.filter(x => (x.carga_final ?? 0) > 0);
    }
    if (situacaoFilter !== 'todos') {
      r = r.filter(x => (situacaoFilter === 'inativos' ? isSituacaoInativa(x.situacao) : !isSituacaoInativa(x.situacao)));
    }
    if (alertFilter === 'com_alerta') {
      r = r.filter(x => (x.alertas || []).length > 0);
    } else if (alertFilter !== 'todos') {
      r = r.filter(x => (x.alertas || []).includes(alertFilter));
    }
    r.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'alertas') return dir * ((a.alertas?.length ?? 0) - (b.alertas?.length ?? 0));
      if (TEXT_SORT_KEYS.has(sortKey)) {
        return dir * String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), 'pt-BR', { sensitivity: 'base' });
      }
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return dir * (av - bv);
    });
    return r;
  }, [data, search, sortKey, sortDir, alertFilter, soComCarga, situacaoFilter]);

  const toggleSort = (id: SortKey) => {
    if (sortKey === id) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(id);
      setSortDir(TEXT_SORT_KEYS.has(id) ? 'asc' : 'desc');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-3 text-sm text-gray-500">Carregando posição de caixa...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <p className="font-medium text-gray-900">Erro ao carregar dados</p>
        </div>
      </div>
    );
  }

  const { kpis, aging, periodo } = data;
  const qzLabel = `${String(periodo.month).padStart(2, '0')}/${periodo.year} · ${periodo.quinzena}ª quinzena`;

  const Th = ({ id, children, right = true, title }: { id: SortKey; children: React.ReactNode; right?: boolean; title?: string }) => (
    <th
      onClick={() => toggleSort(id)}
      title={title ?? 'Clique para ordenar'}
      className={`px-4 py-2.5 font-medium cursor-pointer select-none whitespace-nowrap hover:text-gray-800 ${right ? 'text-right' : 'text-left'} ${sortKey === id ? 'text-blue-700' : ''}`}
    >
      {children}
      <SortIcon active={sortKey === id} dir={sortDir} />
    </th>
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Posição de Caixa</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Quem está com dinheiro parado e quem deve · base {qzLabel}
          </p>
        </div>
        <Button size="sm" onClick={() => setWizardOpen(true)}>
          <Snowflake className="mr-1.5 h-4 w-4" />
          Preparar fechamento
        </Button>
      </div>

      <FechamentoWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <Kpi
          label="Carga na quinzena"
          value={BRL(kpis.cargaQuinzena)}
          sub={`${kpis.pessoasComCarga} colaboradores carregados`}
        />
        <Kpi
          label="Saldo a prestar"
          value={BRL(kpis.saldoPrestacao)}
          sub={`${kpis.pessoasComSaldo} colaboradores com saldo`}
        />
        <Kpi
          label="A reembolsar"
          value={BRL(kpis.saldoReembolsar)}
          sub={`${kpis.pessoasReembolsar} colaboradores a reembolsar`}
          tone={kpis.saldoReembolsar > 0 ? 'warn' : 'default'}
        />
        <Kpi
          label="Saldo em cartão"
          value={BRL(kpis.saldoCartao)}
          sub={kpis.saldoCartaoHoje !== undefined ? `hoje: ${BRL(kpis.saldoCartaoHoje)}` : undefined}
        />
        <Kpi
          label="Caixas abertos"
          value={String(kpis.caixasAbertos)}
          sub={`${BRL(kpis.valorCaixasAbertos)} · ${aging.length} há +30 dias`}
          tone={kpis.caixasAbertos > 0 ? 'warn' : 'default'}
        />
        <Kpi
          label="Revisar quinzena"
          value={String(kpis.pessoasAlerta)}
          sub="Falta prestar, dinheiro parado ou reembolso alto"
          tone={kpis.pessoasAlerta > 0 ? 'danger' : 'default'}
        />
      </div>

      {/* Tabela por colaborador */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-gray-800">
              Por colaborador <span className="text-gray-400 font-normal">({rows.length})</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <select
                value={alertFilter}
                onChange={(e) => setAlertFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm h-8 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="todos">Todos os alertas</option>
                <option value="com_alerta">Só com alerta</option>
                <option value="inativo_com_saldo">Inativos com saldo</option>
                <option value="prestacao_pendente">Não prestou contas</option>
                <option value="cartao_parado">Dinheiro parado no cartão</option>
                <option value="reembolso_maior_quinzena">Reembolso &gt; quinzena</option>
              </select>
              <select
                value={situacaoFilter}
                onChange={(e) => setSituacaoFilter(e.target.value as any)}
                className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm h-8 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="todos">Ativos e inativos</option>
                <option value="ativos">Só ativos</option>
                <option value="inativos">Só inativos</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={soComCarga}
                  onChange={(e) => setSoComCarga(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Com carga na quinzena
              </label>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Nome, CPF, regional ou centro de custo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <Button variant="outline" size="sm" onClick={exportXLSX} disabled={!rows.length} className="h-8">
                <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                Excel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <Th id="colaborador" right={false}>Colaborador</Th>
                  <Th id="situacao" right={false}>Status</Th>
                  <Th id="regional" right={false}>Regional</Th>
                  <Th id="col_qz" title="Valor da quinzena cadastrada para o colaborador">Quinzena</Th>
                  <Th id="carga_final" title="Valor efetivamente carregado nesta quinzena (carga parcial + reembolso)">Carga QZ</Th>
                  <Th id="saldo_prestacao" title="Valor recebido e ainda não prestado em relatórios (acumulado até o último congelamento)">A prestar contas</Th>
                  <Th id="saldo_prestacao_hoje" title="Mesmo cálculo do Fechamento, atualizado ao vivo — cargas + transferências + taxas menos prestações de contas sincronizadas">A prestar (hoje)</Th>
                  <Th id="saldo_reembolsar" title="Valor que a empresa deve reembolsar ao colaborador">A reembolsar</Th>
                  <Th id="saldo_cartao" title="Dinheiro disponível no cartão — último saldo registrado até o dia 01 do mês (visão de controle da quinzena)">Cartão dia 01</Th>
                  <Th id="saldo_cartao_carga" title="Saldo do cartão na data de fechamento da quinzena (dia 11 ou 25)">Cartão na carga</Th>
                  <Th id="saldo_cartao_hoje" title="Último saldo do cartão registrado no extrato — dado mais recente disponível">Cartão hoje</Th>
                  <Th id="caixas_abertos" title="Relatórios de caixa ainda abertos/enviados">Cx. abertos</Th>
                  <Th id="dias_caixa_aberto" title="Dias desde o caixa aberto mais antigo">Mais antigo</Th>
                  <Th id="alertas" right={false}>Alerta</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.cpf} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <span className="text-gray-800 font-medium">{r.colaborador || r.cpf}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {isSituacaoInativa(r.situacao) ? (
                        <Badge variant="outline" className="text-xs text-red-700 border-red-200 bg-red-50" title={r.situacao}>
                          {r.situacao}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-green-700 border-green-200 bg-green-50">
                          {r.situacao || 'Ativo'}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{r.regional || '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.col_qz !== null && r.col_qz !== undefined
                        ? <span className="text-gray-600">{BRL(r.col_qz)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.carga_final > 0 ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                      {BRL(r.carga_final)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${r.saldo_prestacao > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                      {BRL(r.saldo_prestacao)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                      r.saldo_prestacao_hoje === null || r.saldo_prestacao_hoje === undefined
                        ? 'text-gray-300'
                        : Math.abs(r.saldo_prestacao_hoje - r.saldo_prestacao) > 0.01
                          ? 'text-blue-700'
                          : 'text-gray-500'
                    }`}>
                      {r.saldo_prestacao_hoje === null || r.saldo_prestacao_hoje === undefined
                        ? '—'
                        : BRL(r.saldo_prestacao_hoje)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.saldo_reembolsar > 0 ? 'font-medium text-blue-700' : 'text-gray-400'}`}>
                      {BRL(r.saldo_reembolsar)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{BRL(r.saldo_cartao)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{BRL(r.saldo_cartao_carga ?? 0)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${(r.saldo_cartao_hoje ?? 0) > 0 ? 'text-gray-900' : 'text-gray-400'}`}>{BRL(r.saldo_cartao_hoje ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.caixas_abertos > 0
                        ? <span className="font-medium text-amber-700">{r.caixas_abertos}</span>
                        : <span className="text-gray-400">0</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.dias_caixa_aberto !== null
                        ? <span className={r.dias_caixa_aberto > 30 ? 'font-medium text-red-600' : 'text-gray-600'}>{r.dias_caixa_aberto}d</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {(r.alertas || []).map((a: string) => (
                          <Badge key={a} variant="outline" className={`text-xs ${ALERTA_CLS[a] || ''}`} title={ALERTA_TITLE[a]}>
                            {ALERTA_LABEL[a] || a}
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={14} className="px-4 py-8 text-center text-gray-400">Nenhum colaborador encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
