'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import {
  RefreshCw, FileSpreadsheet, Loader2, AlertCircle, DollarSign,
  Building2, Users, ChevronDown,
} from 'lucide-react';

/* ============================ tipos ============================ */

interface Titulo {
  id: number;
  empresa: string;
  filial: string;
  num: string;
  parcela: string;
  tipo: string;
  fornecedor: string;
  fornecedor_nome: string | null;
  natureza: string | null;
  natureza_desc: string | null;
  emissao: string | null;
  vencto: string | null;
  vencto_real: string | null;
  baixa: string | null;
  valor: number;
  multa: number;
  juros: number;
  acresc: number;
  ccusto: string | null;
  ccusto_desc: string | null;
  historico: string | null;
  validacao: string | null;
  observacao: string | null;
  setor: string | null;
  gestor: string | null;
}

interface ImpactoData {
  titulos: Titulo[];
  porMes: { mes: string; eqs: number; bratec: number; qtd: number }[];
  porAno: { ano: number; total: number }[];
  topFornecedores: { nome: string; total: number; qtd: number }[];
  topSetores: { setor: string; total: number; qtd: number }[];
  detalheSetor: { setor: string; validacao: string; total: number; qtd: number }[];
  opcoes: { setores: string[]; validacoes: string[] };
  sync: { empresa: string; at: string; count: number }[];
  totais: { qtd: number; jurosTotal: number; valorTotal: number; semValidacaoQtd: number; semValidacaoValor: number };
}

/* ============================ constantes ============================ */

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const SETORES_PADRAO = [
  'COMPRAS', 'ADM', 'LOGÍSTICA', 'CONTABIL', 'FROTA', 'SMS', 'ALMOXARIFADO',
  'TI', 'DP', 'COMERCIAL', 'GESTÃO DOC', 'JURIDICO', 'FINANCEIRO',
  'BENEFICIOS', 'FATURAMENTO', 'GP',
];
const GESTORES_PADRAO = [
  'GUILHERME', 'JULIANO', 'ANDERSON', 'RAFAEL', 'EDMAR', 'MARCIA',
  'FRANCYELI', 'CELSO', 'RONALDO', 'CAROL',
];
const VALIDACOES = [
  'BOLETO ENVIADO VENCIDO',
  'PAGTO FORA DA DATA VENCTO',
  'AVISO DE CARTÓRIO',
  'BOLETO COM TAXA/DIFERENÇA',
];

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBRLs = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : fmtBRL(v);

const EMPRESA_COR: Record<string, string> = { EQS: '#7c3aed', BRATEC: '#dc2626' };

/* ============================ MultiSelect ============================ */

