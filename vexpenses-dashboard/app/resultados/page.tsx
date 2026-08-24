'use client';

import React, { useState, useMemo } from 'react';
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

const MOCK_BADGE = (
  <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5 ml-2 whitespace-nowrap">
    MOCK
  </Badge>
);

function MockCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <div className="absolute -top-2 -right-2 z-10">
        <Badge variant="destructive" className="text-[10px] px-2 py-0.5 shadow-md">
          DADOS MOCKADOS
        </Badge>
      </div>
      {children}
    </div>
  );
}

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
  tipo: 'mercadoria' | 'servico' | 'agil';
  valor: number;
  tempoSegundos: number;
  feitaPeloBot: boolean;
  data: string;
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

const mockNotas: NotaLancada[] = [
  { id: '1', titulo: 'Nota Fiscal 001 - Material de Escritório', tipo: 'mercadoria', valor: 1250.50, tempoSegundos: 45, feitaPeloBot: true, data: '2026-08-24' },
  { id: '2', titulo: 'Nota Fiscal 002 - Serviço de Limpeza', tipo: 'servico', valor: 890.00, tempoSegundos: 120, feitaPeloBot: false, data: '2026-08-24' },
  { id: '3', titulo: 'Nota Fiscal 003 - Combustível', tipo: 'agil', valor: 320.75, tempoSegundos: 30, feitaPeloBot: true, data: '2026-08-24' },
  { id: '4', titulo: 'Nota Fiscal 004 - Peças de Reposição', tipo: 'mercadoria', valor: 2100.00, tempoSegundos: 90, feitaPeloBot: false, data: '2026-08-24' },
  { id: '5', titulo: 'Nota Fiscal 005 - Consultoria Técnica', tipo: 'servico', valor: 3500.00, tempoSegundos: 60, feitaPeloBot: true, data: '2026-08-24' },
  { id: '6', titulo: 'Nota Fiscal 006 - Material Elétrico', tipo: 'mercadoria', valor: 680.30, tempoSegundos: 35, feitaPeloBot: true, data: '2026-08-24' },
  { id: '7', titulo: 'Nota Fiscal 007 - Manutenção Predial', tipo: 'servico', valor: 1500.00, tempoSegundos: 75, feitaPeloBot: false, data: '2026-08-24' },
  { id: '8', titulo: 'Nota Fiscal 008 - Despesas Ágeis', tipo: 'agil', valor: 150.00, tempoSegundos: 20, feitaPeloBot: true, data: '2026-08-24' },
  { id: '9', titulo: 'Nota Fiscal 009 - Equipamentos', tipo: 'mercadoria', valor: 4200.00, tempoSegundos: 110, feitaPeloBot: false, data: '2026-08-24' },
  { id: '10', titulo: 'Nota Fiscal 010 - Serviço de TI', tipo: 'servico', valor: 2200.00, tempoSegundos: 50, feitaPeloBot: true, data: '2026-08-24' },
];

const mockFechamentos: FechamentoCaixa[] = [
  { id: '1', responsavel: 'Letícia', data: '2026-08-24', aprovadoPelaApp: true, despesasReprovadasIA: 3, itensDuplicados: 2, valorDuplicado: 450.00 },
  { id: '2', responsavel: 'Beatriz', data: '2026-08-24', aprovadoPelaApp: true, despesasReprovadasIA: 1, itensDuplicados: 0, valorDuplicado: 0 },
  { id: '3', responsavel: 'Letícia', data: '2026-08-23', aprovadoPelaApp: false, despesasReprovadasIA: 5, itensDuplicados: 4, valorDuplicado: 1200.00 },
  { id: '4', responsavel: 'Carlos', data: '2026-08-23', aprovadoPelaApp: true, despesasReprovadasIA: 2, itensDuplicados: 1, valorDuplicado: 180.00 },
  { id: '5', responsavel: 'Beatriz', data: '2026-08-22', aprovadoPelaApp: true, despesasReprovadasIA: 0, itensDuplicados: 3, valorDuplicado: 670.00 },
];

