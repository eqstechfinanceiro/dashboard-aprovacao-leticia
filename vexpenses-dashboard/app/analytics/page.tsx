'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3,
  Search,
  Filter,
  Download,
  ChevronDown,
  Calendar,
  TrendingUp,
  Clock,
  DollarSign,
  CheckCircle,
  XCircle,
  Users,
  Building2
} from 'lucide-react';
import { useStatusCaixa, useCostCenters, useTeamMembers, useExpenses } from '@/lib/hooks';
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
  const [cardFilter, setCardFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [regionalFilter, setRegionalFilter] = useState('all');
  const [approverFilter, setApproverFilter] = useState('all');
  const [reportFilter, setReportFilter] = useState('all');

  const today = new Date();
  const defaultStartDate = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate()).toISOString().split('T')[0];
  const defaultEndDate = today.toISOString().split('T')[0];

  const { data: reports = [], isLoading, error: reportsError } = useStatusCaixa({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
  });

  const { data: costCenters = [] } = useCostCenters();
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: expenses = [] } = useExpenses({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
  });

  // Filtros disponíveis
  const availableCards = useMemo(() => {
    const cards = new Set<string>();
    expenses.forEach(exp => {
      if (exp.payment_method?.data?.description) cards.add(exp.payment_method.data.description);
    });
    return Array.from(cards).sort();
  }, [expenses]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    reports.forEach(r => years.add(new Date(r.created_at).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [reports]);

  const availableRegionals = useMemo(() => {
    const set = new Set<string>();
    costCenters.forEach(cc => {
      const m = cc.name.match(/\b([A-Z]{2})\b$/);
      if (m) set.add(m[1]);
    });
    return Array.from(set).sort();
  }, [costCenters]);

  const availableApprovers = useMemo(() => {
    const set = new Set<number>();
    reports.forEach(r => { if (r.approval_user_id) set.add(r.approval_user_id); });
    return Array.from(set).sort();
  }, [reports]);

  const availableReports = useMemo(() => {
    const set = new Set<string>();
    reports.forEach(r => { if (r.description) set.add(r.description); });
    return Array.from(set).sort();
  }, [reports]);

  // Filtrar relatórios
  const filteredReports = useMemo(() => {
    let filtered = [...reports];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.description?.toLowerCase().includes(term) ||
        r.user?.data?.name?.toLowerCase().includes(term)
      );
    }

    if (costCenterFilter !== 'all') {
      filtered = filtered.filter(r => {
        const cc = teamMembers.find(m => m.id === r.user_id)?.costs_center?.data?.name;
        return cc === costCenterFilter;
      });
    }

    if (userFilter !== 'all') {
      filtered = filtered.filter(r => r.user_id === parseInt(userFilter));
    }

    if (cardFilter !== 'all') {
      filtered = filtered.filter(r => {
        const exps = expenses.filter(e => e.expense_id === r.id || e.report?.data?.id === r.id);
        return exps.some(e => e.payment_method?.data?.description === cardFilter);
      });
    }

    if (yearFilter !== 'all') {
      filtered = filtered.filter(r => new Date(r.created_at).getFullYear() === parseInt(yearFilter));
    }

    if (regionalFilter !== 'all') {
      filtered = filtered.filter(r => {
        const cc = teamMembers.find(m => m.id === r.user_id)?.costs_center?.data?.name;
        return cc?.includes(regionalFilter) || false;
      });
    }

    if (approverFilter !== 'all') {
      filtered = filtered.filter(r => r.approval_user_id === parseInt(approverFilter));
    }

    if (reportFilter !== 'all') {
      filtered = filtered.filter(r => r.description === reportFilter);
    }

    if (dateFilter !== 'all') {
      const now = new Date();
      const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filtered = filtered.filter(r => {
        const reportDate = new Date(r.created_at);
        switch (dateFilter) {
          case 'today': return reportDate >= todayDate;
          case 'week': {
            const weekAgo = new Date(todayDate);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return reportDate >= weekAgo;
          }
          case 'month': {
            const monthAgo = new Date(todayDate);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return reportDate >= monthAgo;
          }
          default: return true;
        }
      });
    }

    return filtered;
  }, [reports, searchTerm, costCenterFilter, userFilter, dateFilter, teamMembers, expenses, cardFilter, yearFilter, regionalFilter, approverFilter, reportFilter]);

  // KPIs
  const kpis = useMemo(() => {
    const totalReports = filteredReports.length;
    const approvedReports = filteredReports.filter(r => r.status === 'APROVADO');
    const rejectedReports = filteredReports.filter(r => r.status === 'REPROVADO');

    const reportValueMap = expenses.reduce((acc, exp) => {
      const reportId = exp.expense_id || exp.report?.data?.id;
      if (reportId) acc[reportId] = (acc[reportId] || 0) + (exp.value || 0);
      return acc;
    }, {} as Record<number, number>);

    const totalApprovedValue = approvedReports.reduce((sum, r) => sum + (reportValueMap[r.id] || 0), 0);

    const approvedWithDate = approvedReports.filter(r => r.approval_date);
    const avgApprovalTime = approvedWithDate.length > 0
      ? approvedWithDate.reduce((sum, r) => {
          return sum + (new Date(r.approval_date).getTime() - new Date(r.created_at).getTime());
        }, 0) / approvedWithDate.length
      : 0;

    return {
      totalReports,
      approvedCount: approvedReports.length,
      rejectedCount: rejectedReports.length,
      totalApprovedValue,
      avgApprovalTime: Math.round(avgApprovalTime / (1000 * 60 * 60 * 24)),
      approvalRate: totalReports > 0 ? Math.round((approvedReports.length / totalReports) * 100) : 0,
      rejectionRate: totalReports > 0 ? Math.round((rejectedReports.length / totalReports) * 100) : 0,
    };
  }, [filteredReports, expenses]);

  // Gráficos
  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; Aprovados: number; Reprovados: number; Enviados: number }>();
    filteredReports.forEach(r => {
      const key = new Date(r.created_at).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      if (!map.has(key)) map.set(key, { month: key, Aprovados: 0, Reprovados: 0, Enviados: 0 });
      const d = map.get(key)!;
      if (r.status === 'APROVADO') d.Aprovados++;
      else if (r.status === 'REPROVADO') d.Reprovados++;
      else if (r.status === 'ENVIADO') d.Enviados++;
    });
    return Array.from(map.values());
  }, [filteredReports]);

  const statusDistribution = useMemo(() => {
    const byStatus = filteredReports.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const labels: Record<string, string> = { ABERTO: 'Aberto', ENVIADO: 'Enviado', APROVADO: 'Aprovado', REPROVADO: 'Reprovado', REABERTO: 'Reaberto' };
    return Object.entries(byStatus).map(([s, v]) => ({ name: labels[s] || s, value: v })).filter(i => i.value > 0);
  }, [filteredReports]);

  const topUsers = useMemo(() => {
    const stats = filteredReports.reduce((acc, r) => {
      const name = r.user?.data?.name || 'Desconhecido';
      if (!acc[name]) acc[name] = { name, count: 0, approved: 0 };
      acc[name].count++;
      if (r.status === 'APROVADO') acc[name].approved++;
      return acc;
    }, {} as Record<string, { name: string; count: number; approved: number }>);
    return Object.values(stats).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filteredReports]);

  // Rankings por regional
  const regionalRankings = useMemo(() => {
    const stats = filteredReports.reduce((acc, r) => {
      const cc = teamMembers.find(m => m.id === r.user_id)?.costs_center?.data?.name;
      if (!cc) return acc;
      const m = cc.match(/\b([A-Z]{2})\b$/);
      const regional = m ? m[1] : 'Outros';
      if (!acc[regional]) acc[regional] = { name: regional, count: 0, value: 0 };
      acc[regional].count++;
      const exps = expenses.filter(e => e.expense_id === r.id || e.report?.data?.id === r.id);
      acc[regional].value += exps.reduce((s, e) => s + (e.value || 0), 0);
      return acc;
    }, {} as Record<string, { name: string; count: number; value: number }>);
    return Object.values(stats).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [filteredReports, expenses, teamMembers]);

  // Tabela de colaboradores
  const collaboratorTable = useMemo(() => {
    const stats = filteredReports.reduce((acc, r) => {
      const name = r.user?.data?.name || 'Desconhecido';
      const cc = teamMembers.find(m => m.id === r.user_id)?.costs_center?.data?.name;
      const m = cc?.match(/\b([A-Z]{2})\b$/);
      const regional = m ? m[1] : 'Outros';
      if (!acc[name]) acc[name] = { name, count: 0, value: 0, regional };
      acc[name].count++;
      const exps = expenses.filter(e => e.expense_id === r.id || e.report?.data?.id === r.id);
      acc[name].value += exps.reduce((s, e) => s + (e.value || 0), 0);
      return acc;
    }, {} as Record<string, { name: string; count: number; value: number; regional: string }>);
    return Object.values(stats).sort((a, b) => b.value - a.value);
  }, [filteredReports, expenses, teamMembers]);

  // Top 10 Naturezas
  const topNaturezas = useMemo(() => {
    const stats = expenses.reduce((acc, exp) => {
      const n = exp.expense_type?.data?.description || 'Outros';
      if (!acc[n]) acc[n] = { name: n, count: 0, value: 0 };
      acc[n].count++;
      acc[n].value += exp.value || 0;
      return acc;
    }, {} as Record<string, { name: string; count: number; value: number }>);
    return Object.values(stats).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [expenses]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const resetFilters = () => {
    setSearchTerm('');
    setDateFilter('month');
    setCostCenterFilter('all');
    setUserFilter('all');
    setCardFilter('all');
    setYearFilter('all');
    setRegionalFilter('all');
    setApproverFilter('all');
    setReportFilter('all');
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

  if (reportsError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Erro ao carregar dados</h2>
          <p className="text-gray-600 mb-4">{reportsError instanceof Error ? reportsError.message : 'Tente novamente'}</p>
          <Button onClick={() => window.location.reload()}>Recarregar</Button>
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
            variant={showFilters ? 'default' : 'outline'}
            className="w-full sm:w-auto"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filtros
            <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>
          <Button variant="outline" className="w-full sm:w-auto">
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
                <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="all">Todos</option>
                  <option value="today">Hoje</option>
                  <option value="week">Última semana</option>
                  <option value="month">Último mês</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Usuário</label>
                <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="all">Todos</option>
                  {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Centro de Custo</label>
                <select value={costCenterFilter} onChange={(e) => setCostCenterFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="all">Todos</option>
                  {costCenters.map(cc => <option key={cc.id} value={cc.name}>{cc.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Cartão</label>
                <select value={cardFilter} onChange={(e) => setCardFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="all">Todos</option>
                  {availableCards.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Ano</label>
                <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="all">Todos</option>
                  {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Regional</label>
                <select value={regionalFilter} onChange={(e) => setRegionalFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="all">Todas</option>
                  {availableRegionals.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Aprovador</label>
                <select value={approverFilter} onChange={(e) => setApproverFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="all">Todos</option>
                  {availableApprovers.map(id => {
                    const approver = teamMembers.find(m => m.id === id);
                    return <option key={id} value={id}>{approver?.name || `ID ${id}`}</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Relatório</label>
                <select value={reportFilter} onChange={(e) => setReportFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="all">Todos</option>
                  {availableReports.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <Button onClick={resetFilters} variant="outline" className="w-full">
                  Limpar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center pt-10">
            <Clock className="h-8 w-8 mb-3 text-blue-100" />
            <p className="text-sm font-medium text-blue-100 uppercase tracking-wide mb-2">Tempo Médio de Aprovação</p>
            <p className="text-3xl font-bold">{kpis.avgApprovalTime} dias</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center pt-10">
            <CheckCircle className="h-8 w-8 mb-3 text-green-100" />
            <p className="text-sm font-medium text-green-100 uppercase tracking-wide mb-2">Taxa de Aprovação</p>
            <p className="text-3xl font-bold">{kpis.approvalRate}%</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center pt-10">
            <DollarSign className="h-8 w-8 mb-3 text-purple-100" />
            <p className="text-sm font-medium text-purple-100 uppercase tracking-wide mb-2">Valor Total Aprovado</p>
            <p className="text-2xl font-bold">{formatCurrency(kpis.totalApprovedValue)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white border-0">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center pt-10">
            <XCircle className="h-8 w-8 mb-3 text-red-100" />
            <p className="text-sm font-medium text-red-100 uppercase tracking-wide mb-2">Taxa de Reprovação</p>
            <p className="text-3xl font-bold">{kpis.rejectionRate}%</p>
          </CardContent>
        </Card>
      </div>

      {/* KPIs Secundários */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total de Relatórios</CardTitle>
            <div className="p-2 bg-blue-100 rounded-lg"><BarChart3 className="h-4 w-4 text-blue-600" /></div>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <div className="text-2xl font-bold text-gray-900">{kpis.totalReports}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Relatórios Aprovados</CardTitle>
            <div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="h-4 w-4 text-green-600" /></div>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <div className="text-2xl font-bold text-gray-900">{kpis.approvedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Relatórios Reprovados</CardTitle>
            <div className="p-2 bg-red-100 rounded-lg"><XCircle className="h-4 w-4 text-red-600" /></div>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <div className="text-2xl font-bold text-gray-900">{kpis.rejectedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  cx="50%" cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
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

      {/* Rankings por Regional */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Rankings por Regional (Top 10 por Valor)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {regionalRankings.length > 0 ? regionalRankings.map((regional, index) => (
              <div key={regional.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="w-8 h-8 flex items-center justify-center rounded-full">
                    {index + 1}
                  </Badge>
                  <span className="font-medium">{regional.name}</span>
                </div>
                <div className="text-right">
                  <p className="font-bold">{formatCurrency(regional.value)}</p>
                  <p className="text-xs text-gray-500">{regional.count} relatórios</p>
                </div>
              </div>
            )) : (
              <p className="text-gray-500 text-sm text-center py-4">Nenhum dado disponível</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Colaboradores */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Tabela Detalhada de Colaboradores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Colaborador</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Valor</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">QTD</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Regional</th>
                </tr>
              </thead>
              <tbody>
                {collaboratorTable.length > 0 ? collaboratorTable.map(collab => (
                  <tr key={collab.name} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm font-medium">{collab.name}</td>
                    <td className="py-3 px-4 text-sm font-bold">{formatCurrency(collab.value)}</td>
                    <td className="py-3 px-4 text-sm">{collab.count}</td>
                    <td className="py-3 px-4 text-sm"><Badge variant="outline">{collab.regional}</Badge></td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="py-4 text-center text-gray-500 text-sm">Nenhum dado disponível</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Top 10 Naturezas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Top 10 Naturezas por Valor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {topNaturezas.length > 0 ? topNaturezas.map((natureza, index) => (
              <div key={natureza.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="w-8 h-8 flex items-center justify-center rounded-full">
                    {index + 1}
                  </Badge>
                  <span className="font-medium">{natureza.name}</span>
                </div>
                <div className="text-right">
                  <p className="font-bold">{formatCurrency(natureza.value)}</p>
                  <p className="text-xs text-gray-500">{natureza.count} ocorrências</p>
                </div>
              </div>
            )) : (
              <p className="text-gray-500 text-sm text-center py-4">Nenhum dado disponível</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
