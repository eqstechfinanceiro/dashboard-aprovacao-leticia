'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  Search,
  Filter,
  Download,
  ChevronDown,
  Calendar,
  User,
  DollarSign,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  BarChart3,
  Building2
} from 'lucide-react';
import { useApprovedReports, useCashFlow, useTeamMembers, useCostCenters } from '@/lib/hooks';
import { Report } from '@/lib/api';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

export const dynamic = 'force-dynamic';

export default function GestaoCaixa() {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('month');
  const [userFilter, setUserFilter] = useState('all');
  const [costCenterFilter, setCostCenterFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [cardFilter, setCardFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [regionalFilter, setRegionalFilter] = useState('all');

  // Data padrão: último mês
  const today = new Date();
  const defaultStartDate = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate()).toISOString().split('T')[0];
  const defaultEndDate = today.toISOString().split('T')[0];

  const { data: approvedReports = [], isLoading: loadingApproved, error: reportsError } = useApprovedReports({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
  });

  const { data: cashFlowData = [], isLoading: loadingCashFlow, error: expensesError } = useCashFlow({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
  });

  const { data: teamMembers = [] } = useTeamMembers();
  const { data: costCenters = [] } = useCostCenters();

  const hasError = !!(reportsError || expensesError); // Block on main data errors
  const combinedError = reportsError || expensesError;

  // Extrair filtros disponíveis
  const availableCards = useMemo(() => {
    const cards = new Set<string>();
    cashFlowData.forEach(exp => {
      if (exp.payment_method?.data?.description) {
        cards.add(exp.payment_method.data.description);
      }
    });
    return Array.from(cards).sort();
  }, [cashFlowData]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    approvedReports.forEach(report => {
      const year = new Date(report.created_at).getFullYear();
      years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [approvedReports]);

  const availableRegionals = useMemo(() => {
    const regionals = new Set<string>();
    costCenters.forEach(cc => {
      // Extrair sigla de estado do nome (ex: "CLARO INFRA SC" -> "SC")
      const match = cc.name.match(/\b([A-Z]{2})\b$/);
      if (match) {
        regionals.add(match[1]);
      }
    });
    return Array.from(regionals).sort();
  }, [costCenters]);

  // Filtrar relatórios aprovados
  const filteredReports = useMemo(() => {
    let filtered = [...approvedReports];

    // Filtro de busca
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.description?.toLowerCase().includes(term) ||
        r.user?.data?.name?.toLowerCase().includes(term)
      );
    }

    // Filtro de usuário
    if (userFilter !== 'all') {
      filtered = filtered.filter(r => r.user_id === parseInt(userFilter));
    }

    // Filtro de cartão (baseado nas despesas do relatório)
    if (cardFilter !== 'all') {
      filtered = filtered.filter(r => {
        const reportExpenses = cashFlowData.filter(e => e.expense_id === r.id || e.report?.data?.id === r.id);
        return reportExpenses.some(e => e.payment_method?.data?.description === cardFilter);
      });
    }

    // Filtro de ano
    if (yearFilter !== 'all') {
      filtered = filtered.filter(r => {
        const year = new Date(r.created_at).getFullYear();
        return year === parseInt(yearFilter);
      });
    }

    // Filtro de regional (baseado no centro de custo do usuário)
    if (regionalFilter !== 'all') {
      filtered = filtered.filter(r => {
        const userCostCenter = teamMembers.find(m => m.id === r.user_id)?.costs_center?.data?.name;
        if (!userCostCenter) return false;
        // Verificar se o nome do centro de custo contém a sigla da regional
        return userCostCenter.includes(regionalFilter);
      });
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
  }, [approvedReports, searchTerm, userFilter, dateFilter, cashFlowData, cardFilter, yearFilter, regionalFilter, teamMembers]);

  // Filtrar dados de fluxo de caixa
  const filteredCashFlow = useMemo(() => {
    let filtered = [...cashFlowData];

    // Filtro de centro de custo
    if (costCenterFilter !== 'all') {
      filtered = filtered.filter(e => e.costs_center?.data?.name === costCenterFilter);
    }

    // Filtro de cartão
    if (cardFilter !== 'all') {
      filtered = filtered.filter(e => e.payment_method?.data?.description === cardFilter);
    }

    // Filtro de ano
    if (yearFilter !== 'all') {
      filtered = filtered.filter(e => {
        const year = new Date(e.date).getFullYear();
        return year === parseInt(yearFilter);
      });
    }

    // Filtro de regional (baseado no centro de custo da despesa)
    if (regionalFilter !== 'all') {
      filtered = filtered.filter(e => {
        const costCenterName = e.costs_center?.data?.name;
        if (!costCenterName) return false;
        // Verificar se o nome do centro de custo contém a sigla da regional
        return costCenterName.includes(regionalFilter);
      });
    }

    // Filtro de data (aplicado nos expenses)
    if (dateFilter !== 'all') {
      const now = new Date();
      const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      filtered = filtered.filter(e => {
        const expenseDate = new Date(e.date);

        switch (dateFilter) {
          case 'today':
            return expenseDate >= todayDate;
          case 'week':
            const weekAgo = new Date(todayDate);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return expenseDate >= weekAgo;
          case 'month':
            const monthAgo = new Date(todayDate);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return expenseDate >= monthAgo;
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [cashFlowData, costCenterFilter, dateFilter, cardFilter, yearFilter, regionalFilter]);

  // Paginação
  const totalPages = Math.ceil(filteredReports.length / itemsPerPage);
  const paginatedReports = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredReports.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredReports, currentPage]);

  // Calcular KPIs
  const kpis = useMemo(() => {
    const totalPaidValue = filteredReports.reduce((sum, r) => {
      // Buscar valor total das despesas do relatório
      const reportExpenses = cashFlowData.filter(e => e.expense_id === r.id || e.report?.data?.id === r.id);
      const reportValue = reportExpenses.reduce((expSum, exp) => expSum + (exp.value || 0), 0);
      return sum + reportValue;
    }, 0);

    const totalCashFlow = filteredCashFlow.reduce((sum, e) => sum + (e.value || 0), 0);

    // Agrupar por centro de custo
    const byCostCenter = filteredCashFlow.reduce((acc, e) => {
      const cc = e.costs_center?.data?.name || 'Outros';
      acc[cc] = (acc[cc] || 0) + (e.value || 0);
      return acc;
    }, {} as Record<string, number>);

    // Agrupar por tipo de despesa
    const byExpenseType = filteredCashFlow.reduce((acc, e) => {
      const type = e.expense_type?.data?.description || 'Outros';
      acc[type] = (acc[type] || 0) + (e.value || 0);
      return acc;
    }, {} as Record<string, number>);

    // Agrupar por mês
    const byMonth = filteredCashFlow.reduce((acc, e) => {
      const date = new Date(e.date);
      const monthKey = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      acc[monthKey] = (acc[monthKey] || 0) + (e.value || 0);
      return acc;
    }, {} as Record<string, number>);

    return {
      totalPaidReports: filteredReports.length,
      totalPaidValue,
      totalCashFlow,
      averagePaidValue: filteredReports.length > 0 ? totalPaidValue / filteredReports.length : 0,
      byCostCenter,
      byExpenseType,
      byMonth,
    };
  }, [filteredReports, filteredCashFlow, cashFlowData]);

  // Rankings por regional
  const regionalRankings = useMemo(() => {
    const regionalStats = filteredCashFlow.reduce((acc, exp) => {
      const costCenterName = exp.costs_center?.data?.name;
      if (!costCenterName) return acc;

      // Extrair sigla de estado do nome (ex: "CLARO INFRA SC" -> "SC")
      const match = costCenterName.match(/\b([A-Z]{2})\b$/);
      const regional = match ? match[1] : 'Outros';

      if (!acc[regional]) {
        acc[regional] = { name: regional, count: 0, value: 0 };
      }

      acc[regional].count++;
      acc[regional].value += exp.value || 0;

      return acc;
    }, {} as Record<string, { name: string; count: number; value: number }>);

    return Object.values(regionalStats)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredCashFlow]);

  // Tabela detalhada de colaboradores
  const collaboratorTable = useMemo(() => {
    const collaboratorStats = filteredReports.reduce((acc, r) => {
      const userName = r.user?.data?.name || 'Desconhecido';
      const userCostCenter = teamMembers.find(m => m.id === r.user_id)?.costs_center?.data?.name;

      // Extrair sigla de estado do nome (ex: "CLARO INFRA SC" -> "SC")
      const match = userCostCenter?.match(/\b([A-Z]{2})\b$/);
      const regional = match ? match[1] : 'Outros';

      if (!acc[userName]) {
        acc[userName] = { name: userName, count: 0, value: 0, regional };
      }

      acc[userName].count++;

      // Calcular valor do relatório
      const reportExpenses = cashFlowData.filter(e => e.expense_id === r.id || e.report?.data?.id === r.id);
      const reportValue = reportExpenses.reduce((sum, exp) => sum + (exp.value || 0), 0);
      acc[userName].value += reportValue;

      return acc;
    }, {} as Record<string, { name: string; count: number; value: number; regional: string }>);

    return Object.values(collaboratorStats)
      .sort((a, b) => b.value - a.value);
  }, [filteredReports, cashFlowData, teamMembers]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setDateFilter('month');
    setUserFilter('all');
    setCostCenterFilter('all');
    setCardFilter('all');
    setYearFilter('all');
    setRegionalFilter('all');
    setCurrentPage(1);
  };

  const loading = loadingApproved || loadingCashFlow;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando gestão de caixa...</p>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Erro ao carregar dados</h2>
          <p className="text-gray-600 mb-4">{combinedError instanceof Error ? combinedError.message : 'Tente novamente mais tarde'}</p>
          <Button onClick={() => window.location.reload()}>Recarregar página</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gestão de Caixa</h1>
          <p className="text-gray-600 mt-1">Gerenciamento e monitoramento de caixas e fluxo financeiro</p>
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
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Cartão</label>
                <select
                  value={cardFilter}
                  onChange={(e) => setCardFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                  <option value="all">Todos</option>
                  {availableCards.length > 0 ? availableCards.map(card => (
                    <option key={card} value={card}>{card}</option>
                  )) : (
                    <option value="" disabled>Nenhum cartão disponível</option>
                  )}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Ano</label>
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Todos</option>
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Regional</label>
                <select
                  value={regionalFilter}
                  onChange={(e) => setRegionalFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Todas</option>
                  {availableRegionals.map(regional => (
                    <option key={regional} value={regional}>{regional}</option>
                  ))}
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

      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0">
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-blue-100 uppercase tracking-wide mb-4">Valor Total Aprovado</p>
            <p className="text-4xl font-bold">{formatCurrency(kpis.totalPaidValue)}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0">
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-green-100 uppercase tracking-wide mb-4">Relatórios Aprovados</p>
            <p className="text-4xl font-bold">{kpis.totalPaidReports}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0">
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-purple-100 uppercase tracking-wide mb-4">Média por Relatório</p>
            <p className="text-4xl font-bold">{formatCurrency(kpis.averagePaidValue)}</p>
          </CardContent>
        </Card>
      </div>

      {/* KPIs Secundários */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Fluxo de Caixa Total
            </CardTitle>
            <div className="p-2 bg-blue-100 rounded-lg">
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{formatCurrency(kpis.totalCashFlow)}</div>
            <p className="text-xs text-gray-500 mt-2">Total de despesas no período</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Top Centro de Custo
            </CardTitle>
            <div className="p-2 bg-green-100 rounded-lg">
              <Wallet className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {Object.entries(kpis.byCostCenter).sort(([, a], [, b]) => b - a)[0]?.[0] || '-'}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {Object.entries(kpis.byCostCenter).sort(([, a], [, b]) => b - a)[0]?.[1] ? formatCurrency(Object.entries(kpis.byCostCenter).sort(([, a], [, b]) => b - a)[0]?.[1] as number) : 'R$ 0,00'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Fluxo por Mês */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Fluxo de Caixa por Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={Object.entries(kpis.byMonth).map(([month, valor]) => ({ month, valor }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                <Bar dataKey="valor" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Gráfico por Centro de Custo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Distribuição por Centro de Custo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={Object.entries(kpis.byCostCenter)
                .map(([cc, valor]) => ({ centro: cc, valor }))
                .sort((a, b) => b.valor - a.valor)
                .slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="centro" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                <Bar dataKey="valor" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Linha - Evolução Temporal */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Evolução Temporal do Fluxo de Caixa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={Object.entries(kpis.byMonth).map(([month, valor]) => ({ month, valor }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value as number)} />
              <Line type="monotone" dataKey="valor" stroke="#8b5cf6" strokeWidth={2} />
            </LineChart>
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
                  <p className="text-xs text-gray-500">{regional.count} despesas</p>
                </div>
              </div>
            )) : (
              <p className="text-gray-500 text-sm text-center py-4">Nenhum dado disponível</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabela Detalhada de Colaboradores */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
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
                {collaboratorTable.length > 0 ? collaboratorTable.map((collab) => (
                  <tr key={collab.name} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900 font-medium">{collab.name}</td>
                    <td className="py-3 px-4 text-sm text-gray-900 font-bold">{formatCurrency(collab.value)}</td>
                    <td className="py-3 px-4 text-sm text-gray-900">{collab.count}</td>
                    <td className="py-3 px-4 text-sm">
                      <Badge variant="outline">{collab.regional}</Badge>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-gray-500 text-sm">Nenhum dado disponível</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Relatórios Aprovados */}
      <Card>
        <CardHeader>
          <CardTitle>Relatórios Aprovados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">ID</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Descrição</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Usuário</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Data Criação</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Data Pagamento</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Valor</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedReports.map((report) => {
                  const reportExpenses = cashFlowData.filter(e => e.expense_id === report.id || e.report?.data?.id === report.id);
                  const reportValue = reportExpenses.reduce((sum, exp) => sum + (exp.value || 0), 0);
                  
                  return (
                    <tr key={report.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm text-gray-900">{report.id}</td>
                      <td className="py-3 px-4 text-sm text-gray-900">{report.description || '-'}</td>
                      <td className="py-3 px-4 text-sm text-gray-900">{report.user?.data?.name || '-'}</td>
                      <td className="py-3 px-4 text-sm text-gray-900">{formatDate(report.created_at)}</td>
                      <td className="py-3 px-4 text-sm text-gray-900">{report.payment_date ? formatDate(report.payment_date) : '-'}</td>
                      <td className="py-3 px-4 text-sm text-gray-900 font-medium">{formatCurrency(reportValue)}</td>
                      <td className="py-3 px-4 text-sm">
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {paginatedReports.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-500">
                      Nenhum relatório aprovado encontrado com os filtros atuais
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-600">
                Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, filteredReports.length)} de {filteredReports.length} resultados
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
