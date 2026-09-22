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
} from 'lucide-react';

export const dynamic = 'force-dynamic';

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

export default function PendenciasPage() {
  const [data, setData] = useState<PendenciasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reportFilter, setReportFilter] = useState<'all' | 'PENDENTE' | 'PARCIAL'>('all');
  const [meipagFilter, setMeipagFilter] = useState<'all' | 'V' | 'I'>('all');
  const [reportSearch, setReportSearch] = useState('');
  const [notaClass, setNotaClass] = useState<'all' | 'MERCADORIA' | 'SERVICO' | 'REMESSA'>('all');
  const [notaEmpresa, setNotaEmpresa] = useState<'all' | 'EQS' | 'BRATEC'>('all');
  const [notaSearch, setNotaSearch] = useState('');

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
      return true;
    });
  }, [data, reportFilter, meipagFilter, reportSearch]);

  const notas = useMemo(() => {
    if (!data) return [];
    return data.sds.notas.filter((n) => {
      if (notaClass !== 'all' && n.classificacao !== notaClass) return false;
      if (notaEmpresa !== 'all' && n.empresa !== notaEmpresa) return false;
      if (notaSearch) {
        const q = notaSearch.toLowerCase();
        const hay = `${n.doc} ${n.fornecedor || ''} ${n.cnpj || ''} ${n.chaveNf || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, notaClass, notaEmpresa, notaSearch]);

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
    const c = data.agilitas.conferir;
    const l = data.agilitas.lancar;
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

  const sdsByEmpresa = useMemo(() => {
    const out: Record<string, Record<string, Bucket>> = {};
    if (!data) return out;
    for (const r of data.sds.resumo) {
      const emp = out[r.empresa] = out[r.empresa] || {};
      const k = r.classificacao || 'OUTROS';
      const b = emp[k] = emp[k] || { count: 0, valor: 0 };
      b.count += r.count;
      b.valor += r.valmerc;
    }
    return out;
  }, [data]);

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

  const a = data.agilitas;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pendências Protheus</h1>
          {data.syncedAt && (
            <p className="text-sm text-gray-500">
              Atualizado {new Date(data.syncedAt).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={load} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
          <Button onClick={copyResumo} size="sm">
            {copied ? <Check className="mr-1 h-4 w-4" /> : <ClipboardCopy className="mr-1 h-4 w-4" />}
            {copied ? 'Copiado!' : 'Copiar resumo Agilitas'}
          </Button>
        </div>
      </div>

      {/* Cards Agilitas */}
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

      {/* Cards SDS por empresa */}
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
              <span className="text-xs text-gray-500">
                {total.count} notas — R$ {fmt(total.valor)}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {(['MERCADORIA', 'SERVICO', 'REMESSA'] as const).map((cls) => {
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

      {/* Tabela reports */}
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

      {/* Tabela notas SDS */}
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
    </div>
  );
}
