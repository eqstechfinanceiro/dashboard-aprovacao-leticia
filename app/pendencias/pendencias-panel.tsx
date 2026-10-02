'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTableSort, SortIcon } from '@/lib/table-sort';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ClipboardCopy,
  Check,
  RefreshCw,
  Hourglass,
  FileCheck,
  Package,
  Wrench,
  Repeat,
  Search,
  AlertCircle,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';
import { SetorChips, SetorEmpty, type Setor } from '@/components/setor-chips';

interface Bucket {
  count: number;
  valor: number;
}

interface ReportRow {
  idagil: string;
  state: 'PENDENTE' | 'PARCIAL' | string;
  meipag: string | null;
  dtemis: string | null;
  total: number;
  itemCount: number;
  pending: number;
  launched: number;
  finished: number;
  userId: string | null;
  nome: string | null;
  usuario: string | null;
}

interface NotaRow {
  key: string;
  empresa: string;
  classificacao: string | null;
  doc: string | null;
  serie: string | null;
  fornecedor: string | null;
  cnpj: string | null;
  emissao: string | null;
  vencimento: string | null;
  valmerc: number;
  totalNf: number;
  chaveNf: string | null;
}

interface PendenciasData {
  geradoEm: string;
  syncedAt: string | null;
  agilitas: {
    conferir: { total: Bucket; itau: Bucket; vex: Bucket; outros: Bucket };
    lancar: { total: Bucket; pendente: Bucket; parcial: Bucket };
  };
  reports: ReportRow[];
  sds: {
    resumo: { empresa: string; classificacao: string; count: number; valmerc: number; totalNf: number }[];
    notas: NotaRow[];
  };
  topCategorias?: { classificacao: string | null; especie: string | null; count: number; valmerc: number }[];
}

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = s.slice(0, 10);
  return d.includes('-') ? d.split('-').reverse().join('/') : d;
}

function meipagLabel(m: string | null): string {
  if (m === 'I') return 'ITAÚ';
  if (m === 'V') return 'VEX';
  if (m === 'A') return 'AGILLITAS';
  return m || '—';
}

type PeriodoEmissao = 'all' | 'mes_atual' | 'mes_passado' | 'ate_mes_passado' | '30d' | 'custom';

// Filtra por mês de emissão — a data vem como 'YYYY-MM-DD...' em dtemis/emissao.
function inPeriodo(iso: string | null, periodo: PeriodoEmissao, mesCustom: string): boolean {
  if (periodo === 'all') return true;
  if (!iso || iso.length < 7) return false;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (!y || !m || !d) return false;
  const now = new Date();
  if (periodo === 'mes_atual') return y === now.getFullYear() && m === now.getMonth() + 1;
  if (periodo === 'mes_passado') {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return y === prev.getFullYear() && m === prev.getMonth() + 1;
  }
  if (periodo === 'ate_mes_passado') {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return y < prev.getFullYear() || (y === prev.getFullYear() && m <= prev.getMonth() + 1);
  }
  if (periodo === '30d') {
    return new Date(y, m - 1, d).getTime() >= now.getTime() - 30 * 86400000;
  }
  if (periodo === 'custom' && /^\d{4}-\d{2}$/.test(mesCustom)) {
    return `${y}-${String(m).padStart(2, '0')}` === mesCustom;
  }
  return periodo === 'custom'; // mês ainda não escolhido → não filtra
}

