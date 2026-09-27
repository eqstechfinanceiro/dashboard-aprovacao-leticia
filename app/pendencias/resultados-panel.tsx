'use client';

import React, { useState, useMemo, useEffect, useCallback, ReactNode } from 'react';
import { useTableSort, SortIcon } from '@/lib/table-sort';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Clock,
  DollarSign,
  Bot,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Copy,
  Wallet,
  Receipt,
  Package,
  Wrench,
  Zap,
  RefreshCw,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';
import { SetorChips, SetorEmpty, type Setor } from '@/components/setor-chips';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = {
  primary: '#3b82f6',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  orange: '#f97316',
  indigo: '#6366f1',
};

interface NotaLancada {
  id: string;
  titulo: string;
  tipo: 'mercadoria' | 'servico' | 'agilitas' | 'devolucao';
  valor: number;
  tempoSegundos: number;
  feitaPeloBot: boolean;
  data: string;
  hora: string | null;
  empresa?: string;
  usuario?: string;
  fornecedorNome?: string;
  numeroNota?: string;
  especieDoc?: string;
}

interface NotaPorDiaEmpresa {
  data: string;
  empresa: string;
  total: number;
}

interface FiltrosData {
  empresas: string[];
  usuarios: string[];
  meses: string[];
  anos: number[];
}

interface BotStats {
  lancadas: number;
  tempoMedioSegundos: number;
  tempoMedioHumanoSegundos: number;
  horasEconomizadas: number;
  pct: number;
}

interface LancadorStats {
  usuario: string;
  total: number;
  bot: number;
  tempoMedioSegundos: number;
  valorTotal: number;
}

interface FluxoDia {
  dia: string;
  entradas: number;
  lancadas: number;
  lancadasBot: number;
  emAberto: number | null;
}

interface PorHora {
  hora: number;
  total: number;
  bot: number;
}

interface FechamentoCaixa {
  id: string;
  responsavel: string;
  data: string;
  aprovadoPelaApp: boolean;
  despesasReprovadasIA: number;
  itensDuplicados: number;
  valorDuplicado: number;
}

interface ConferenciaNota {
  id: string;
  titulo: string;
  tipo: 'servico' | 'mercadoria';
  erro: 'tipo_errado' | 'valor_errado' | 'fornecedor_errado' | string;
  valor: number;
  data: string;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const min = Math.floor((seconds % 3600) / 60);
  const sec = seconds % 60;
  if (h > 0) return sec > 0 ? `${h}h ${min}m ${sec}s` : `${h}h ${min}m`;
  return `${min}m ${sec}s`;
}

const tipoIcon: Record<string, React.ReactNode> = {
  mercadoria: <Package className="h-4 w-4 text-blue-500" />,
  servico: <Wrench className="h-4 w-4 text-green-500" />,
  agilitas: <Zap className="h-4 w-4 text-yellow-500" />,
};

const tipoLabel: Record<string, string> = {
  mercadoria: 'Mercadoria',
  servico: 'Serviço',
  agilitas: 'Agilitas',
  devolucao: 'Devolução',
};

