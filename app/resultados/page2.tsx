'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  FileText,
  Bot,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Copy,
  TrendingUp,
  Database,
  RefreshCw,
  Loader2,
  Users,
  FileCheck,
  Layers,
  Wallet,
  Calendar,
  Filter,
  DollarSign,
  Building2,
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
  ResponsiveContainer,
} from 'recharts';

interface ResultadosData {
  fechamento: {
    totalReports: number;
    totalExpenses: number;
    totalSyncs: number;
    lastSync: string | null;
  };
  aprovacaoDinamica: {
    totalAudited: number;
    approvedByBot: number;
    pendingReview: number;
    rejectedByBot: number;
    approvedByHuman: number;
    rejectedByHuman:  number;
    analyzeLater: number;
    totalReportsApproved: number;
    auditByDay: { date: string; count: number }[];
  };
  duplicates: {
    totalDetected: number;
    confirmedDuplicates: number;
    dismissedAsNotDuplicate: number;
    confirmedDuplicateAmount: number;
    recentDismissals: any[];
  };
}

interface EntradaNotasData {
  summary: { totalCount: number; totalValue: number; uniqueUsers: number };
  byUser: { name: string; count: number; totalValue: number }[];
  byEspecie: { name: string; count: number; totalValue: number }[];
  byDay: { date: string; count: number; totalValue: number }[];
  byEmpresa: { name: string; count: number; totalValue: number }[];
  records: any[];
}

type ViewMode = 'gestao-caixa' | 'entrada-notas';

const AUDIT_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#059669', '#dc2626', '#f97316'];
const ESPECIE_OPTIONS = ['SPED', 'NF', 'NFS', 'FAT'];

