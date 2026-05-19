'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  BarChart3,
  Search,
  Filter,
  Download,
  ChevronDown,
  Calendar,
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  CheckCircle,
  XCircle,
  Users
} from 'lucide-react';
import { useStatusCaixa, useCostCenters, useTeamMembers, useExpenses } from '@/lib/hooks';
import { Report } from '@/lib/api';
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
  ResponsiveContainer
} from 'recharts';

export const dynamic = 'force-dynamic';

export default function Analytics() {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('month');
  const [costCenterFilter, setCostCenterFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  // Data padrão: último mês
  const today = new Date();
  const defaultStartDate = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate()).toISOString().split('T')[0];
  const defaultEndDate = today.toISOString().split('T')[0];

  const { data: reports = [], isLoading } = useStatusCaixa({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
  });

  const { data: costCenters = [] } = useCostCenters();
  const { data: teamMembers = [] } = useTeamMembers();

  // Buscar expenses para calcular valores
  const { data: expenses = [] } = useExpenses({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
  });

  // Filtrar relatórios
  const filteredReports = useMemo(() => {
    let filtered = [...reports];

    // Filtro de busca
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.description?.toLowerCase().includes(term) ||
        r.user?.data?.name?.toLowerCase().includes(term)
      );
    }

    // Filtro de centro de custo
    if (costCenterFilter !== 'all') {
      filtered = filtered.filter(r => {
        const userCostCenter = teamMembers.find(m => m.id === r.user_id)?.costs_center?.data?.name;
        return userCostCenter === costCenterFilter;
      });
    }

    // Filtro de usuário
    if (userFilter !== 'all') {
      filtered = filtered.filter(r => r.user_id === parseInt(userFilter));
    }

    // Filtro de data
    if (dateFilter !== 'all') {
      const now = new Date();
      const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      filtered = filtered.filter(r => {
        const reportDate = new Date(r.created_at);

        switch (dateFilter) {
          case 'today':
            return reportDate >= todayDate;
          case 'week':
            const weekAgo = new Date(todayDate);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return reportDate >= weekAgo;
          case 'month':
            const monthAgo = new Date(todayDate);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return reportDate >= monthAgo;
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [reports, searchTerm, costCenterFilter, userFilter, dateFilter, teamMembers]);

  // Calcular KPIs
  const kpis = useMemo(() => {
    const totalReports = filteredReports.length;
    const approvedReports = filteredReports.filter(r => r.status === 'APROVADO');
    const rejectedReports = filteredReports.filter(r => r.status === 'REPROVADO');
    const sentReports = filteredReports.filter(r => r.status === 'ENVIADO');

    // Calcular valor total por status usando os dados de expenses
    const reportValueMap = expenses.reduce((acc, exp) => {
      // Tenta report_id primeiro, depois report?.data?.id como fallback
      const reportId = exp.report_id || exp.report?.data?.id;
      if (reportId) {
        acc[reportId] = (acc[reportId] || 0) + (exp.value || 0);
      }
      return acc;
    }, {} as Record<number, number>);

    const valueByStatus = filteredReports.reduce((acc, r) => {
      const reportValue = reportValueMap[r.id] || 0;
      acc[r.status] = (acc[r.status] || 0) + reportValue;
      return acc;
    }, {} as Record<string, number>);

    // Calcular tempo médio de aprovação
    const approvedWithDate = approvedReports.filter(r => r.approval_date);
    const avgApprovalTime = approvedWithDate.length > 0
      ? approvedWithDate.reduce((sum, r) => {
          const created = new Date(r.created_at).getTime();
          const approved = new Date(r.approval_date).getTime();
          return sum + (approved - created);
        }, 0) / approvedWithDate.length
      : 0;

    // Taxa de aprovação
    const approvalRate = totalReports > 0 ? (approvedReports.length / totalReports) * 100 : 0;

    // Taxa de reprovação
    const rejectionRate = totalReports > 0 ? (rejectedReports.length / totalReports) * 100 : 0;

    return {
      totalReports,
      approvedCount: approvedReports.length,
      rejectedCount: rejectedReports.length,
      sentCount: sentReports.length,
      totalApprovedValue: valueByStatus['APROVADO'] || 0,
      avgApprovalTime: Math.round(avgApprovalTime / (1000 * 60 * 60 * 24)), // em dias
      approvalRate: Math.round(approvalRate),
      rejectionRate: Math.round(rejectionRate),
    };
  }, [filteredReports, expenses]);

  // Dados para gráfico de evolução temporal
  const monthlyData = useMemo(() => {
    const dataMap = new Map();

    filteredReports.forEach(report => {
      const date = new Date(report.created_at);
      const monthKey = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

      if (!dataMap.has(monthKey)) {
        dataMap.set(monthKey, { month: monthKey, Aprovados: 0, Reprovados: 0, Enviados: 0 });
      }

      const data = dataMap.get(monthKey);
      if (report.status === 'APROVADO') data.Aprovados++;
      else if (report.status === 'REPROVADO') data.Reprovados++;
      else if (report.status === 'ENVIADO') data.Enviados++;
    });

    return Array.from(dataMap.values()).sort((a, b) =>
      new Date(a.month).getTime() - new Date(b.month).getTime()
    );
  }, [filteredReports]);

  // Dados para gráfico de distribuição por status
  const statusDistribution = useMemo(() => {
    const byStatus = filteredReports.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(byStatus).map(([status, count]) => ({
      name: status === 'ABERTO' ? 'Aberto' :
             status === 'ENVIADO' ? 'Enviado' :
             status === 'APROVADO' ? 'Aprovado' :
             status === 'REPROVADO' ? 'Reprovado' :
             status === 'REABERTO' ? 'Reaberto' : status,
      value: count,
    })).filter(item => item.value > 0);
  }, [filteredReports]);

  // Dados para gráfico de top usuários
  const topUsers = useMemo(() => {
    const userStats = filteredReports.reduce((acc, r) => {
      const userName = r.user?.data?.name || 'Desconhecido';
      if (!acc[userName]) {
        acc[userName] = { name: userName, count: 0, approved: 0 };
      }
      acc[userName].count++;
      if (r.status === 'APROVADO') acc[userName].approved++;
      return acc;
    }, {} as Record<string, { name: string; count: number; approved: number }>);

    return Object.values(userStats)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filteredReports]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setDateFilter('month');
    setCostCenterFilter('all');
    setUserFilter('all');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics de Aprovações</h1>
          <p className="text-gray-600 mt-1">Métricas e KPIs sobre o processo de aprovação</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowFilters(!showFilters)}
            variant={showFilters ? "default" : "outline"}
            className="w-full sm:w-auto"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filtros
            <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>
          <Button
            variant="outline"
            className="w-full sm:w-auto"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Filtros */}
      {showFilters && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Buscar</label>
                <Input
                  placeholder="Descrição ou usuário..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Período</label>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Todos</option>
                  <option value="today">Hoje</option>
                  <option value="week">Última semana</option>
                  <option value="month">Último mês</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Usuário</label>
                <select
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Todos</option>
                  {teamMembers.map(member => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Centro de Custo</label>
                <select
                  value={costCenterFilter}
                  onChange={(e) => setCostCenterFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Todos</option>
                  {costCenters.map(cc => (
                    <option key={cc.id} value={cc.name}>{cc.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end md:col-span-2 lg:col-span-4">
                <Button onClick={resetFilters} variant="outline" className="w-full">
                  Limpar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover:shadow-lg transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Tempo Médio de Aprovação
            </CardTitle>
            <div className="p-2 bg-blue-100 rounded-lg">
              <Clock className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{kpis.avgApprovalTime} dias</div>
            <p className="text-xs text-gray-500 mt-2">Média geral</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Taxa de Aprovação
            </CardTitle>
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{kpis.approvalRate}%</div>
            <p className="text-xs text-gray-500 mt-2">Dos relatórios</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Valor Total Aprovado
            </CardTitle>
            <div className="p-2 bg-green-100 rounded-lg">
              <DollarSign className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{formatCurrency(kpis.totalApprovedValue)}</div>
            <p className="text-xs text-gray-500 mt-2">No período</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Taxa de Reprovação
            </CardTitle>
            <div className="p-2 bg-red-100 rounded-lg">
              <TrendingDown className="h-4 w-4 text-red-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{kpis.rejectionRate}%</div>
            <p className="text-xs text-gray-500 mt-2">Dos relatórios</p>
          </CardContent>
        </Card>
      </div>

      {/* KPIs Secundários */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total de Relatórios
            </CardTitle>
            <div className="p-2 bg-blue-100 rounded-lg">
              <BarChart3 className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{kpis.totalReports}</div>
            <p className="text-xs text-gray-500 mt-2">No período</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Relatórios Aprovados
            </CardTitle>
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{kpis.approvedCount}</div>
            <p className="text-xs text-gray-500 mt-2">No período</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Relatórios Reprovados
            </CardTitle>
            <div className="p-2 bg-red-100 rounded-lg">
              <XCircle className="h-4 w-4 text-red-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{kpis.rejectedCount}</div>
            <p className="text-xs text-gray-500 mt-2">No período</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Evolução Temporal */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Evolução Temporal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="Aprovados" stroke="#10b981" strokeWidth={2} />
                <Line type="monotone" dataKey="Reprovados" stroke="#ef4444" strokeWidth={2} />
                <Line type="monotone" dataKey="Enviados" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Gráfico de Distribuição por Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Distribuição por Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  <Cell fill="#3b82f6" />
                  <Cell fill="#10b981" />
                  <Cell fill="#ef4444" />
                  <Cell fill="#f59e0b" />
                  <Cell fill="#8b5cf6" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Usuários */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Top Usuários por Volume de Relatórios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topUsers}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#3b82f6" name="Total" />
              <Bar dataKey="approved" fill="#10b981" name="Aprovados" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
