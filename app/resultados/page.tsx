'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

interface ResultadosData {
  fechamento: {
    totalReports: number;
    totalExpenses: number;
    totalSyncs: number;
    lastSync: string | null;
    reportsByStatus: Record<string, number>;
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
    recentDismissals: any[];
  };
}

const AUDIT_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#059669', '#dc2626', '#f97316'];

export default function ResultadosPage() {
  const [data, setData] = useState<ResultadosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando resultados...</p>
        </div>
      </div>
    );
  }

  if (error) {
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

  if (!data) return null;

  const auditPieData = [
    { name: 'Aprovado pelo Bot', value: data.aprovacaoDinamica.approvedByBot },
    { name: 'Aprovado por Humano', value: data.aprovacaoDinamica.approvedByHuman },
    { name: 'Pendente', value: data.aprovacaoDinamica.pendingReview },
    { name: 'Reprovado pelo Bot', value: data.aprovacaoDinamica.rejectedByBot },
    { name: 'Reprovado por Humano', value: data.aprovacaoDinamica.rejectedByHuman },
    { name: 'Analisar Depois', value: data.aprovacaoDinamica.analyzeLater },
  ].filter((d) => d.value > 0);

  const reportsStatusData = Object.entries(data.fechamento.reportsByStatus)
    .map(([status, count]) => ({ name: status, value: count }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Resultados</h1>
          <p className="text-gray-600 mt-1">Dashboard de automações e resultados operacionais</p>
        </div>
        <button
          onClick={() => fetchData()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      </div>

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

        {/* Reports by status chart */}
        {reportsStatusData.length > 0 && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Relatórios por Status</CardTitle>
              <CardDescription>Distribuição dos relatórios sincronizados</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={reportsStatusData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3b82f6" name="Quantidade" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
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
                Confirmadas manualmente
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Descartadas (Não Duplicata)
              </CardTitle>
              <div className="p-2 bg-gray-100 rounded-lg">
                <XCircle className="h-4 w-4 text-gray-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {data.duplicates.dismissedAsNotDuplicate}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Falsos positivos descartados
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recent dismissals table */}
        {data.duplicates.recentDismissals.length > 0 && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Duplicadas Recentes</CardTitle>
              <CardDescription>Últimas 10 ocorrências analisadas</CardDescription>
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
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Resultado</th>
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
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                              d.is_duplicate
                                ? 'bg-red-100 text-red-800'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {d.is_duplicate ? 'Confirmada' : 'Descartada'}
                          </span>
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

      {/* Summary section */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Resumo Geral das Automações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
