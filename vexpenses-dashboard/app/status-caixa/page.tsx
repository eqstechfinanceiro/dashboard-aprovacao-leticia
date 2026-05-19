'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Wallet,
  Search,
  Filter,
  Download,
  ChevronDown,
  Calendar,
  User,
  Building2,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  DollarSign,
  Eye,
  BarChart3
} from 'lucide-react';
import { useStatusCaixa, useCostCenters, useTeamMembers } from '@/lib/hooks';
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

export default function StatusCaixa() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ABERTO' | 'ENVIADO' | 'APROVADO' | 'REPROVADO' | 'PAGO' | 'REABERTO'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('month');
  const [costCenterFilter, setCostCenterFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

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

  // Filtrar relatórios
  const filteredReports = useMemo(() => {
    let filtered = [...reports];

    // Filtro de status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter);
    }

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
        // Verificar se o usuário do relatório pertence ao centro de custo selecionado
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
  }, [reports, statusFilter, searchTerm, costCenterFilter, userFilter, dateFilter, teamMembers]);

  // Paginação
  const totalPages = Math.ceil(filteredReports.length / itemsPerPage);
  const paginatedReports = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredReports.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredReports, currentPage]);

  // Calcular KPIs
  const kpis = useMemo(() => {
    const byStatus = filteredReports.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calcular valor total por status (precisamos buscar as despesas de cada relatório)
    const valueByStatus = filteredReports.reduce((acc, r) => {
      const totalValue = r.expenses?.data?.reduce((sum, exp) => sum + (exp.value || 0), 0) || 0;
      acc[r.status] = (acc[r.status] || 0) + totalValue;
      return acc;
    }, {} as Record<string, number>);

    // Calcular tempo médio de aprovação (para relatórios aprovados)
    const approvedReports = filteredReports.filter(r => r.status === 'APROVADO' && r.approval_date);
    const avgApprovalTime = approvedReports.length > 0
      ? approvedReports.reduce((sum, r) => {
          const created = new Date(r.created_at).getTime();
          const approved = new Date(r.approval_date).getTime();
          return sum + (approved - created);
        }, 0) / approvedReports.length
      : 0;

    // Taxa de conversão (enviado -> aprovado)
    const sentCount = byStatus['ENVIADO'] || 0;
    const approvedCount = byStatus['APROVADO'] || 0;
    const conversionRate = sentCount > 0 ? (approvedCount / sentCount) * 100 : 0;

    return {
      byStatus,
      valueByStatus,
      avgApprovalTime: Math.round(avgApprovalTime / (1000 * 60 * 60 * 24)), // em dias
      conversionRate: Math.round(conversionRate),
      total: filteredReports.length,
    };
  }, [filteredReports]);

  // Dados para gráfico de evolução temporal (movido para o nível superior do componente)
  const monthlyData = useMemo(() => {
    // Agrupar relatórios por mês e status
    const dataMap = new Map();
    
    filteredReports.forEach(report => {
      const date = new Date(report.created_at);
      const monthKey = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      
      if (!dataMap.has(monthKey)) {
        dataMap.set(monthKey, { month: monthKey, Aberto: 0, Enviado: 0, Aprovado: 0, Reprovado: 0, Pago: 0, Reaberto: 0 });
      }
      
      const data = dataMap.get(monthKey);
      const statusKey = report.status === 'ABERTO' ? 'Aberto' :
                      report.status === 'ENVIADO' ? 'Enviado' :
                      report.status === 'APROVADO' ? 'Aprovado' :
                      report.status === 'REPROVADO' ? 'Reprovado' :
                      report.status === 'PAGO' ? 'Pago' : 'Reaberto';
      
      if (data && statusKey in data) {
        data[statusKey as keyof typeof data]++;
      }
    });
    
    return Array.from(dataMap.values()).sort((a, b) => 
      new Date(a.month).getTime() - new Date(b.month).getTime()
    );
  }, [filteredReports]);

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APROVADO':
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-200 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Aprovado
          </Badge>
        );
      case 'REPROVADO':
        return (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-200 border-red-200">
            <XCircle className="h-3 w-3 mr-1" />
            Reprovado
          </Badge>
        );
      case 'ABERTO':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-200">
            <Clock className="h-3 w-3 mr-1" />
            Aberto
          </Badge>
        );
      case 'ENVIADO':
        return (
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200">
            <AlertCircle className="h-3 w-3 mr-1" />
            Enviado
          </Badge>
        );
      case 'PAGO':
        return (
          <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200 border-purple-200">
            <DollarSign className="h-3 w-3 mr-1" />
            Pago
          </Badge>
        );
      case 'REABERTO':
        return (
          <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-200">
            <AlertCircle className="h-3 w-3 mr-1" />
            Reaberto
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-200 border-gray-200">
            {status}
          </Badge>
        );
    }
  };

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setDateFilter('month');
    setCostCenterFilter('all');
    setUserFilter('all');
    setCurrentPage(1);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando status de caixa...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Status de Caixa</h1>
          <p className="text-gray-600 mt-1">Acompanhamento de aberturas e status de caixas</p>
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
                <label className="text-sm font-medium text-gray-700 mb-2 block">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Todos</option>
                  <option value="ABERTO">Aberto</option>
                  <option value="ENVIADO">Enviado</option>
                  <option value="APROVADO">Aprovado</option>
                  <option value="REPROVADO">Reprovado</option>
                  <option value="PAGO">Pago</option>
                  <option value="REABERTO">Reaberto</option>
                </select>
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0">
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-blue-100 uppercase tracking-wide mb-4">Total</p>
            <p className="text-4xl font-bold">{kpis.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white border-0">
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-yellow-100 uppercase tracking-wide mb-4">Abertos</p>
            <p className="text-4xl font-bold">{kpis.byStatus['ABERTO'] || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-400 to-blue-500 text-white border-0">
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-blue-100 uppercase tracking-wide mb-4">Enviados</p>
            <p className="text-4xl font-bold">{kpis.byStatus['ENVIADO'] || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0">
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-green-100 uppercase tracking-wide mb-4">Aprovados</p>
            <p className="text-4xl font-bold">{kpis.byStatus['APROVADO'] || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0">
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-purple-100 uppercase tracking-wide mb-4">Pagos</p>
            <p className="text-4xl font-bold">{kpis.byStatus['PAGO'] || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* KPIs Secundários */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Taxa de Conversão
            </CardTitle>
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{kpis.conversionRate}%</div>
            <p className="text-xs text-gray-500 mt-2">Enviado → Aprovado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Valor Total Aprovado
            </CardTitle>
            <div className="p-2 bg-purple-100 rounded-lg">
              <DollarSign className="h-4 w-4 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{formatCurrency(kpis.valueByStatus['APROVADO'] || 0)}</div>
            <p className="text-xs text-gray-500 mt-2">No período</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              <BarChart data={Object.entries(kpis.byStatus).map(([status, count]) => ({
                status: status.replace('ABERTO', 'Aberto')
                          .replace('ENVIADO', 'Enviado')
                          .replace('APROVADO', 'Aprovado')
                          .replace('REPROVADO', 'Reprovado')
                          .replace('PAGO', 'Pago')
                          .replace('REABERTO', 'Reaberto'),
                count
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Gráfico de Valor por Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Valor por Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={Object.entries(kpis.valueByStatus).map(([status, value]) => ({
                status: status.replace('ABERTO', 'Aberto')
                          .replace('ENVIADO', 'Enviado')
                          .replace('APROVADO', 'Aprovado')
                          .replace('REPROVADO', 'Reprovado')
                          .replace('PAGO', 'Pago')
                          .replace('REABERTO', 'Reaberto'),
                valor: value
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                <Bar dataKey="valor" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Evolução Temporal */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Evolução Temporal por Status
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
              <Line type="monotone" dataKey="Aberto" stroke="#eab308" strokeWidth={2} />
              <Line type="monotone" dataKey="Enviado" stroke="#3b82f6" strokeWidth={2} />
              <Line type="monotone" dataKey="Aprovado" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="Reprovado" stroke="#ef4444" strokeWidth={2} />
              <Line type="monotone" dataKey="Pago" stroke="#8b5cf6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tabela Detalhada */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhamento por Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">ID</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Descrição</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Usuário</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Data Criação</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Data Aprovação</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedReports.map((report) => (
                  <tr key={report.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900">{report.id}</td>
                    <td className="py-3 px-4 text-sm text-gray-900">{report.description || '-'}</td>
                    <td className="py-3 px-4 text-sm text-gray-900">{report.user?.data?.name || '-'}</td>
                    <td className="py-3 px-4 text-sm">{getStatusBadge(report.status)}</td>
                    <td className="py-3 px-4 text-sm text-gray-900">{formatDate(report.created_at)}</td>
                    <td className="py-3 px-4 text-sm text-gray-900">{report.approval_date ? formatDate(report.approval_date) : '-'}</td>
                    <td className="py-3 px-4 text-sm">
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {paginatedReports.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-500">
                      Nenhum relatório encontrado com os filtros atuais
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
