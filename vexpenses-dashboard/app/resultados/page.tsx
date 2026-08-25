'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Trophy,
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
  TrendingUp,
  Package,
  Wrench,
  Zap,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
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

export const dynamic = 'force-dynamic';

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

const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

interface NotaLancada {
  id: string;
  titulo: string;
  tipo: 'mercadoria' | 'servico' | 'agil' | 'devolucao';
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
  erro: 'tipo_errado' | 'valor_errado' | 'fornecedor_errado';
  valor: number;
  data: string;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}m ${sec}s`;
}

const tipoIcon: Record<string, React.ReactNode> = {
  mercadoria: <Package className="h-4 w-4 text-blue-500" />,
  servico: <Wrench className="h-4 w-4 text-green-500" />,
  agil: <Zap className="h-4 w-4 text-yellow-500" />,
};

const tipoLabel: Record<string, string> = {
  mercadoria: 'Mercadoria',
  servico: 'Serviço',
  agil: 'Ágil',
  devolucao: 'Devolução',
};

const erroLabel: Record<string, string> = {
  tipo_errado: 'Tipo Errado',
  valor_errado: 'Valor Errado',
  fornecedor_errado: 'Fornecedor Errado',
};

const MESES_NOME: Record<string, string> = {
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
  '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
  '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro',
};

function mesLabel(mes: string): string {
  const [ano, num] = mes.split('-');
  return `${MESES_NOME[num] || num}/${ano}`;
}

export default function ResultadosPage() {
  const [periodo, setPeriodo] = useState<'hoje' | 'semana' | 'mes'>('mes');
  const [refreshing, setRefreshing] = useState(false);
  const [notas, setNotas] = useState<NotaLancada[]>([]);
  const [fechamentos, setFechamentos] = useState<FechamentoCaixa[]>([]);
  const [conferencias, setConferencias] = useState<ConferenciaNota[]>([]);
  const [notasPorDiaEmpresa, setNotasPorDiaEmpresa] = useState<NotaPorDiaEmpresa[]>([]);
  const [filtrosData, setFiltrosData] = useState<FiltrosData>({ empresas: [], usuarios: [], meses: [] });
  const [empresaSel, setEmpresaSel] = useState('all');
  const [usuarioSel, setUsuarioSel] = useState('all');
  const [mesSel, setMesSel] = useState('all');
  const [chartType, setChartType] = useState<'bar' | 'line'>('line');
  const [tipoSel, setTipoSel] = useState('all');
  const [totalNotas, setTotalNotas] = useState(0);
  const [tempoTotalNotas, setTempoTotalNotas] = useState(0);
  const [tempoMedioNotas, setTempoMedioNotas] = useState(0);
  const [notasBotApi, setNotasBotApi] = useState(0);
  const [valorTotalApi, setValorTotalApi] = useState(0);
  const [tiposCount, setTiposCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ periodo });
      if (empresaSel !== 'all') params.set('empresa', empresaSel);
      if (usuarioSel !== 'all') params.set('usuario', usuarioSel);
      if (mesSel !== 'all') params.set('mes', mesSel);
      if (tipoSel !== 'all') params.set('tipo', tipoSel);
      const res = await fetch(`/api/resultados?${params.toString()}`);
      if (!res.ok) throw new Error('Erro ao buscar dados');
      const data = await res.json();
      setNotas(data.notas || []);
      setFechamentos(data.fechamentos || []);
      setConferencias(data.conferencias || []);
      setNotasPorDiaEmpresa(data.notasPorDiaEmpresa || []);
      setFiltrosData(data.filtros || { empresas: [], usuarios: [], meses: [] });
      setTotalNotas(data.totalNotas || 0);
      setTempoTotalNotas(data.tempoTotalNotas || 0);
      setTempoMedioNotas(data.tempoMedioNotas || 0);
      setNotasBotApi(data.notasBot || 0);
      setValorTotalApi(data.valorTotalNotas || 0);
      setTiposCount(data.tiposCount || {});
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [periodo, empresaSel, usuarioSel, mesSel, tipoSel]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const notasFiltradas = notas;
  const fechamentosFiltrados = fechamentos;
  const conferenciasFiltradas = conferencias;

  // === Entrada de Notas ===
  // totalNotas, tempoTotalNotas, tempoMedioNotas, notasBot, valorTotal come from API (full count, not limited to 500)
  const notasBot = notasBotApi;
  const notasManual = totalNotas - notasBot;
  const valorTotalNotas = valorTotalApi;
  const pctBot = totalNotas > 0 ? (notasBot / totalNotas) * 100 : 0;

  const notasPorTipo = [
    { name: 'Mercadoria', value: tiposCount['mercadoria'] || 0, cor: '#3b82f6' },
    { name: 'Serviço', value: tiposCount['servico'] || 0, cor: '#22c55e' },
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
  };

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

  const conferenciasPorErro = [
    { name: 'Tipo Errado', value: conferenciasFiltradas.filter(c => c.erro === 'tipo_errado').length, cor: '#ef4444' },
    { name: 'Valor Errado', value: conferenciasFiltradas.filter(c => c.erro === 'valor_errado').length, cor: '#f59e0b' },
    { name: 'Fornecedor Errado', value: conferenciasFiltradas.filter(c => c.erro === 'fornecedor_errado').length, cor: '#8b5cf6' },
  ];

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trophy className="h-8 w-8 text-yellow-500" />
          <div>
            <h1 className="text-2xl font-bold">Resultados</h1>
            <p className="text-sm text-muted-foreground">Métricas de produtividade e qualidade</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['hoje', 'semana', 'mes'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  periodo === p
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-muted'
                }`}
              >
                {p === 'hoje' ? 'Hoje' : p === 'semana' ? 'Semana' : 'Mês'}
              </button>
            ))}
          </div>
          <select
            value={mesSel}
            onChange={(e) => setMesSel(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background"
          >
            <option value="all">Todos os meses</option>
            {filtrosData.meses.map(m => (
              <option key={m} value={m}>{mesLabel(m)}</option>
            ))}
          </select>
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
            <option value="devolucao">Devolução</option>
          </select>
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
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
      {!loading && !error && (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-semibold">Entrada de Notas</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Card>
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

          <div>
            <Card>
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

          <div>
            <Card>
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

          <div>
            <Card>
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

        {/* Gráficos Entrada de Notas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="lg:col-span-2">
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
          </div>

          <div>
            <Card>
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

        {/* Tabela de Notas Recentes */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notas Lançadas Recentemente</CardTitle>
              <span className="text-xs text-muted-foreground">{notasFiltradas.length} notas (máx. 500)</span>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Nota</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Empresa</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Fornecedor</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Usuário</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Tipo</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">Valor</th>
                      <th className="text-center py-2 px-3 font-medium text-muted-foreground">Bot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notasFiltradas.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-4 text-center text-muted-foreground">Nenhuma nota encontrada</td>
                      </tr>
                    ) : (
                    notasFiltradas.map(nota => (
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
                    ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      )}

      {/* === SEÇÃO 2: GESTÃO DE CAIXA === */}
      {!loading && !error && (
      <div className="space-y-4 pt-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-purple-500" />
          <h2 className="text-lg font-semibold">Gestão de Caixa</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Card>
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

          <div>
            <Card>
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

          <div>
            <Card>
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

          <div>
            <Card>
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
          <div>
            <Card>
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

          <div>
            <Card>
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
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Data</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Responsável</th>
                        <th className="text-center py-2 px-3 font-medium text-muted-foreground">Status</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Duplicados</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Valor Duplicado</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Reprovados IA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fechamentosFiltrados.map(f => (
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

      {/* === SEÇÃO 3: CONFERÊNCIAS === */}
      {!loading && !error && (
      <div className="space-y-4 pt-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          <h2 className="text-lg font-semibold">Conferências</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Card>
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

          <div>
            <Card>
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

          <div>
            <Card>
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
          <div>
            <Card>
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

          <div>
            <Card>
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
                            {conf.data} · {erroLabel[conf.erro]}
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