export default function ResultadosPage() {
  const [data, setData] = useState<ResultadosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('gestao-caixa');

  // Entrada de Notas state
  const [entradaData, setEntradaData] = useState<EntradaNotasData | null>(null);
  const [entradaLoading, setEntradaLoading] = useState(false);
  const [entradaError, setEntradaError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [especieFilter, setEspecieFilter] = useState<string>('');
  const [userFilter, setUserFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/resultados');
      if (!res.ok) throw new Error('Failed to fetch resultados data');
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEntradaNotas = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    setEntradaLoading(true);
    setEntradaError(null);
    setEntradaData(null);
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      if (especieFilter) params.set('especie', especieFilter);
      const res = await fetch(`/api/resultados/entrada-notas?${params}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to fetch entrada notas');
      }
      const json = await res.json();
      setEntradaData(json.data);
    } catch (err) {
      setEntradaError(err instanceof Error ? err.message : 'Erro ao carregar entrada de notas');
    } finally {
      setEntradaLoading(false);
    }
  }, [dateFrom, dateTo, especieFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set default dates for entrada notas (yesterday + today)
  useEffect(() => {
    if (viewMode === 'entrada-notas' && !dateFrom && !dateTo) {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      setDateFrom(fmt(yesterday));
      setDateTo(fmt(today));
    }
  }, [viewMode, dateFrom, dateTo]);

  // Fetch entrada notas when dates are set and view is active
  useEffect(() => {
    if (viewMode === 'entrada-notas' && dateFrom && dateTo && !entradaData && !entradaLoading) {
      fetchEntradaNotas();
    }
  }, [viewMode, dateFrom, dateTo, entradaData, entradaLoading, fetchEntradaNotas]);

  const formatTimestamp = (iso: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

  if (loading && viewMode === 'gestao-caixa') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando resultados...</p>
        </div>
      </div>
    );
  }

  if (error && viewMode === 'gestao-caixa') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <p className="text-gray-900 font-medium">{error}</p>
          <button
            onClick={() => fetchData()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!data && viewMode === 'gestao-caixa') return null;

  const auditPieData = data ? [
    { name: 'Aprovado pelo Bot', value: data.aprovacaoDinamica.approvedByBot },
    { name: 'Aprovado por Humano', value: data.aprovacaoDinamica.approvedByHuman },
    { name: 'Pendente', value: data.aprovacaoDinamica.pendingReview },
    { name: 'Reprovado pelo Bot', value: data.aprovacaoDinamica.rejectedByBot },
    { name: 'Reprovado por Humano', value: data.aprovacaoDinamica.rejectedByHuman },
    { name: 'Analisar Depois', value: data.aprovacaoDinamica.analyzeLater },
  ].filter((d) => d.value > 0) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Resultados</h1>
          <p className="text-gray-600 mt-1">Dashboard de automações e resultados operacionais</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Switcher */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('gestao-caixa')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'gestao-caixa'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Wallet className="h-4 w-4" />
              Gestão de Caixa
            </button>
            <button
              onClick={() => setViewMode('entrada-notas')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'entrada-notas'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileText className="h-4 w-4" />
              Entrada de Notas
            </button>
          </div>
          {viewMode === 'gestao-caixa' && (
            <button
              onClick={() => fetchData()}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          )}
        </div>
      </div>

      {viewMode === 'entrada-notas' ? (
        <EntradaNotasView
          data={entradaData}
          loading={entradaLoading}
          error={entradaError}
          dateFrom={dateFrom}
          dateTo={dateTo}
          especieFilter={especieFilter}
          userFilter={userFilter}
          showFilters={showFilters}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
          setEspecieFilter={setEspecieFilter}
          setUserFilter={setUserFilter}
          setShowFilters={setShowFilters}
          onFetch={fetchEntradaNotas}
          formatCurrency={formatCurrency}
        />
      ) : data ? (
      <>
      {/* Section: Fechamento */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-800">Fechamento</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Relatórios Sincronizados
              </CardTitle>
              <div className="p-2 bg-blue-100 rounded-lg">
                <Database className="h-4 w-4 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {data.fechamento.totalReports}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Relatórios na base de dados
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Despesas Sincronizadas
              </CardTitle>
              <div className="p-2 bg-green-100 rounded-lg">
                <Layers className="h-4 w-4 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {data.fechamento.totalExpenses}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Despesas na base de dados
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Sincronizações Realizadas
              </CardTitle>
              <div className="p-2 bg-purple-100 rounded-lg">
                <RefreshCw className="h-4 w-4 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {data.fechamento.totalSyncs}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Total de sincronizações
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Última Sincronização
              </CardTitle>
              <div className="p-2 bg-orange-100 rounded-lg">
                <Clock className="h-4 w-4 text-orange-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-gray-900">
                {formatTimestamp(data.fechamento.lastSync)}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Data da última atualização
              </p>
            </CardContent>
          </Card>
        </div>

      </div>

      {/* Section: Aprovação Dinâmica */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Bot className="h-5 w-5 text-indigo-600" />
          <h2 className="text-xl font-semibold text-gray-800">Aprovação Dinâmica</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Despesas Auditadas
              </CardTitle>
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Bot className="h-4 w-4 text-indigo-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {data.aprovacaoDinamica.totalAudited}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Total de auditorias realizadas
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Aprovadas pelo Bot
              </CardTitle>
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {data.aprovacaoDinamica.approvedByBot}
              </div>
              <p className="text-xs text-green-600 mt-2">
                {data.aprovacaoDinamica.totalAudited > 0
                  ? `${((data.aprovacaoDinamica.approvedByBot / data.aprovacaoDinamica.totalAudited) * 100).toFixed(1)}% do total`
                  : '0% do total'}
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Relatórios Aprovados
              </CardTitle>
              <div className="p-2 bg-emerald-100 rounded-lg">
                <FileCheck className="h-4 w-4 text-emerald-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {data.aprovacaoDinamica.totalReportsApproved}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Aprovações via dashboard
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Pendentes de Revisão
              </CardTitle>
              <div className="p-2 bg-yellow-100 rounded-lg">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {data.aprovacaoDinamica.pendingReview}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Aguardando análise humana
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Secondary KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Aprovadas por Humano
              </CardTitle>
              <div className="p-2 bg-teal-100 rounded-lg">
                <Users className="h-4 w-4 text-teal-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-gray-900">
                {data.aprovacaoDinamica.approvedByHuman}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Reprovadas pelo Bot
              </CardTitle>
              <div className="p-2 bg-red-100 rounded-lg">
                <XCircle className="h-4 w-4 text-red-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-gray-900">
                {data.aprovacaoDinamica.rejectedByBot}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Reprovadas por Humano
              </CardTitle>
              <div className="p-2 bg-rose-100 rounded-lg">
                <XCircle className="h-4 w-4 text-rose-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-gray-900">
                {data.aprovacaoDinamica.rejectedByHuman}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
          {auditPieData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Distribuição de Auditorias</CardTitle>
                <CardDescription>Resultados das auditorias automáticas e humanas</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={auditPieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      dataKey="value"
                    >
                      {auditPieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={AUDIT_COLORS[index % AUDIT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {data.aprovacaoDinamica.auditByDay.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Auditorias por Dia</CardTitle>
                <CardDescription>Últimos 30 dias</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.aprovacaoDinamica.auditByDay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#6366f1"
                      strokeWidth={2}
                      name="Auditorias"
                      dot={{ fill: '#6366f1', r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Section: Duplicatas */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Copy className="h-5 w-5 text-amber-600" />
          <h2 className="text-xl font-semibold text-gray-800">Despesas Duplicadas</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Duplicatas Detectadas
              </CardTitle>
              <div className="p-2 bg-amber-100 rounded-lg">
                <Copy className="h-4 w-4 text-amber-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {data.duplicates.totalDetected}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Total de ocorrências identificadas
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Confirmadas como Duplicata
              </CardTitle>
              <div className="p-2 bg-red-100 rounded-lg">
                <CheckCircle className="h-4 w-4 text-red-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {data.duplicates.confirmedDuplicates}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {formatCurrency(data.duplicates.confirmedDuplicateAmount)} em valor
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Valor Economizado (Estimado)
              </CardTitle>
              <div className="p-2 bg-emerald-100 rounded-lg">
                <DollarSign className="h-4 w-4 text-emerald-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {formatCurrency(data.duplicates.confirmedDuplicateAmount)}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Valor de duplicatas confirmadas
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recent confirmed duplicates table */}
        {data.duplicates.recentDismissals.length > 0 && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Duplicadas Confirmadas Recentes</CardTitle>
              <CardDescription>Últimas 10 duplicatas confirmadas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Data</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Despesa</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Valor</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Relatório</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Usuário</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Analisado por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.duplicates.recentDismissals.map((d: any, i: number) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {formatTimestamp(d.dismissed_at)}
                        </td>
                        <td className="py-3 px-4 text-sm font-medium text-gray-900">
                          {d.expense_report_name || `#${d.expense_id}`}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-700">
                          {formatCurrency(d.expense_value)}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {d.duplicate_report_name || `#${d.duplicate_expense_id}`}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {d.expense_user_name || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {d.dismissed_by}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      </>
      ) : null}

      {/* Summary section */}
      {viewMode === 'gestao-caixa' && data && (
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Resumo Geral das Automações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">
                {data.fechamento.totalReports}
              </p>
              <p className="text-sm text-gray-600 mt-1">Relatórios sincronizados</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-indigo-600">
                {data.aprovacaoDinamica.totalAudited}
              </p>
              <p className="text-sm text-gray-600 mt-1">Despesas auditadas automaticamente</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-amber-600">
                {data.duplicates.totalDetected}
              </p>
              <p className="text-sm text-gray-600 mt-1">Duplicatas detectadas</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-emerald-600">
                {formatCurrency(data.duplicates.confirmedDuplicateAmount)}
              </p>
              <p className="text-sm text-gray-600 mt-1">Valor em duplicatas confirmadas</p>
            </div>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}

// ── Entrada de Notas View Component ─────────────────────────────────────

interface EntradaNotasViewProps {
  data: EntradaNotasData | null;
  loading: boolean;
  error: string | null;
  dateFrom: string;
  dateTo: string;
  especieFilter: string;
  userFilter: string;
  showFilters: boolean;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  setEspecieFilter: (v: string) => void;
  setUserFilter: (v: string) => void;
  setShowFilters: (v: boolean) => void;
  onFetch: () => void;
  formatCurrency: (v: number) => string;
}

function EntradaNotasView({
  data, loading, error, dateFrom, dateTo, especieFilter, userFilter, showFilters,
  setDateFrom, setDateTo, setEspecieFilter, setUserFilter, setShowFilters, onFetch, formatCurrency,
}: EntradaNotasViewProps) {
  const filteredRecords = data?.records.filter((r: any) => {
    if (userFilter && r.usuario !== userFilter) return false;
    return true;
  }) || [];

  return (
    <div className="space-y-6">
      {/* Filters bar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-blue-600" />
                Filtros
              </CardTitle>
              <CardDescription>Período e espécie para consulta TOTVS Protheus</CardDescription>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {showFilters ? 'Recolher' : 'Expandir'}
            </button>
          </div>
        </CardHeader>
        {showFilters && (
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Data Inicial (dd/MM/aaaa)</label>
                <Input
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder="dd/MM/aaaa"
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Data Final (dd/MM/aaaa)</label>
                <Input
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  placeholder="dd/MM/aaaa"
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Espécie</label>
                <select
                  value={especieFilter}
                  onChange={(e) => setEspecieFilter(e.target.value)}
                  className="w-full h-9 rounded-md border border-gray-300 px-3 text-sm"
                >
                  <option value="">Todas</option>
                  {ESPECIE_OPTIONS.map((esp) => (
                    <option key={esp} value={esp}>{esp}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Usuário</label>
                <select
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                  className="w-full h-9 rounded-md border border-gray-300 px-3 text-sm"
                >
                  <option value="">Todos</option>
                  {data?.byUser.map((u) => (
                    <option key={u.name} value={u.name}>{u.name}</option>
                  )) || []}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => onFetch()}
                disabled={loading || !dateFrom || !dateTo}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Consultar
              </button>
            </div>
          </CardContent>
        )}
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto" />
            <p className="mt-3 text-gray-600">Consultando TOTVS Protheus...</p>
          </div>
        </div>
      )}

      {error && !loading && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-sm font-medium text-red-900">Erro ao consultar TOTVS</p>
                <p className="text-xs text-red-700 mt-1">{error}</p>
              </div>
              <button
                onClick={onFetch}
                className="ml-auto px-3 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700"
              >
                Tentar novamente
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {data && !loading && !error && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Total de Notas Lançadas
                </CardTitle>
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">
                  {data.summary.totalCount}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Notas no período
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Valor Total Lançado
                </CardTitle>
                <div className="p-2 bg-green-100 rounded-lg">
                  <DollarSign className="h-4 w-4 text-green-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">
                  {formatCurrency(data.summary.totalValue)}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Soma de todas as notas
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Usuários Ativos
                </CardTitle>
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Users className="h-4 w-4 text-indigo-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">
                  {data.summary.uniqueUsers}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Usuários que lançaram notas
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Empresas
                </CardTitle>
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Building2 className="h-4 w-4 text-purple-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">
                  {data.byEmpresa.length}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {data.byEmpresa.map(e => e.name).join(', ')}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By User chart */}
            {data.byUser.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Notas por Usuário</CardTitle>
                  <CardDescription>Quantidade de lançamentos por usuário</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.byUser} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={120} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#6366f1" name="Notas" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* By Especie chart */}
            {data.byEspecie.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Notas por Espécie</CardTitle>
                  <CardDescription>Distribuição por tipo de documento</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.byEspecie}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#f59e0b" name="Notas" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* By Day chart */}
          {data.byDay.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Notas por Dia</CardTitle>
                <CardDescription>Evolução de lançamentos no período</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={data.byDay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} name="Notas" dot={{ fill: '#3b82f6', r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Records table */}
          {filteredRecords.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Notas Lançadas ({filteredRecords.length})</CardTitle>
                <CardDescription>
                  {userFilter ? `Filtrado por usuário: ${userFilter}` : 'Todas as notas no período'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto" style={{ maxHeight: '600px' }}>
                  <table className="w-full">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Documento</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Série</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Fornecedor</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Espécie</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Dt. Digitação</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Valor</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Usuário</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Empresa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.map((r: any, i: number) => (
                        <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-4 text-sm font-medium text-gray-900">{r.doc}</td>
                          <td className="py-2 px-4 text-sm text-gray-600">{r.serie}</td>
                          <td className="py-2 px-4 text-sm text-gray-600">{r.fornecedor}</td>
                          <td className="py-2 px-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              {r.especie}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-sm text-gray-600">{r.dtDigitacao}</td>
                          <td className="py-2 px-4 text-sm text-right font-medium text-gray-900">
                            {formatCurrency(r.valor)}
                          </td>
                          <td className="py-2 px-4 text-sm text-gray-600">{r.usuario}</td>
                          <td className="py-2 px-4 text-sm text-gray-600">{r.empresa}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!data && !loading && !error && (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Selecione um período e clique em "Consultar" para buscar notas no TOTVS Protheus.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