const mockConferencias: ConferenciaNota[] = [
  { id: '1', titulo: 'NF 1234 - Serviço classificado como mercadoria', tipo: 'servico', erro: 'tipo_errado', valor: 890.00, data: '2026-08-24' },
  { id: '2', titulo: 'NF 1235 - Mercadoria classificada como serviço', tipo: 'mercadoria', erro: 'tipo_errado', valor: 1250.50, data: '2026-08-24' },
  { id: '3', titulo: 'NF 1236 - Serviço com valor divergente', tipo: 'servico', erro: 'valor_errado', valor: 2100.00, data: '2026-08-23' },
  { id: '4', titulo: 'NF 1237 - Mercadoria com fornecedor incorreto', tipo: 'mercadoria', erro: 'fornecedor_errado', valor: 680.30, data: '2026-08-23' },
  { id: '5', titulo: 'NF 1238 - Serviço classificado errado', tipo: 'servico', erro: 'tipo_errado', valor: 3500.00, data: '2026-08-22' },
];

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
};

const erroLabel: Record<string, string> = {
  tipo_errado: 'Tipo Errado',
  valor_errado: 'Valor Errado',
  fornecedor_errado: 'Fornecedor Errado',
};

export default function ResultadosPage() {
  const [periodo, setPeriodo] = useState<'hoje' | 'semana' | 'mes'>('hoje');
  const [refreshing, setRefreshing] = useState(false);

  const notasFiltradas = useMemo(() => {
    return mockNotas;
  }, [periodo]);

  const fechamentosFiltrados = useMemo(() => {
    return mockFechamentos;
  }, [periodo]);

  const conferenciasFiltradas = useMemo(() => {
    return mockConferencias;
  }, [periodo]);

  // === Entrada de Notas ===
  const totalNotas = notasFiltradas.length;
  const notasBot = notasFiltradas.filter(n => n.feitaPeloBot).length;
  const notasManual = totalNotas - notasBot;
  const valorTotalNotas = notasFiltradas.reduce((s, n) => s + n.valor, 0);
  const tempoTotalNotas = notasFiltradas.reduce((s, n) => s + n.tempoSegundos, 0);
  const tempoMedio = totalNotas > 0 ? tempoTotalNotas / totalNotas : 0;

  const notasPorTipo = [
    { name: 'Mercadoria', value: notasFiltradas.filter(n => n.tipo === 'mercadoria').length, cor: '#3b82f6' },
    { name: 'Serviço', value: notasFiltradas.filter(n => n.tipo === 'servico').length, cor: '#22c55e' },
    { name: 'Ágil', value: notasFiltradas.filter(n => n.tipo === 'agil').length, cor: '#f59e0b' },
  ];

  const notasPorHora = [
    { hora: '08h', bot: 2, manual: 1 },
    { hora: '09h', bot: 3, manual: 2 },
    { hora: '10h', bot: 1, manual: 1 },
    { hora: '11h', bot: 2, manual: 0 },
    { hora: '12h', bot: 0, manual: 1 },
    { hora: '14h', bot: 3, manual: 1 },
    { hora: '15h', bot: 1, manual: 2 },
    { hora: '16h', bot: 2, manual: 1 },
  ];

  // === Gestão de Caixa ===
  const totalFechamentos = fechamentosFiltrados.length;
  const fechamentosAprovadosApp = fechamentosFiltrados.filter(f => f.aprovadoPelaApp).length;
  const totalItensDuplicados = fechamentosFiltrados.reduce((s, f) => s + f.itensDuplicados, 0);
  const totalValorDuplicado = fechamentosFiltrados.reduce((s, f) => s + f.valorDuplicado, 0);
  const totalDespesasReprovadasIA = fechamentosFiltrados.reduce((s, f) => s + f.despesasReprovadasIA, 0);

  const fechamentosPorDia = [
    { dia: '22/08', aprovados: 1, reprovados: 0 },
    { dia: '23/08', aprovados: 1, reprovados: 1 },
    { dia: '24/08', aprovados: 2, reprovados: 0 },
  ];

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

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
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
        <div className="flex items-center gap-2">
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
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* === SEÇÃO 1: ENTRADA DE NOTAS === */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-semibold">Entrada de Notas</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MockCard>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Notas Lançadas</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalNotas}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="text-green-600">{notasBot} pelo bot</span>
                  {' · '}
                  <span className="text-blue-600">{notasManual} manuais</span>
                </p>
              </CardContent>
            </Card>
          </MockCard>

          <MockCard>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tempo Total</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatTime(tempoTotalNotas)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Média: {formatTime(Math.round(tempoMedio))} por nota
                </p>
              </CardContent>
            </Card>
          </MockCard>

          <MockCard>
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
          </MockCard>

          <MockCard>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Feitas pelo Bot</CardTitle>
                <Bot className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {((notasBot / totalNotas) * 100).toFixed(0)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {notasBot} de {totalNotas} notas
                </p>
              </CardContent>
            </Card>
          </MockCard>
        </div>

        {/* Gráficos Entrada de Notas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MockCard>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notas por Hora (Bot vs Manual)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={notasPorHora}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="hora" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="bot" name="Bot" fill={COLORS.success} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="manual" name="Manual" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </MockCard>

          <MockCard>
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
          </MockCard>
        </div>

        {/* Tabela de Notas Recentes */}
        <MockCard>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notas Lançadas Recentemente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Nota</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Tipo</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">Valor</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">Tempo</th>
                      <th className="text-center py-2 px-3 font-medium text-muted-foreground">Bot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notasFiltradas.map(nota => (
                      <tr key={nota.id} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-3">{nota.titulo}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5">
                            {tipoIcon[nota.tipo]}
                            <span>{tipoLabel[nota.tipo]}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right font-mono">{formatCurrency(nota.valor)}</td>
                        <td className="py-2 px-3 text-right text-muted-foreground">{formatTime(nota.tempoSegundos)}</td>
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
        </MockCard>
      </div>

      {/* === SEÇÃO 2: GESTÃO DE CAIXA === */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-purple-500" />
          <h2 className="text-lg font-semibold">Gestão de Caixa</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MockCard>
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
          </MockCard>

          <MockCard>
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
          </MockCard>

          <MockCard>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Caixas Aprovados (App)</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{fechamentosAprovadosApp}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {((fechamentosAprovadosApp / totalFechamentos) * 100).toFixed(0)}% do total
                </p>
              </CardContent>
            </Card>
          </MockCard>

          <MockCard>
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
          </MockCard>
        </div>

        {/* Gráficos Gestão de Caixa */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MockCard>
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
          </MockCard>

          <MockCard>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resumo de Duplicidades</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {fechamentosFiltrados.map(f => (
                  <div key={f.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ${f.aprovadoPelaApp ? 'bg-green-500' : 'bg-red-500'}`} />
                      <div>
                        <p className="text-sm font-medium">{f.responsavel}</p>
                        <p className="text-xs text-muted-foreground">{f.data}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Duplicados</p>
                        <p className="font-semibold text-orange-500">{f.itensDuplicados}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Valor</p>
                        <p className="font-semibold">{formatCurrency(f.valorDuplicado)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Rep. IA</p>
                        <p className="font-semibold text-red-500">{f.despesasReprovadasIA}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </MockCard>
        </div>
      </div>

      {/* === SEÇÃO 3: CONFERÊNCIAS === */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          <h2 className="text-lg font-semibold">Conferências</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MockCard>
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
          </MockCard>

          <MockCard>
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
          </MockCard>

          <MockCard>
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
          </MockCard>
        </div>

        {/* Gráficos Conferências */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MockCard>
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
          </MockCard>

          <MockCard>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notas com Erro - Detalhes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  {conferenciasFiltradas.map(conf => (
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
                  ))}
                </div>
              </CardContent>
            </Card>
          </MockCard>
        </div>
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-center gap-2 pt-4 text-xs text-muted-foreground">
        <AlertTriangle className="h-3 w-3" />
        <span>
          Cards marcados como <Badge variant="destructive" className="text-[10px] px-1 py-0">DADOS MOCKADOS</Badge> contêm dados temporários e serão substituídos por dados reais.
        </span>
      </div>
    </div>
  );
}