const erroLabel: Record<string, string> = {
  tipo_errado: 'Tipo Errado',
  valor_errado: 'Valor Errado',
  fornecedor_errado: 'Fornecedor Errado',
  tes_errado: 'TES Errada',
  imposto_errado: 'Imposto Errado',
  doc_invalido: 'Documento Inválido',
  sem_documento: 'Sem Documento',
  outro: 'Outro',
};

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Multi-select compacto (checklist em dropdown) para ano/mês
function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string | number; label: string }[];
  selected: (string | number)[];
  onChange: (v: (string | number)[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
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
        className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background hover:bg-muted whitespace-nowrap"
      >
        {selected.length === 0
          ? label
          : `${label}: ${selected.length === 1 ? options.find((o) => o.value === selected[0])?.label : `${selected.length} selec.`}`}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 max-h-64 min-w-[10rem] overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-lg">
          <button
            type="button"
            onClick={() => onChange([])}
            className="block w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
          >
            Limpar
          </button>
          {options.map((o) => (
            <label
              key={String(o.value)}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="accent-primary"
              />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ResultadosPanel() {
  const [periodo, setPeriodo] = useState<'hoje' | 'semana' | 'mes' | 'tudo'>('hoje');
  const [refreshing, setRefreshing] = useState(false);
  const [notas, setNotas] = useState<NotaLancada[]>([]);
  const [fechamentos, setFechamentos] = useState<FechamentoCaixa[]>([]);
  const [conferencias, setConferencias] = useState<ConferenciaNota[]>([]);
  const [notasPorDiaEmpresa, setNotasPorDiaEmpresa] = useState<NotaPorDiaEmpresa[]>([]);
  const [filtrosData, setFiltrosData] = useState<FiltrosData>({ empresas: [], usuarios: [], meses: [], anos: [] });
  const [empresaSel, setEmpresaSel] = useState('all');
  const [usuarioSel, setUsuarioSel] = useState('all');
  const [anosSel, setAnosSel] = useState<(string | number)[]>([]);
  const [mesesSel, setMesesSel] = useState<(string | number)[]>([]);
  const [chartType, setChartType] = useState<'bar' | 'line'>('line');
  const [tipoSel, setTipoSel] = useState('all');
  const [totalNotas, setTotalNotas] = useState(0);
  const [tempoTotalNotas, setTempoTotalNotas] = useState(0);
  const [tempoMedioNotas, setTempoMedioNotas] = useState(0);
  const [notasBotApi, setNotasBotApi] = useState(0);
  const [valorTotalApi, setValorTotalApi] = useState(0);
  const [tiposCount, setTiposCount] = useState<Record<string, number>>({});
  const [botStats, setBotStats] = useState<BotStats | null>(null);
  const [porLancador, setPorLancador] = useState<LancadorStats[]>([]);
  const [fluxo, setFluxo] = useState<FluxoDia[]>([]);
  const [porHora, setPorHora] = useState<PorHora[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setor, setSetor] = useState<Setor>('all');
  const [exporting, setExporting] = useState(false);
  const reqSeq = React.useRef(0);

  const fetchData = useCallback(async () => {
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      // Ano/mês explícitos sobrepõem o período rápido (AND entre si)
      const customRange = anosSel.length > 0 || mesesSel.length > 0;
      const params = new URLSearchParams({ periodo: customRange ? 'tudo' : periodo });
      if (empresaSel !== 'all') params.set('empresa', empresaSel);
      if (usuarioSel !== 'all') params.set('usuario', usuarioSel);
      if (anosSel.length) params.set('anos', anosSel.join(','));
      if (mesesSel.length) params.set('meses', mesesSel.join(','));
      if (tipoSel !== 'all') params.set('tipo', tipoSel);
      const res = await fetch(`/api/resultados?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Erro ao buscar dados');
      const data = await res.json();
      if (seq !== reqSeq.current) return; // resposta antiga — descarta
      setNotas(data.notas || []);
      setFechamentos(data.fechamentos || []);
      setConferencias(data.conferencias || []);
      setNotasPorDiaEmpresa(data.notasPorDiaEmpresa || []);
      setFiltrosData(data.filtros || { empresas: [], usuarios: [], meses: [], anos: [] });
      setTotalNotas(data.totalNotas || 0);
      setTempoTotalNotas(data.tempoTotalNotas || 0);
      setTempoMedioNotas(data.tempoMedioNotas || 0);
      setNotasBotApi(data.notasBot || 0);
      setValorTotalApi(data.valorTotalNotas || 0);
      setTiposCount(data.tiposCount || {});
      setBotStats(data.bot || null);
      setPorLancador(data.porLancador || []);
      setFluxo(data.fluxo || []);
      setPorHora(data.porHora || []);
    } catch (err: any) {
      if (seq === reqSeq.current) setError(err.message || 'Erro ao carregar dados');
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [periodo, empresaSel, usuarioSel, tipoSel, anosSel, mesesSel]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const notasFiltradas = notas;
  const fechamentosFiltrados = fechamentos;
  const conferenciasFiltradas = conferencias;

  const notasSort = useTableSort(notasFiltradas);
  const fechSort = useTableSort(fechamentosFiltrados);
  const Th = ({ s, k, className, children }: { s: { sortKey: string | null; sortDir: 'asc' | 'desc'; toggleSort: (k: string) => void }; k: string; className?: string; children: ReactNode }) => (
    <th
      onClick={() => s.toggleSort(k)}
      className={`${className ?? ''} cursor-pointer select-none hover:bg-muted/60`}
      title="Clique para ordenar"
    >
      {children}
      <SortIcon active={s.sortKey === k} dir={s.sortDir} />
    </th>
  );

  // === Entrada de Notas ===
  // totalNotas, tempoTotalNotas, tempoMedioNotas, notasBot, valorTotal come from API (full count, not limited to 500)
  const notasBot = notasBotApi;
  const notasManual = totalNotas - notasBot;
  const valorTotalNotas = valorTotalApi;
  const pctBot = totalNotas > 0 ? (notasBot / totalNotas) * 100 : 0;

  const notasPorTipo = [
    { name: 'Mercadoria', value: tiposCount['mercadoria'] || 0, cor: '#3b82f6' },
    { name: 'Serviço', value: tiposCount['servico'] || 0, cor: '#22c55e' },
    { name: 'Agilitas', value: tiposCount['agilitas'] || 0, cor: '#f59e0b' },
    { name: 'Devolução', value: tiposCount['devolucao'] || 0, cor: '#ef4444' },
  ].filter(t => t.value > 0);

  // Notas por dia x empresa (para gráfico de linhas)
  const notasPorDiaEmpresaData = useMemo(() => {
    const porData: Record<string, Record<string, number>> = {};
    const empresasSet = new Set<string>();
    for (const r of notasPorDiaEmpresa) {
      if (!porData[r.data]) porData[r.data] = {};
      porData[r.data][r.empresa] = r.total;
      empresasSet.add(r.empresa);
    }
    const datas = Object.keys(porData).sort();
    const empresas = [...empresasSet].sort();
    return {
      data: datas.map(d => ({
        data: d.split('-').slice(1).join('/'),
        ...empresas.reduce((acc, e) => ({ ...acc, [e]: porData[d][e] || 0 }), {}),
      })),
      empresas,
    };
  }, [notasPorDiaEmpresa]);

  const EMPRESA_COLORS: Record<string, string> = {
    EQS: '#3b82f6',
    BRATEC: '#22c55e',
    AGILITAS: '#f59e0b',
  };

  // Visão "hoje" (sem filtros de ano/mês) — mostra lançamentos por hora
  const visaoHoje = periodo === 'hoje' && anosSel.length === 0 && mesesSel.length === 0;

  const porHoraChart = useMemo(() => {
    const map = new Map(porHora.map((h) => [h.hora, h]));
    const horas = porHora.map((h) => h.hora);
    const min = horas.length ? Math.min(...horas, 7) : 7;
    const max = horas.length ? Math.max(...horas, 19) : 19;
    const out: { h: string; bot: number; manual: number }[] = [];
    for (let h = min; h <= max; h++) {
      const r = map.get(h);
      out.push({ h: `${String(h).padStart(2, '0')}h`, bot: r?.bot ?? 0, manual: (r?.total ?? 0) - (r?.bot ?? 0) });
    }
    return out;
  }, [porHora]);

  // Fluxo diário formatado pro gráfico
  const fluxoChart = useMemo(
    () =>
      fluxo.map((f) => ({
        dia: f.dia.split('-').slice(1).join('/'),
        entradas: f.entradas,
        lancadas: f.lancadas,
        emAberto: f.emAberto,
      })),
    [fluxo],
  );

  // === Gestão de Caixa ===
  const totalFechamentos = fechamentosFiltrados.length;
  const fechamentosAprovadosApp = fechamentosFiltrados.filter(f => f.aprovadoPelaApp).length;
  const totalItensDuplicados = fechamentosFiltrados.reduce((s, f) => s + f.itensDuplicados, 0);
  const totalValorDuplicado = fechamentosFiltrados.reduce((s, f) => s + f.valorDuplicado, 0);
  const totalDespesasReprovadasIA = fechamentosFiltrados.reduce((s, f) => s + f.despesasReprovadasIA, 0);

  const fechamentosPorDia = useMemo(() => {
    const porData: Record<string, { aprovados: number; reprovados: number }> = {};
    for (const f of fechamentosFiltrados) {
      const dia = f.data;
      if (!porData[dia]) porData[dia] = { aprovados: 0, reprovados: 0 };
      if (f.aprovadoPelaApp) porData[dia].aprovados++;
      else porData[dia].reprovados++;
    }
    return Object.entries(porData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, v]) => ({ dia: dia.split('-').slice(1).join('/'), ...v }));
  }, [fechamentosFiltrados]);

  // === Conferências ===
  const totalConferencias = conferenciasFiltradas.length;
  const valorTotalConferencias = conferenciasFiltradas.reduce((s, c) => s + c.valor, 0);
  const conferenciasServico = conferenciasFiltradas.filter(c => c.tipo === 'servico').length;
  const conferenciasMercadoria = conferenciasFiltradas.filter(c => c.tipo === 'mercadoria').length;

  const ERRO_CORES = ['#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b'];
  const conferenciasPorErro = Object.entries(
    conferenciasFiltradas.reduce<Record<string, number>>((acc, c) => {
      acc[c.erro] = (acc[c.erro] || 0) + 1;
      return acc;
    }, {})
  ).map(([erro, value], i) => ({
    name: erroLabel[erro] || erro,
    value,
    cor: ERRO_CORES[i % ERRO_CORES.length],
  }));

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  // Exporta um xlsx com 3 abas: Notas, Fechamentos e Conferências —
  // respeita os filtros ativos (período, empresa, usuário, tipo).
  const exportXlsx = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      const notasRows = notasSort.sortedRows.map((n) => ({
        Nota: n.numeroNota || n.titulo,
        Empresa: n.empresa || '',
        Fornecedor: n.fornecedorNome || '',
        'Usuário': n.usuario || '',
        Tipo: tipoLabel[n.tipo] || n.tipo,
        'Valor (R$)': n.valor,
        'Tempo (s)': n.tempoSegundos ?? '',
        Origem: n.feitaPeloBot ? 'Bot' : 'Manual',
        Data: n.data,
        Hora: n.hora || '',
      }));
      const wsNotas = XLSX.utils.json_to_sheet(notasRows);
      wsNotas['!cols'] = [{ wch: 14 }, { wch: 8 }, { wch: 36 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 11 }, { wch: 9 }];
      XLSX.utils.book_append_sheet(wb, wsNotas, 'Notas');

      const fechRows = fechSort.sortedRows.map((f) => ({
        Data: f.data,
        'Responsável': f.responsavel,
        Status: f.aprovadoPelaApp ? 'Aprovado' : 'Automático',
        'Itens duplicados': f.itensDuplicados,
        'Valor duplicado (R$)': f.valorDuplicado,
        'Reprovados IA': f.despesasReprovadasIA,
      }));
      const wsFech = XLSX.utils.json_to_sheet(fechRows);
      wsFech['!cols'] = [{ wch: 11 }, { wch: 26 }, { wch: 11 }, { wch: 16 }, { wch: 18 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsFech, 'Fechamentos');

      const confRows = conferenciasFiltradas.map((c) => ({
        'Título': c.titulo,
        Tipo: c.tipo === 'servico' ? 'Serviço' : 'Mercadoria',
        Erro: erroLabel[c.erro] || c.erro,
        'Valor (R$)': c.valor,
        Data: c.data,
      }));
      const wsConf = XLSX.utils.json_to_sheet(confRows);
      wsConf['!cols'] = [{ wch: 50 }, { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 11 }];
      XLSX.utils.book_append_sheet(wb, wsConf, 'Conferências');

      XLSX.writeFile(wb, `resultados_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Chips de setor */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SetorChips value={setor} onChange={setSetor} />
        <Button variant="outline" size="sm" onClick={exportXlsx} disabled={exporting || loading}>
          {exporting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />}
          Exportar Excel
        </Button>
      </div>

      {/* Toolbar de filtros */}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(['hoje', 'semana', 'mes', 'tudo'] as const).map(p => (
            <button
              key={p}
              onClick={() => {
                if (p === periodo && anosSel.length === 0 && mesesSel.length === 0) {
                  fetchData(); // clicar no período já ativo = atualizar
                } else {
                  setPeriodo(p); setAnosSel([]); setMesesSel([]);
                }
              }}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                periodo === p && anosSel.length === 0 && mesesSel.length === 0
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background hover:bg-muted'
              }`}
            >
              {p === 'hoje' ? 'Hoje' : p === 'semana' ? 'Semana' : p === 'mes' ? '30 dias' : 'Tudo'}
            </button>
          ))}
        </div>
        <MultiSelect
          label="Ano"
          options={filtrosData.anos.map((a) => ({ value: a, label: String(a) }))}
          selected={anosSel}
          onChange={setAnosSel}
        />
        <MultiSelect
          label="Mês"
          options={MESES_ABREV.map((m, i) => ({ value: i + 1, label: m }))}
          selected={mesesSel}
          onChange={setMesesSel}
        />
        <select
          value={empresaSel}
          onChange={(e) => setEmpresaSel(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background"
        >
          <option value="all">Todas empresas</option>
          {filtrosData.empresas.map(e => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <select
          value={usuarioSel}
          onChange={(e) => setUsuarioSel(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background"
        >
          <option value="all">Todos usuários</option>
          {filtrosData.usuarios.map(u => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <select
          value={tipoSel}
          onChange={(e) => setTipoSel(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background"
        >
          <option value="all">Todos os tipos</option>
          <option value="mercadoria">Mercadoria</option>
          <option value="servico">Serviço</option>
          <option value="agilitas">Agilitas</option>
          <option value="devolucao">Devolução</option>
        </select>
        <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Carregando dados...</span>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center py-12 text-red-500">
          <AlertTriangle className="h-5 w-5 mr-2" />
          <span>Erro: {error}</span>
        </div>
      )}

      {/* === SEÇÃO 1: ENTRADA DE NOTAS === */}
      {!loading && !error && (setor === 'all' || setor === 'entrada') && (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-semibold">Entrada de Notas</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-full">
            <Card className="flex h-full flex-col justify-center">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Notas Lançadas</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalNotas.toLocaleString('pt-BR')}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="text-green-600">{notasBot} pelo bot</span>
                  {' · '}
                  <span className="text-blue-600">{notasManual} manuais</span>
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="h-full">
            <Card className="flex h-full flex-col justify-center">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tempo Total</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatTime(Math.round(tempoTotalNotas))}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Média: {formatTime(Math.round(tempoMedioNotas))} por nota
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="h-full">
            <Card className="flex h-full flex-col justify-center">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(valorTotalNotas)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Média: {formatCurrency(totalNotas > 0 ? valorTotalNotas / totalNotas : 0)} por nota
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="h-full">
            <Card className="flex h-full flex-col justify-center">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Feitas pelo Bot</CardTitle>
                <Bot className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {pctBot > 0 ? pctBot.toFixed(0) : 0}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {notasBot} de {totalNotas} notas
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Fluxo diário da fila: entradas x lançadas x profundidade em aberto.
            Une pendências (fila atual) e resultados (o que saiu) — responde
            "entrou mais nota do que saiu?" */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fluxo da Fila — últimos 30 dias</CardTitle>
            <span className="text-xs text-muted-foreground">
              Entradas no monitor vs lançadas no Protheus; linha = notas em aberto na fila contábil
            </span>
          </CardHeader>
          <CardContent>
            {fluxoChart.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados para exibir</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={fluxoChart}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="dia" className="text-xs" />
                  <YAxis yAxisId="left" className="text-xs" />
                  <YAxis yAxisId="right" orientation="right" className="text-xs" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="entradas" name="Entradas" fill={COLORS.cyan} radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="left" dataKey="lancadas" name="Lançadas" fill={COLORS.success} radius={[3, 3, 0, 0]} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="emAberto"
                    name="Em aberto"
                    stroke={COLORS.danger}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Automação: desempenho do bot e ranking por lançador */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">Lançamentos por Lançador</CardTitle>
            </CardHeader>
            <CardContent>
              {porLancador.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sem dados para exibir</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={porLancador} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis type="category" dataKey="usuario" width={110} className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="total" name="Notas" fill={COLORS.primary} radius={[0, 4, 4, 0]}>
                      {porLancador.map((l, i) => (
                        <Cell key={i} fill={l.usuario.startsWith('bot.') ? COLORS.success : COLORS.primary} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="h-4 w-4 text-green-600" /> Automação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Tempo médio (bot)</p>
                  <p className="text-xl font-bold text-green-600">
                    {formatTime(Math.round(botStats?.tempoMedioSegundos ?? 0))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tempo médio (manual)</p>
                  <p className="text-xl font-bold">
                    {formatTime(Math.round(botStats?.tempoMedioHumanoSegundos ?? 0))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Horas economizadas</p>
                  <p className="text-xl font-bold text-green-600">
                    {(botStats?.horasEconomizadas ?? 0).toFixed(1)}h
                  </p>
                  <p className="text-xs text-muted-foreground">estimado no período</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Velocidade</p>
                  <p className="text-xl font-bold text-green-600">
                    {(botStats?.tempoMedioSegundos ?? 0) > 0
                      ? `${((botStats!.tempoMedioHumanoSegundos) / botStats!.tempoMedioSegundos).toFixed(1)}×`
                      : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">vs lançamento manual</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos Entrada de Notas — na visão "hoje" o por-dia vira ponto
            único; trocamos por lançamentos por hora */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="lg:col-span-2">
            {visaoHoje ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lançamentos por Hora</CardTitle>
                <span className="text-xs text-muted-foreground">hoje, bot vs manual</span>
              </CardHeader>
              <CardContent>
                {porHora.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhum lançamento hoje</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={porHoraChart}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="h" className="text-xs" />
                      <YAxis className="text-xs" allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="bot" name="Bot" stackId="a" fill={COLORS.success} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="manual" name="Manual" stackId="a" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Notas por Dia por Empresa</CardTitle>
                <div className="flex rounded-lg border border-border overflow-hidden">
                  <button
                    onClick={() => setChartType('line')}
                    className={`px-3 py-1 text-xs font-medium ${chartType === 'line' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
                  >Linha</button>
                  <button
                    onClick={() => setChartType('bar')}
                    className={`px-3 py-1 text-xs font-medium ${chartType === 'bar' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
                  >Barra</button>
                </div>
              </CardHeader>
              <CardContent>
                {notasPorDiaEmpresaData.data.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    {chartType === 'line' ? (
                      <LineChart data={notasPorDiaEmpresaData.data}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="data" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip />
                        <Legend />
                        {notasPorDiaEmpresaData.empresas.map(empresa => (
                          <Line
                            key={empresa}
                            type="monotone"
                            dataKey={empresa}
                            stroke={EMPRESA_COLORS[empresa] || COLORS.purple}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                        ))}
                      </LineChart>
                    ) : (
                      <BarChart data={notasPorDiaEmpresaData.data}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="data" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip />
                        <Legend />
                        {notasPorDiaEmpresaData.empresas.map(empresa => (
                          <Bar
                            key={empresa}
                            dataKey={empresa}
                            fill={EMPRESA_COLORS[empresa] || COLORS.purple}
                            radius={[4, 4, 0, 0]}
                          />
                        ))}
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Sem dados para exibir</p>
                )}
              </CardContent>
            </Card>
            )}
          </div>

          <div className="h-full">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-base">Distribuição por Tipo</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={notasPorTipo}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      dataKey="value"
                    >
                      {notasPorTipo.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.cor} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </div>

      </div>
      )}

      {/* === SEÇÃO 2: GESTÃO DE CAIXA === */}
      {!loading && !error && (setor === 'all' || setor === 'caixa') && (
      <div className="space-y-4 pt-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-purple-500" />
          <h2 className="text-lg font-semibold">Gestão de Caixa</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-full">
            <Card className="flex h-full flex-col justify-center">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Fechamentos Feitos</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalFechamentos}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {fechamentosAprovadosApp} aprovados pela aplicação
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="h-full">
            <Card className="flex h-full flex-col justify-center">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Itens Duplicados</CardTitle>
                <Copy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-500">{totalItensDuplicados}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Valor: {formatCurrency(totalValorDuplicado)}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="h-full">
            <Card className="flex h-full flex-col justify-center">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Caixas Aprovados (App)</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{fechamentosAprovadosApp}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalFechamentos > 0 ? ((fechamentosAprovadosApp / totalFechamentos) * 100).toFixed(0) : 0}% do total
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="h-full">
            <Card className="flex h-full flex-col justify-center">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Despesas Reprovadas (IA)</CardTitle>
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">{totalDespesasReprovadasIA}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Identificadas pela IA
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Gráficos Gestão de Caixa */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-full">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-base">Fechamentos por Dia</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={fechamentosPorDia}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="dia" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="aprovados" name="Aprovados" fill={COLORS.success} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="reprovados" name="Reprovados" fill={COLORS.danger} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="h-full">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-base">Histórico de Fechamentos</CardTitle>
              </CardHeader>
              <CardContent>
                {fechamentosFiltrados.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum fechamento encontrado</p>
                ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <Th s={fechSort} k="data" className="text-left py-2 px-3 font-medium text-muted-foreground">Data</Th>
                        <Th s={fechSort} k="responsavel" className="text-left py-2 px-3 font-medium text-muted-foreground">Responsável</Th>
                        <Th s={fechSort} k="aprovadoPelaApp" className="text-center py-2 px-3 font-medium text-muted-foreground">Status</Th>
                        <Th s={fechSort} k="itensDuplicados" className="text-right py-2 px-3 font-medium text-muted-foreground">Duplicados</Th>
                        <Th s={fechSort} k="valorDuplicado" className="text-right py-2 px-3 font-medium text-muted-foreground">Valor Duplicado</Th>
                        <Th s={fechSort} k="despesasReprovadasIA" className="text-right py-2 px-3 font-medium text-muted-foreground">Reprovados IA</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {fechSort.sortedRows.map(f => (
                        <tr key={f.id} className="border-b hover:bg-muted/50">
                          <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">{f.data}</td>
                          <td className="py-2.5 px-3 font-medium">{f.responsavel}</td>
                          <td className="py-2.5 px-3 text-center">
                            {f.aprovadoPelaApp ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                                <CheckCircle className="h-3.5 w-3.5" /> Aprovado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3.5 w-3.5" /> Automático
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {f.itensDuplicados > 0 ? (
                              <span className="font-semibold text-orange-500">{f.itensDuplicados}</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {f.valorDuplicado > 0 ? (
                              <span className="font-semibold">{formatCurrency(f.valorDuplicado)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {f.despesasReprovadasIA > 0 ? (
                              <span className="font-semibold text-red-500">{f.despesasReprovadasIA}</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      )}

      {/* === SEÇÃO 3: CONFERÊNCIAS (erros de entrada) === */}
      {!loading && !error && (setor === 'all' || setor === 'entrada') && (
      <div className="space-y-4 pt-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          <h2 className="text-lg font-semibold">Conferências</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-full">
            <Card className="flex h-full flex-col justify-center">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Notas Erradas (Serviço)</CardTitle>
                <Wrench className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">{conferenciasServico}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Notas de serviço com erro
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="h-full">
            <Card className="flex h-full flex-col justify-center">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Notas Erradas (Mercadoria)</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">{conferenciasMercadoria}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Notas de mercadoria com erro
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="h-full">
            <Card className="flex h-full flex-col justify-center">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Valor Total em Erro</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">{formatCurrency(valorTotalConferencias)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalConferencias} notas conferidas com erro
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Gráficos Conferências */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-full">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-base">Erros por Tipo</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={conferenciasPorErro}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      dataKey="value"
                    >
                      {conferenciasPorErro.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.cor} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="h-full">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-base">Notas com Erro - Detalhes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  {conferenciasFiltradas.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhuma conferência encontrada</p>
                  ) : (
                  conferenciasFiltradas.map(conf => (
                    <div key={conf.id} className="flex items-start justify-between p-3 rounded-lg border gap-3">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        {conf.tipo === 'servico' ? (
                          <Wrench className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        ) : (
                          <Package className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{conf.titulo}</p>
                          <p className="text-xs text-muted-foreground">
                            {conf.data} · {erroLabel[conf.erro] || conf.erro}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-red-500">{formatCurrency(conf.valor)}</p>
                      </div>
                    </div>
                  ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      )}

      {/* Tabela de Notas Recentes — por último: são até 500 linhas e
          escondiam as seções de Conferências/Gestão atrás de scroll longo */}
      {!loading && !error && (setor === 'all' || setor === 'entrada') && notasFiltradas.length > 0 && (
      <div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notas Lançadas Recentemente</CardTitle>
            <span className="text-xs text-muted-foreground">{notasFiltradas.length} notas (máx. 500)</span>
          </CardHeader>
          <CardContent>
            <div className="max-h-[560px] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b">
                    <Th s={notasSort} k="numeroNota" className="text-left py-2 px-3 font-medium text-muted-foreground">Nota</Th>
                    <Th s={notasSort} k="empresa" className="text-left py-2 px-3 font-medium text-muted-foreground">Empresa</Th>
                    <Th s={notasSort} k="fornecedorNome" className="text-left py-2 px-3 font-medium text-muted-foreground">Fornecedor</Th>
                    <Th s={notasSort} k="usuario" className="text-left py-2 px-3 font-medium text-muted-foreground">Usuário</Th>
                    <Th s={notasSort} k="tipo" className="text-left py-2 px-3 font-medium text-muted-foreground">Tipo</Th>
                    <Th s={notasSort} k="valor" className="text-right py-2 px-3 font-medium text-muted-foreground">Valor</Th>
                    <Th s={notasSort} k="feitaPeloBot" className="text-center py-2 px-3 font-medium text-muted-foreground">Bot</Th>
                  </tr>
                </thead>
                <tbody>
                  {notasSort.sortedRows.map(nota => (
                    <tr key={nota.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3 text-xs">{nota.numeroNota || nota.titulo}</td>
                      <td className="py-2 px-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${nota.empresa === 'EQS' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{nota.empresa || '—'}</span>
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground max-w-[200px] truncate">{nota.fornecedorNome || '—'}</td>
                      <td className="py-2 px-3 text-xs">{nota.usuario || '—'}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          {tipoIcon[nota.tipo] || <Package className="h-4 w-4 text-gray-400" />}
                          <span className="text-xs">{tipoLabel[nota.tipo] || nota.tipo}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-xs">{formatCurrency(nota.valor)}</td>
                      <td className="py-2 px-3 text-center">
                        {nota.feitaPeloBot ? (
                          <Bot className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <span className="text-muted-foreground text-xs">Manual</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Contas a Pagar — ainda sem fonte de dados nesta visão */}
      {setor === 'pagar' && <SetorEmpty setor={setor} />}

      {/* Footer info */}
      <div className="flex items-center justify-center gap-2 pt-4 text-xs text-muted-foreground">
        <AlertTriangle className="h-3 w-3" />
        <span>
          Dados em tempo real — alimentados pelas tabelas <code>resultados_notas</code>, <code>resultados_fechamentos</code> e <code>resultados_conferencias</code>.
        </span>
      </div>
    </div>
  );
}