function MultiSelect({
  label, options, selected, onChange,
}: {
  label: string;
  options: { value: string | number; label: string }[];
  selected: (string | number)[];
  onChange: (v: (string | number)[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const toggle = (v: string | number) =>
    onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background hover:bg-muted whitespace-nowrap"
      >
        {selected.length === 0
          ? label
          : `${label}: ${selected.length === 1 ? options.find((o) => o.value === selected[0])?.label : `${selected.length} selec.`}`}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 max-h-64 min-w-[11rem] overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-lg">
          <button type="button" onClick={() => onChange([])}
            className="block w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted">
            Limpar
          </button>
          {options.map((o) => (
            <label key={String(o.value)} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} className="accent-primary" />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================ célula editável ============================ */

function CellSelect({
  value, options, onSave, placeholder,
}: {
  value: string | null; options: string[];
  onSave: (v: string) => void; placeholder?: string;
}) {
  return (
    <select
      className="w-full min-w-[8rem] rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-border focus:border-primary focus:outline-none"
      value={value || ''}
      onChange={(e) => onSave(e.target.value)}
    >
      <option value="">{placeholder || '—'}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function CellText({ value, onSave }: { value: string | null; onSave: (v: string) => void }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  return (
    <input
      className="w-full min-w-[10rem] rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-border focus:border-primary focus:outline-none"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== (value || '')) onSave(v); }}
      placeholder="…"
    />
  );
}

/* ============================ painel ============================ */

export default function ImpactoPanel() {
  const [data, setData] = useState<ImpactoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [empresasSel, setEmpresasSel] = useState<(string | number)[]>([]);
  const [anosSel, setAnosSel] = useState<(string | number)[]>([]);
  const [mesesSel, setMesesSel] = useState<(string | number)[]>([]);
  const [setoresSel, setSetoresSel] = useState<(string | number)[]>([]);
  const [validSel, setValidSel] = useState<(string | number)[]>([]);
  const [soPendentes, setSoPendentes] = useState(false);
  const reqSeq = useRef(0);

  const fetchData = useCallback(async () => {
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (empresasSel.length) q.set('empresas', empresasSel.join(','));
      if (anosSel.length) q.set('anos', anosSel.join(','));
      if (mesesSel.length) q.set('meses', mesesSel.join(','));
      if (setoresSel.length) q.set('setores', setoresSel.join(','));
      if (validSel.length) q.set('validacoes', validSel.join(','));
      if (soPendentes) q.set('sem_validacao', '1');
      q.set('limit', '2000');
      const r = await fetch(`/api/impacto?${q}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      if (seq !== reqSeq.current) return; // resposta velha não sobrescreve
      setData(j);
    } catch (e: any) {
      if (seq === reqSeq.current) setError(e?.message || 'Erro ao carregar');
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [empresasSel, anosSel, mesesSel, setoresSel, validSel, soPendentes]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveField = useCallback(async (id: number, field: string, value: string) => {
    setData((d) => d && {
      ...d,
      titulos: d.titulos.map((t) => (t.id === id ? { ...t, [field]: value || null } : t)),
    });
    const r = await fetch('/api/impacto', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, [field]: value || null }),
    });
    if (!r.ok) fetchData(); // rollback simples
  }, [fetchData]);

  const doSync = useCallback(async (full: boolean) => {
    setSyncing(true);
    try {
      const r = await fetch(`/api/impacto/sync${full ? '?full=1' : ''}`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      await fetchData();
      const resumo = (j.results || []).map((x: any) => `${x.empresa}: ${x.upserted} títulos${x.error ? ` (erro: ${x.error})` : ''}`).join(' | ');
      alert(`Sync concluído — ${resumo}`);
    } catch (e: any) {
      alert(`Falha no sync: ${e?.message}`);
    } finally {
      setSyncing(false);
    }
  }, [fetchData]);

  const doExport = useCallback(async () => {
    if (!data) return;
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const rows = data.titulos.map((t) => ({
        Empresa: t.empresa, 'DT Baixa': t.baixa, Codigo: t.fornecedor,
        Fornecedor: t.fornecedor_nome, Tipo: t.tipo, Parcela: t.parcela,
        'No. Titulo': t.num, Valor: t.valor, 'Vencto Real': t.vencto_real,
        Natureza: t.natureza, 'Descrição Nat': t.natureza_desc,
        'DT Emissao': t.emissao, 'Centro Custo': t.ccusto,
        'Descrição CC': t.ccusto_desc, 'Validação': t.validacao,
        'Observação': t.observacao, Multa: t.multa, Juros: t.juros,
        'Acresc.': t.acresc, Setor: t.setor, Gestor: t.gestor,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'BASE');
      XLSX.writeFile(wb, `impacto_financeiro_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExporting(false);
    }
  }, [data]);

  const anosDisp = useMemo(() => {
    const s = new Set<number>((data?.porAno || []).map((a) => a.ano));
    const cur = new Date().getFullYear();
    for (let y = cur - 2; y <= cur; y++) s.add(y);
    return [...s].sort((a, b) => b - a);
  }, [data]);

  const lastSync = useMemo(() => {
    const ats = (data?.sync || []).map((s) => s.at).filter(Boolean).sort();
    return ats.length ? ats[ats.length - 1] : null;
  }, [data]);

  const setoresOpts = useMemo(
    () => [...new Set([...SETORES_PADRAO, ...(data?.opcoes.setores || [])])].sort(),
    [data]
  );
  const gestoresOpts = useMemo(
    () => [...new Set([...GESTORES_PADRAO])].sort(),
    []
  );

  const mesData = useMemo(
    () => (data?.porMes || []).filter((m) => m.mes).map((m) => ({
      ...m,
      label: `${MESES_ABREV[parseInt(m.mes.slice(5), 10) - 1]}/${m.mes.slice(2, 4)}`,
    })),
    [data]
  );

  if (loading && !data) {
    return <div className="p-6 text-muted-foreground">Carregando impacto financeiro…</div>;
  }

  return (
    <div className="space-y-4 p-6">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Impacto Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Juros, multa e acréscimo pagos a fornecedores (SE2 baixados)
            {lastSync && <> · última atualização {new Date(lastSync).toLocaleString('pt-BR')}</>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => doSync(false)} disabled={syncing}>
            {syncing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            Atualizar Protheus
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setImporting(true);
            try {
              const r = await fetch('/api/impacto/import', { method: 'POST', body: f });
              const j = await r.json();
              if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
              alert(`Importação: ${j.matched} atualizados, ${j.inserted} inseridos, ${j.missing} sem SE2, ${j.skipped} ignorados`);
              await fetchData();
            } catch (err: any) {
              alert(`Falha na importação: ${err?.message}`);
            } finally {
              setImporting(false);
              e.target.value = '';
            }
          }} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importing} title="Importar BASE Excel legada (preenche Validação/Observação/Setor/Gestor)">
            {importing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />}
            Importar Base
          </Button>
          <Button variant="outline" size="sm" onClick={doExport} disabled={exporting || !data?.titulos.length}>
            {exporting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />}
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect label="Empresa" options={[{ value: 'EQS', label: 'EQS' }, { value: 'BRATEC', label: 'BRATEC' }]}
          selected={empresasSel} onChange={setEmpresasSel} />
        <MultiSelect label="Ano" options={anosDisp.map((a) => ({ value: a, label: String(a) }))}
          selected={anosSel} onChange={setAnosSel} />
        <MultiSelect label="Mês" options={MESES.map((m, i) => ({ value: i + 1, label: m }))}
          selected={mesesSel} onChange={setMesesSel} />
        <MultiSelect label="Setor" options={setoresOpts.map((s) => ({ value: s, label: s }))}
          selected={setoresSel} onChange={setSetoresSel} />
        <MultiSelect label="Validação" options={data?.opcoes.validacoes.map((s) => ({ value: s, label: s })) || []}
          selected={validSel} onChange={setValidSel} />
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
          <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} className="accent-primary" />
          Só pendentes de validação
        </label>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Acréscimo Total</div>
          <div className="text-2xl font-bold text-red-600">{fmtBRL(data?.totais.jurosTotal || 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Títulos</div>
          <div className="text-2xl font-bold">{(data?.totais.qtd || 0).toLocaleString('pt-BR')}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Valor dos Títulos</div>
          <div className="text-2xl font-bold">{fmtBRLs(data?.totais.valorTotal || 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Pendentes de Validação</div>
          <div className="text-2xl font-bold text-amber-600">
            {(data?.totais.semValidacaoQtd || 0).toLocaleString('pt-BR')}
            <span className="ml-2 text-sm font-normal">{fmtBRL(data?.totais.semValidacaoValor || 0)}</span>
          </div>
        </CardContent></Card>
      </div>

      {/* gráficos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardContent className="p-4">
          <h3 className="mb-2 font-semibold">Acréscimo por Mês</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={mesData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
              <Legend />
              <Bar dataKey="eqs" name="EQS" stackId="a" fill={EMPRESA_COR.EQS} />
              <Bar dataKey="bratec" name="BRATEC" stackId="a" fill={EMPRESA_COR.BRATEC} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <h3 className="mb-2 font-semibold">Por Ano</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data?.porAno || []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="ano" fontSize={11} width={50} />
              <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
              <Bar dataKey="total" fill="#7c3aed">
                <LabelList dataKey="total" position="right" fontSize={11} formatter={(v: any) => fmtBRLs(Number(v))} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><CardContent className="p-4">
          <h3 className="mb-2 flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4" /> Top 5 Fornecedores</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data?.topFornecedores || []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="nome" fontSize={11} width={140}
                tickFormatter={(v: string) => (v.length > 20 ? v.slice(0, 20) + '…' : v)} />
              <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
              <Bar dataKey="total" fill="#dc2626" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <h3 className="mb-2 flex items-center gap-2 font-semibold"><Users className="h-4 w-4" /> Top Setores</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data?.topSetores || []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="setor" fontSize={11} width={110} />
              <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
              <Bar dataKey="total" fill="#7c3aed" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent></Card>
      </div>

      {/* detalhamento setor × validação */}
      <Card><CardContent className="p-4">
        <h3 className="mb-3 font-semibold">Detalhamento por Setor</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4">Setor</th>
                <th className="pb-2 pr-4">Validação</th>
                <th className="pb-2 pr-4 text-right">Qtd</th>
                <th className="pb-2 text-right">Acréscimo</th>
              </tr>
            </thead>
            <tbody>
              {(data?.detalheSetor || []).map((d, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-1.5 pr-4 font-medium">{d.setor}</td>
                  <td className="py-1.5 pr-4">{d.validacao}</td>
                  <td className="py-1.5 pr-4 text-right">{d.qtd}</td>
                  <td className="py-1.5 text-right">{fmtBRL(d.total)}</td>
                </tr>
              ))}
              {!data?.detalheSetor?.length && (
                <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">Sem dados — clique em "Atualizar Protheus"</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent></Card>

      {/* tabela editável */}
      <Card><CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Títulos ({data?.titulos.length || 0})</h3>
          <Badge variant="outline" className="text-xs">edição inline — Validação / Observação / Setor / Gestor</Badge>
        </div>
        <div className="max-h-[560px] overflow-auto rounded border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr className="text-left">
                <th className="p-2">Empresa</th>
                <th className="p-2">DT Baixa</th>
                <th className="p-2">Nº Título</th>
                <th className="p-2">Tipo</th>
                <th className="p-2">Fornecedor</th>
                <th className="p-2 text-right">Valor</th>
                <th className="p-2 text-right">Multa</th>
                <th className="p-2 text-right">Juros</th>
                <th className="p-2 text-right">Acrésc.</th>
                <th className="p-2">Natureza</th>
                <th className="p-2">Centro Custo</th>
                <th className="p-2">Validação</th>
                <th className="p-2">Observação</th>
                <th className="p-2">Setor</th>
                <th className="p-2">Gestor</th>
              </tr>
            </thead>
            <tbody>
              {(data?.titulos || []).map((t) => {
                const acrescTot = (t.multa || 0) + (t.juros || 0) + (t.acresc || 0);
                return (
                  <tr key={t.id} className="border-t border-border/50 hover:bg-muted/40">
                    <td className="p-2"><Badge variant="outline" style={{ borderColor: EMPRESA_COR[t.empresa], color: EMPRESA_COR[t.empresa] }}>{t.empresa}</Badge></td>
                    <td className="p-2 whitespace-nowrap">{t.baixa}</td>
                    <td className="p-2 whitespace-nowrap">{t.num}</td>
                    <td className="p-2">{t.tipo}</td>
                    <td className="max-w-[180px] truncate p-2" title={`${t.fornecedor} ${t.fornecedor_nome || ''}`}>
                      {t.fornecedor_nome || t.fornecedor}
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">{fmtBRL(t.valor)}</td>
                    <td className="p-2 text-right whitespace-nowrap">{t.multa ? fmtBRL(t.multa) : ''}</td>
                    <td className="p-2 text-right whitespace-nowrap">{t.juros ? fmtBRL(t.juros) : ''}</td>
                    <td className="p-2 text-right font-semibold whitespace-nowrap">{fmtBRL(acrescTot)}</td>
                    <td className="max-w-[140px] truncate p-2" title={t.natureza_desc || ''}>{t.natureza}</td>
                    <td className="max-w-[140px] truncate p-2" title={t.ccusto_desc || ''}>{t.ccusto}</td>
                    <td className="p-2">
                      <CellSelect value={t.validacao} options={[...new Set([...VALIDACOES, ...(data?.opcoes.validacoes || [])])]}
                        onSave={(v) => saveField(t.id, 'validacao', v)} />
                    </td>
                    <td className="p-2"><CellText value={t.observacao} onSave={(v) => saveField(t.id, 'observacao', v)} /></td>
                    <td className="p-2"><CellSelect value={t.setor} options={setoresOpts} onSave={(v) => saveField(t.id, 'setor', v)} /></td>
                    <td className="p-2"><CellSelect value={t.gestor} options={gestoresOpts} onSave={(v) => saveField(t.id, 'gestor', v)} /></td>
                  </tr>
                );
              })}
              {!data?.titulos?.length && (
                <tr><td colSpan={15} className="py-8 text-center text-muted-foreground">
                  Nenhum título sincronizado — clique em "Atualizar Protheus" para puxar do SE2
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
    </div>
  );
}