export default function PendenciasPanel() {
  const [data, setData] = useState<PendenciasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reportFilter, setReportFilter] = useState<'all' | 'PENDENTE' | 'PARCIAL'>('all');
  const [meipagFilter, setMeipagFilter] = useState<'all' | 'V' | 'I'>('all');
  const [reportSearch, setReportSearch] = useState('');
  const [notaClass, setNotaClass] = useState<'all' | 'MERCADORIA' | 'SERVICO' | 'REMESSA'>('all');
  const [notaEmpresa, setNotaEmpresa] = useState<'all' | 'EQS' | 'BRATEC'>('all');
  const [classesOn, setClassesOn] = useState<Record<string, boolean>>({
    MERCADORIA: true, SERVICO: true, REMESSA: true,
  });
  const [notaSearch, setNotaSearch] = useState('');
  const [setor, setSetor] = useState<Setor>('all');
  const [periodo, setPeriodo] = useState<PeriodoEmissao>('all');
  const [mesCustom, setMesCustom] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/pendencias', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const reports = useMemo(() => {
    if (!data) return [];
    return data.reports.filter((r) => {
      if (reportFilter !== 'all' && r.state !== reportFilter) return false;
      if (meipagFilter !== 'all' && r.meipag !== meipagFilter) return false;
      if (reportSearch) {
        const q = reportSearch.toLowerCase();
        const hay = `${r.idagil} ${r.nome || ''} ${r.usuario || ''} ${r.userId || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (!inPeriodo(r.dtemis, periodo, mesCustom)) return false;
      return true;
    });
  }, [data, reportFilter, meipagFilter, reportSearch, periodo, mesCustom]);

  const notas = useMemo(() => {
    if (!data) return [];
    return data.sds.notas.filter((n) => {
      if (n.classificacao && classesOn[n.classificacao] === false) return false;
      if (notaClass !== 'all' && n.classificacao !== notaClass) return false;
      if (notaEmpresa !== 'all' && n.empresa !== notaEmpresa) return false;
      if (notaSearch) {
        const q = notaSearch.toLowerCase();
        const hay = `${n.doc} ${n.fornecedor || ''} ${n.cnpj || ''} ${n.chaveNf || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (!inPeriodo(n.emissao, periodo, mesCustom)) return false;
      return true;
    });
  }, [data, notaClass, notaEmpresa, notaSearch, periodo, mesCustom, classesOn]);

  // Cards recalculados a partir das linhas filtradas — o resumo do topo
  // acompanha o período de emissão e os demais filtros da tela.
  const bucketOf = (rows: ReportRow[], pred: (r: ReportRow) => boolean): Bucket => {
    const sel = rows.filter(pred);
    return { count: sel.length, valor: sel.reduce((s, r) => s + (r.total || 0), 0) };
  };

  const agilitas = useMemo(() => ({
    conferir: {
      total: bucketOf(reports, (r) => r.state === 'PARCIAL'),
      itau: bucketOf(reports, (r) => r.state === 'PARCIAL' && r.meipag === 'I'),
      vex: bucketOf(reports, (r) => r.state === 'PARCIAL' && r.meipag === 'V'),
      outros: bucketOf(reports, (r) => r.state === 'PARCIAL' && r.meipag !== 'I' && r.meipag !== 'V'),
    },
    lancar: {
      total: bucketOf(reports, (r) => r.meipag === 'V'),
      pendente: bucketOf(reports, (r) => r.meipag === 'V' && r.state === 'PENDENTE'),
      parcial: bucketOf(reports, (r) => r.meipag === 'V' && r.state === 'PARCIAL'),
    },
  }), [reports]);

  const sdsByEmpresa = useMemo(() => {
    const out: Record<string, Record<string, Bucket>> = {};
    for (const n of notas) {
      const emp = out[n.empresa] = out[n.empresa] || {};
      const k = n.classificacao || 'OUTROS';
      const b = emp[k] = emp[k] || { count: 0, valor: 0 };
      b.count += 1;
      b.valor += n.valmerc;
    }
    return out;
  }, [notas]);

  const rSort = useTableSort(reports, {
    total: (r) => r.total,
    dtemis: (r) => r.dtemis || '',
    idagil: (r) => r.idagil,
    nome: (r) => r.nome || '',
    usuario: (r) => r.usuario || '',
    state: (r) => r.state,
    meipag: (r) => r.meipag || '',
  });

  const nSort = useTableSort(notas, {
    totalNf: (n) => n.totalNf,
    valmerc: (n) => n.valmerc,
    emissao: (n) => n.emissao || '',
    vencimento: (n) => n.vencimento || '',
    doc: (n) => n.doc || '',
    fornecedor: (n) => n.fornecedor || '',
    empresa: (n) => n.empresa,
    classificacao: (n) => n.classificacao || '',
  });

  const copyResumo = async () => {
    if (!data) return;
    const hoje = new Date().toLocaleDateString('pt-BR');
    const c = agilitas.conferir;
    const l = agilitas.lancar;
    const lines = [
      'Bom dia pessoal !!',
      '',
      `${hoje} - EQS ENGENHARIA`,
      '',
      `CAIXAS A SEREM CONFERIDOS: ${c.total.count}, totalizando R$ ${fmt(c.total.valor)}`,
      `- ITAU - ${c.itau.count}, totalizando R$ ${fmt(c.itau.valor)}`,
      `- VEX - ${c.vex.count}, totalizando R$ ${fmt(c.vex.valor)}`,
      '',
      `CAIXAS A SEREM LANÇADOS (SIGA): ${l.total.count}, totalizando R$ ${fmt(l.total.valor)}`,
      `- PARCIAIS - ${l.parcial.count}, totalizando R$ ${fmt(l.parcial.valor)}`,
      `- PENDENTES - ${l.pendente.count}, totalizando R$ ${fmt(l.pendente.valor)}`,
    ];
    const text = lines.join('\n');
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch { /* permissão negada / contexto inseguro */ }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch { /* fallback final abaixo */ }
    }
    if (!ok) {
      window.prompt('Copie o resumo (Ctrl+C, Enter):', text);
    }
    setCopied(ok);
    setTimeout(() => setCopied(false), 2500);
  };

  // Exporta um xlsx com 3 abas: Resumo (cards), Caixas (fila Agilitas,
  // respeitando filtros/ordenação da tela) e Notas SDS (idem).
  const exportXlsx = async () => {
    if (!data || exporting) return;
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const a = agilitas;
      const sdsTotal = notas.reduce(
        (acc, n) => ({ count: acc.count + 1, valor: acc.valor + n.valmerc }),
        { count: 0, valor: 0 },
      );

      const resumo = [
        { Setor: 'Gestão de Caixa', Indicador: 'Caixas a conferir', Quantidade: a.conferir.total.count, 'Valor (R$)': a.conferir.total.valor },
        { Setor: 'Gestão de Caixa', Indicador: 'A conferir · Itaú', Quantidade: a.conferir.itau.count, 'Valor (R$)': a.conferir.itau.valor },
        { Setor: 'Gestão de Caixa', Indicador: 'A conferir · VEX', Quantidade: a.conferir.vex.count, 'Valor (R$)': a.conferir.vex.valor },
        { Setor: 'Gestão de Caixa', Indicador: 'A conferir · Outros', Quantidade: a.conferir.outros.count, 'Valor (R$)': a.conferir.outros.valor },
        { Setor: 'Gestão de Caixa', Indicador: 'Caixas a lançar (SIGA)', Quantidade: a.lancar.total.count, 'Valor (R$)': a.lancar.total.valor },
        { Setor: 'Gestão de Caixa', Indicador: 'A lançar · Pendentes', Quantidade: a.lancar.pendente.count, 'Valor (R$)': a.lancar.pendente.valor },
        { Setor: 'Gestão de Caixa', Indicador: 'A lançar · Parciais', Quantidade: a.lancar.parcial.count, 'Valor (R$)': a.lancar.parcial.valor },
        { Setor: 'Entrada de Notas', Indicador: 'Notas a lançar (contábil)', Quantidade: sdsTotal.count, 'Valor (R$)': sdsTotal.valor },
      ];
      const wsResumo = XLSX.utils.json_to_sheet(resumo);
      wsResumo['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 12 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

      const caixas = rSort.sortedRows.map((r) => ({
        Report: r.idagil,
        Caixa: r.nome ?? '',
        'Usuário': r.usuario ?? r.userId ?? '',
        Meio: meipagLabel(r.meipag),
        Estado: r.state,
        'Emissão': fmtDate(r.dtemis),
        'Itens pendentes': r.pending,
        'Itens lançados': r.launched,
        'Itens finalizados': r.finished,
        'Itens total': r.itemCount,
        'Valor total (R$)': r.total,
      }));
      const wsCaixas = XLSX.utils.json_to_sheet(caixas);
      wsCaixas['!cols'] = [{ wch: 10 }, { wch: 32 }, { wch: 24 }, { wch: 9 }, { wch: 10 }, { wch: 11 }, { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 10 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, wsCaixas, 'Caixas');

      const notasRows = nSort.sortedRows.map((n) => ({
        Empresa: n.empresa,
        'Classificação': n.classificacao ?? '',
        Doc: n.doc ?? '',
        'Série': n.serie ?? '',
        Fornecedor: n.fornecedor ?? '',
        CNPJ: n.cnpj ?? '',
        'Emissão': fmtDate(n.emissao),
        Vencimento: fmtDate(n.vencimento),
        'Valor mercadoria (R$)': n.valmerc,
        'Total NF (R$)': n.totalNf,
        'Chave NF': n.chaveNf ?? '',
      }));
      const wsNotas = XLSX.utils.json_to_sheet(notasRows);
      wsNotas['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 6 }, { wch: 36 }, { wch: 18 }, { wch: 11 }, { wch: 11 }, { wch: 18 }, { wch: 14 }, { wch: 46 }];
      XLSX.utils.book_append_sheet(wb, wsNotas, 'Notas SDS');

      const catRows = (data.topCategorias || []).map((c) => ({
        Classificação: c.classificacao ?? '',
        Espécie: c.especie ?? '',
        Quantidade: c.count,
        'Valor (R$)': c.valmerc,
      }));
      const wsCats = XLSX.utils.json_to_sheet(catRows);
      wsCats['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 11 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsCats, 'Categorias em aberto');

      XLSX.writeFile(wb, `pendencias_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Carregando pendências…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-red-600">
        <AlertCircle className="h-8 w-8" />
        <p>Erro ao carregar pendências: {error}</p>
        <Button onClick={load} variant="outline" size="sm">Tentar novamente</Button>
      </div>
    );
  }

  if (!data) return null;

  const a = agilitas;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SetorChips value={setor} onChange={setSetor} />
          <select
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as PeriodoEmissao)}
            title="Filtrar por mês de emissão"
          >
            <option value="all">Todas as emissões</option>
            <option value="mes_atual">Mês atual</option>
            <option value="mes_passado">Mês passado</option>
            <option value="ate_mes_passado">Até o mês passado</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="custom">Escolher mês…</option>
          </select>
          {periodo === 'custom' && (
            <input
              type="month"
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              value={mesCustom}
              onChange={(e) => setMesCustom(e.target.value)}
            />
          )}
        </div>
        <div className="flex items-center gap-3">
          {data.syncedAt && (
            <p className="text-sm text-gray-500">
              Atualizado {new Date(data.syncedAt).toLocaleString('pt-BR')}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" disabled={loading}>
              <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
            <Button onClick={exportXlsx} variant="outline" size="sm" disabled={exporting}>
              {exporting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />}
              Exportar Excel
            </Button>
            <Button onClick={copyResumo} size="sm">
              {copied ? <Check className="mr-1 h-4 w-4" /> : <ClipboardCopy className="mr-1 h-4 w-4" />}
              {copied ? 'Copiado!' : 'Copiar resumo Agilitas'}
            </Button>
          </div>
        </div>
      </div>

      {/* Cards Agilitas — Gestão de Caixa */}
      {(setor === 'all' || setor === 'caixa') && (<>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="px-4 pb-4 pt-4 text-center">
            <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Hourglass className="h-4 w-4" /> Caixas a conferir
            </div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{a.conferir.total.count}</div>
            <div className="text-sm font-medium text-gray-700">R$ {fmt(a.conferir.total.valor)}</div>
            <div className="mt-3 space-y-1 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>ITAÚ</span>
                <span>{a.conferir.itau.count} — R$ {fmt(a.conferir.itau.valor)}</span>
              </div>
              <div className="flex justify-between">
                <span>VEX</span>
                <span>{a.conferir.vex.count} — R$ {fmt(a.conferir.vex.valor)}</span>
              </div>
              {a.conferir.outros.count > 0 && (
                <div className="flex justify-between">
                  <span>OUTROS</span>
                  <span>{a.conferir.outros.count} — R$ {fmt(a.conferir.outros.valor)}</span>
                </div>
              )}
            </div>
            <p className="mt-3 text-[10px] text-gray-400">Lançamento iniciado, aguardando conferência</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="px-4 pb-4 pt-4 text-center">
            <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <FileCheck className="h-4 w-4" /> Caixas a lançar (SIGA)
            </div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{a.lancar.total.count}</div>
            <div className="text-sm font-medium text-gray-700">R$ {fmt(a.lancar.total.valor)}</div>
            <div className="mt-3 space-y-1 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>PENDENTES</span>
                <span>{a.lancar.pendente.count} — R$ {fmt(a.lancar.pendente.valor)}</span>
              </div>
              <div className="flex justify-between">
                <span>PARCIAIS</span>
                <span>{a.lancar.parcial.count} — R$ {fmt(a.lancar.parcial.valor)}</span>
              </div>
            </div>
            <p className="mt-3 text-[10px] text-gray-400">Caixas VExpenses com itens pendentes</p>
          </CardContent>
        </Card>

      </div>
      </>)}

      {/* Cards SDS por empresa — Entrada de Notas */}
      {(setor === 'all' || setor === 'entrada') && (<>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Tipos:</span>
        {(['MERCADORIA', 'SERVICO', 'REMESSA'] as const).map((cls) => {
          const on = classesOn[cls];
          const label = cls === 'SERVICO' ? 'Serviço' : cls === 'REMESSA' ? 'Remessa' : 'Mercadoria';
          return (
            <button
              key={cls}
              onClick={() => setClassesOn((s) => ({ ...s, [cls]: !s[cls] }))}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                on
                  ? 'border-rose-600 bg-rose-600 text-white'
                  : 'border-gray-300 bg-white text-gray-400 line-through'
              }`}
              title={`${on ? 'Ocultar' : 'Mostrar'} notas de ${label}`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {(['EQS', 'BRATEC'] as const).map((emp) => {
        const classes = sdsByEmpresa[emp] || {};
        const total = Object.values(classes).reduce(
          (acc, b) => ({ count: acc.count + b.count, valor: acc.valor + b.valor }),
          { count: 0, valor: 0 },
        );
        return (
          <div key={emp} className="space-y-2">
            <div className="flex items-baseline gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                {emp} — notas a lançar
              </h2>
              <span className="text-lg font-bold text-gray-900">
                {total.count} notas — R$ {fmt(total.valor)}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {(['MERCADORIA', 'SERVICO', 'REMESSA'] as const).filter((cls) => classesOn[cls]).map((cls) => {
                const Icon = cls === 'MERCADORIA' ? Package : cls === 'SERVICO' ? Wrench : Repeat;
                const b = classes[cls] || { count: 0, valor: 0 };
                return (
                  <Card key={cls}>
                    <CardContent className="px-4 pb-4 pt-4 text-center">
                      <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <Icon className="h-4 w-4" /> {cls === 'SERVICO' ? 'Serviço' : cls === 'REMESSA' ? 'Remessa' : 'Mercadoria'}
                      </div>
                      <div className="mt-2 text-2xl font-bold text-gray-900">{b.count}</div>
                      <div className="text-sm font-medium text-gray-700">R$ {fmt(b.valor)}</div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
      </>)}

      {/* Top categorias em aberto — Entrada de Notas */}
      {(setor === 'all' || setor === 'entrada') && (data?.topCategorias?.length ?? 0) > 0 && (
      <Card>
        <CardContent className="px-4 pb-4 pt-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">
            Em aberto por categoria
          </h2>
          <div className="space-y-2">
            {(() => {
              const cats = data!.topCategorias!;
              const max = Math.max(...cats.map((c) => c.valmerc), 1);
              return cats.slice(0, 8).map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-40 truncate text-xs text-gray-600">
                    {c.classificacao || 'Outros'}{c.especie ? ` · ${c.especie}` : ''}
                  </span>
                  <div className="h-5 flex-1 rounded bg-gray-100">
                    <div
                      className="h-5 rounded bg-blue-500"
                      style={{ width: `${Math.max((c.valmerc / max) * 100, 2)}%` }}
                    />
                  </div>
                  <span className="w-28 text-right text-xs font-medium text-gray-700">
                    R$ {fmt(c.valmerc)}
                  </span>
                  <span className="w-14 text-right text-xs text-gray-500">{c.count} notas</span>
                </div>
              ));
            })()}
          </div>
        </CardContent>
      </Card>
      )}

      {/* Tabela reports — Gestão de Caixa */}
      {(setor === 'all' || setor === 'caixa') && (
      <Card>
        <CardContent className="px-4 pb-4 pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              Caixas pendentes ({reports.length})
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2 h-4 w-4 text-gray-400" />
                <input
                  className="rounded-md border border-gray-300 py-1.5 pl-8 pr-2 text-sm"
                  placeholder="Buscar caixa/usuário…"
                  value={reportSearch}
                  onChange={(e) => setReportSearch(e.target.value)}
                />
              </div>
              <select
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                value={reportFilter}
                onChange={(e) => setReportFilter(e.target.value as any)}
              >
                <option value="all">Todos estados</option>
                <option value="PENDENTE">Pendente</option>
                <option value="PARCIAL">Parcial</option>
              </select>
              <select
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                value={meipagFilter}
                onChange={(e) => setMeipagFilter(e.target.value as any)}
              >
                <option value="all">Todos meios</option>
                <option value="V">VEX</option>
                <option value="I">ITAÚ</option>
              </select>
            </div>
          </div>
          <div className="max-h-[480px] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="cursor-pointer px-3 py-2" onClick={() => rSort.toggleSort('idagil')}>Report <SortIcon active={rSort.sortKey === 'idagil'} dir={rSort.sortDir} /></th>
                  <th className="cursor-pointer px-3 py-2" onClick={() => rSort.toggleSort('nome')}>Caixa <SortIcon active={rSort.sortKey === 'nome'} dir={rSort.sortDir} /></th>
                  <th className="cursor-pointer px-3 py-2" onClick={() => rSort.toggleSort('usuario')}>Usuário <SortIcon active={rSort.sortKey === 'usuario'} dir={rSort.sortDir} /></th>
                  <th className="cursor-pointer px-3 py-2" onClick={() => rSort.toggleSort('meipag')}>Meio <SortIcon active={rSort.sortKey === 'meipag'} dir={rSort.sortDir} /></th>
                  <th className="cursor-pointer px-3 py-2" onClick={() => rSort.toggleSort('state')}>Estado <SortIcon active={rSort.sortKey === 'state'} dir={rSort.sortDir} /></th>
                  <th className="cursor-pointer px-3 py-2" onClick={() => rSort.toggleSort('dtemis')}>Emissão <SortIcon active={rSort.sortKey === 'dtemis'} dir={rSort.sortDir} /></th>
                  <th className="px-3 py-2 text-right">Itens (P/L/F)</th>
                  <th className="cursor-pointer px-3 py-2 text-right" onClick={() => rSort.toggleSort('total')}>Total <SortIcon active={rSort.sortKey === 'total'} dir={rSort.sortDir} /></th>
                </tr>
              </thead>
              <tbody>
                {rSort.sortedRows.map((r) => (
                  <tr key={r.idagil} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-1.5 font-mono text-xs">{r.idagil}</td>
                    <td className="px-3 py-1.5">{r.nome || '—'}</td>
                    <td className="px-3 py-1.5 text-xs text-gray-600">{r.usuario || r.userId || '—'}</td>
                    <td className="px-3 py-1.5"><Badge variant="outline">{meipagLabel(r.meipag)}</Badge></td>
                    <td className="px-3 py-1.5">
                      <Badge variant={r.state === 'PARCIAL' ? 'default' : 'secondary'}>{r.state}</Badge>
                    </td>
                    <td className="px-3 py-1.5 text-xs">{fmtDate(r.dtemis)}</td>
                    <td className="px-3 py-1.5 text-right text-xs">
                      {r.pending}/{r.launched}/{r.finished} de {r.itemCount}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium">R$ {fmt(r.total)}</td>
                  </tr>
                ))}
                {reports.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">Nenhum caixa encontrado</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Tabela notas SDS — Entrada de Notas */}
      {(setor === 'all' || setor === 'entrada') && (
      <Card>
        <CardContent className="px-4 pb-4 pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              Notas pendentes de lançamento — contábil ({notas.length})
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2 h-4 w-4 text-gray-400" />
                <input
                  className="rounded-md border border-gray-300 py-1.5 pl-8 pr-2 text-sm"
                  placeholder="Buscar doc/fornecedor/chave…"
                  value={notaSearch}
                  onChange={(e) => setNotaSearch(e.target.value)}
                />
              </div>
              <select
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                value={notaEmpresa}
                onChange={(e) => setNotaEmpresa(e.target.value as any)}
              >
                <option value="all">EQS + BRATEC</option>
                <option value="EQS">EQS</option>
                <option value="BRATEC">BRATEC</option>
              </select>
              <select
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                value={notaClass}
                onChange={(e) => setNotaClass(e.target.value as any)}
              >
                <option value="all">Todas classes</option>
                <option value="MERCADORIA">Mercadoria</option>
                <option value="SERVICO">Serviço</option>
                <option value="REMESSA">Remessa</option>
              </select>
            </div>
          </div>
          <div className="max-h-[480px] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="cursor-pointer px-3 py-2" onClick={() => nSort.toggleSort('empresa')}>Empresa <SortIcon active={nSort.sortKey === 'empresa'} dir={nSort.sortDir} /></th>
                  <th className="cursor-pointer px-3 py-2" onClick={() => nSort.toggleSort('doc')}>Doc <SortIcon active={nSort.sortKey === 'doc'} dir={nSort.sortDir} /></th>
                  <th className="px-3 py-2">Série</th>
                  <th className="cursor-pointer px-3 py-2" onClick={() => nSort.toggleSort('fornecedor')}>Fornecedor <SortIcon active={nSort.sortKey === 'fornecedor'} dir={nSort.sortDir} /></th>
                  <th className="cursor-pointer px-3 py-2" onClick={() => nSort.toggleSort('classificacao')}>Classe <SortIcon active={nSort.sortKey === 'classificacao'} dir={nSort.sortDir} /></th>
                  <th className="cursor-pointer px-3 py-2" onClick={() => nSort.toggleSort('emissao')}>Emissão <SortIcon active={nSort.sortKey === 'emissao'} dir={nSort.sortDir} /></th>
                  <th className="cursor-pointer px-3 py-2" onClick={() => nSort.toggleSort('vencimento')}>Vencimento <SortIcon active={nSort.sortKey === 'vencimento'} dir={nSort.sortDir} /></th>
                  <th className="cursor-pointer px-3 py-2 text-right" onClick={() => nSort.toggleSort('valmerc')}>Valor <SortIcon active={nSort.sortKey === 'valmerc'} dir={nSort.sortDir} /></th>
                  <th className="cursor-pointer px-3 py-2 text-right" onClick={() => nSort.toggleSort('totalNf')}>Total NF <SortIcon active={nSort.sortKey === 'totalNf'} dir={nSort.sortDir} /></th>
                </tr>
              </thead>
              <tbody>
                {nSort.sortedRows.slice(0, 500).map((n) => (
                  <tr key={n.key} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-1.5"><Badge variant="outline">{n.empresa}</Badge></td>
                    <td className="px-3 py-1.5 font-mono text-xs">{n.doc}</td>
                    <td className="px-3 py-1.5 text-xs">{n.serie || '—'}</td>
                    <td className="max-w-[220px] truncate px-3 py-1.5" title={n.fornecedor || ''}>{n.fornecedor || '—'}</td>
                    <td className="px-3 py-1.5 text-xs">{n.classificacao || '—'}</td>
                    <td className="px-3 py-1.5 text-xs">{fmtDate(n.emissao)}</td>
                    <td className="px-3 py-1.5 text-xs">{fmtDate(n.vencimento)}</td>
                    <td className="px-3 py-1.5 text-right">R$ {fmt(n.valmerc)}</td>
                    <td className="px-3 py-1.5 text-right font-medium">R$ {fmt(n.totalNf)}</td>
                  </tr>
                ))}
                {notas.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">Nenhuma nota encontrada</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {notas.length > 500 && (
            <p className="mt-2 text-xs text-gray-400">Mostrando 500 de {notas.length} — refine os filtros.</p>
          )}
        </CardContent>
      </Card>
      )}

      {/* Contas a Pagar — ainda sem fonte de dados de pendências */}
      {setor === 'pagar' && <SetorEmpty setor={setor} />}
    </div>
  );
}
