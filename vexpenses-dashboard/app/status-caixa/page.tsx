'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import * as XLSX from 'xlsx';
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
  BarChart3,
  Users,
  Check,
  X
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

export default function StatusCaixa() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ABERTO' | 'ENVIADO' | 'APROVADO' | 'REPROVADO' | 'REABERTO' | 'CONFERIDO'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('month');
  const [costCenterFilter, setCostCenterFilter] = useState('all');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showUserDropdownInline, setShowUserDropdownInline] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [cardFilter, setCardFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [regionalFilter, setRegionalFilter] = useState('all');
  const [activeCard, setActiveCard] = useState<string | null>(null);

  // Data padrão: último mês
  const today = new Date();
  const defaultStartDate = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate()).toISOString().split('T')[0];
  const defaultEndDate = today.toISOString().split('T')[0];

  const { data: reports = [], isLoading, error: reportsError } = useStatusCaixa({
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

  const hasError = !!reportsError; // Only block on critical data error
  const combinedError = reportsError;

  // Extrair filtros disponíveis
  const availableCards = useMemo(() => {
    const cards = new Set<string>();
    expenses.forEach(exp => {
      if (exp.payment_method?.data?.description) {
        cards.add(exp.payment_method.data.description);
      }
    });
    return Array.from(cards).sort();
  }, [expenses]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    reports.forEach(report => {
      const year = new Date(report.created_at).getFullYear();
      years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [reports]);

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

    // Filtro de usuário (múltipla seleção)
    if (selectedUserIds.size > 0) {
      filtered = filtered.filter(r => selectedUserIds.has(r.user_id));
    }

    // Filtro de cartão (baseado nas despesas do relatório)
    if (cardFilter !== 'all') {
      filtered = filtered.filter(r => {
        const reportExpenses = expenses.filter(e => e.expense_id === r.id || e.report?.data?.id === r.id);
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
  }, [reports, statusFilter, searchTerm, costCenterFilter, selectedUserIds, dateFilter, teamMembers, expenses, cardFilter, yearFilter, regionalFilter]);

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

    // Calcular valor total por status usando os dados de expenses
    // Criar um mapa de report_id -> valor total
    const reportValueMap = expenses.reduce((acc, exp) => {
      // A API VExpenses retorna expense_id que corresponde ao ID do report
      const reportId = exp.expense_id || exp.report?.data?.id;
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
  }, [filteredReports, expenses]);

  // Dados para gráfico de evolução temporal (movido para o nível superior do componente)
  const monthlyData = useMemo(() => {
    // Agrupar relatórios por mês e status
    const dataMap = new Map();
    
    filteredReports.forEach(report => {
      const date = new Date(report.created_at);
      const monthKey = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      
      if (!dataMap.has(monthKey)) {
        dataMap.set(monthKey, { month: monthKey, Aberto: 0, Enviado: 0, Aprovado: 0, Reprovado: 0, Reaberto: 0, Conferido: 0 });
      }

      const data = dataMap.get(monthKey);
      const statusKey = report.status === 'ABERTO' ? 'Aberto' :
                      report.status === 'ENVIADO' ? 'Enviado' :
                      report.status === 'APROVADO' ? 'Aprovado' :
                      report.status === 'REPROVADO' ? 'Reprovado' :
                      report.status === 'REABERTO' ? 'Reaberto' : 'Conferido';
      
      if (data && statusKey in data) {
        data[statusKey as keyof typeof data]++;
      }
    });
    
    return Array.from(dataMap.values()).sort((a, b) =>
      new Date(a.month).getTime() - new Date(b.month).getTime()
    );
  }, [filteredReports]);

  // Rankings por regional
  const regionalRankings = useMemo(() => {
    const regionalStats = filteredReports.reduce((acc, r) => {
      const userCostCenter = teamMembers.find(m => m.id === r.user_id)?.costs_center?.data?.name;
      if (!userCostCenter) return acc;

      // Extrair sigla de estado do nome (ex: "CLARO INFRA SC" -> "SC")
      const match = userCostCenter.match(/\b([A-Z]{2})\b$/);
      const regional = match ? match[1] : 'Outros';

      if (!acc[regional]) {
        acc[regional] = { name: regional, count: 0, value: 0 };
      }

      acc[regional].count++;

      // Calcular valor do relatório
      const reportExpenses = expenses.filter(e => e.expense_id === r.id || e.report?.data?.id === r.id);
      const reportValue = reportExpenses.reduce((sum, exp) => sum + (exp.value || 0), 0);
      acc[regional].value += reportValue;

      return acc;
    }, {} as Record<string, { name: string; count: number; value: number }>);

    return Object.values(regionalStats)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredReports, expenses, teamMembers]);

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
      const reportExpenses = expenses.filter(e => e.expense_id === r.id || e.report?.data?.id === r.id);
      const reportValue = reportExpenses.reduce((sum, exp) => sum + (exp.value || 0), 0);
      acc[userName].value += reportValue;

      return acc;
    }, {} as Record<string, { name: string; count: number; value: number; regional: string }>);

    return Object.values(collaboratorStats)
      .sort((a, b) => b.value - a.value);
  }, [filteredReports, expenses, teamMembers]);

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
      case 'REABERTO':
        return (
          <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-200">
            <AlertCircle className="h-3 w-3 mr-1" />
            Reaberto
          </Badge>
        );
      case 'CONFERIDO':
        return (
          <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200 border-purple-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Conferido
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
    setSelectedUserIds(new Set());
    setUserSearchTerm('');
    setCardFilter('all');
    setYearFilter('all');
    setRegionalFilter('all');
    setActiveCard(null);
    setCurrentPage(1);
  };

  const handleCardClick = (status: string) => {
    if (activeCard === status) {
      setActiveCard(null);
      setStatusFilter('all');
    } else {
      setActiveCard(status);
      setStatusFilter(status as any);
    }
    setCurrentPage(1);
  };

  const handleExport = useCallback(() => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Resumo por Status
    const statusLabels: Record<string, string> = {
      ABERTO: 'Aberto', ENVIADO: 'Enviado', APROVADO: 'Aprovado',
      REPROVADO: 'Reprovado', REABERTO: 'Reaberto', CONFERIDO: 'Conferido',
    };
    const allStatuses = ['ABERTO', 'ENVIADO', 'APROVADO', 'REPROVADO', 'REABERTO', 'CONFERIDO'];
    const summaryData: (string | number)[][] = [
      ['Status', 'Quantidade', 'Valor Total'],
      ...allStatuses.map(s => [
        statusLabels[s] || s,
        kpis.byStatus[s] || 0,
        kpis.valueByStatus[s] || 0,
      ]),
      ['TOTAL', kpis.total, Object.values(kpis.valueByStatus).reduce((a, b) => a + b, 0)],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo por Status');

    // Sheet 2: Colaboradores
    const collabData: (string | number)[][] = [
      ['Colaborador', 'Regional', 'Quantidade', 'Valor'],
      ...collaboratorTable.map(c => [c.name, c.regional, c.count, c.value]),
    ];
    const wsCollab = XLSX.utils.aoa_to_sheet(collabData);
    wsCollab['!cols'] = [{ wch: 35 }, { wch: 15 }, { wch: 15 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsCollab, 'Colaboradores');

    // Sheet 3: Rankings por Regional
    const regionalData: (string | number)[][] = [
      ['Regional', 'Quantidade', 'Valor'],
      ...regionalRankings.map(r => [r.name, r.count, r.value]),
    ];
    const wsRegional = XLSX.utils.aoa_to_sheet(regionalData);
    wsRegional['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsRegional, 'Rankings por Regional');

    // Sheet 4: Detalhamento de Relatórios
    const reportValueMap = expenses.reduce((acc, exp) => {
      const reportId = exp.expense_id || exp.report?.data?.id;
      if (reportId) acc[reportId] = (acc[reportId] || 0) + (exp.value || 0);
      return acc;
    }, {} as Record<number, number>);

    const detailData: (string | number)[][] = [
      ['ID', 'Descrição', 'Usuário', 'Status', 'Valor', 'Data Criação', 'Data Aprovação'],
      ...filteredReports.map(r => [
        r.id,
        r.description || '-',
        r.user?.data?.name || '-',
        statusLabels[r.status] || r.status,
        reportValueMap[r.id] || 0,
        formatDate(r.created_at),
        r.approval_date ? formatDate(r.approval_date) : '-',
      ]),
    ];
    const wsDetail = XLSX.utils.aoa_to_sheet(detailData);
    wsDetail['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalhamento');

    const fileName = `status-caixa-${defaultStartDate}_${defaultEndDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }, [kpis, collaboratorTable, regionalRankings, filteredReports, expenses, defaultStartDate, defaultEndDate]);

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
            onClick={handleExport}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar XLSX
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
                  <option value="REABERTO">Reaberto</option>
                  <option value="CONFERIDO">Conferido</option>
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
              <div className="relative">
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Usuários {selectedUserIds.size > 0 && (
                    <Badge className="ml-1 bg-blue-500 text-white text-xs">{selectedUserIds.size}</Badge>
                  )}
                </label>
                <div
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-h-[40px] flex items-center justify-between bg-white"
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                >
                  <span className="text-sm text-gray-600 truncate">
                    {selectedUserIds.size === 0
                      ? 'Todos os usuários'
                      : `${selectedUserIds.size} selecionado(s)`
                    }
                  </span>
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showUserDropdown ? 'rotate-180' : ''}`} />
                </div>
                {showUserDropdown && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-80 overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <Input
                          placeholder="Buscar usuário..."
                          value={userSearchTerm}
                          onChange={(e) => setUserSearchTerm(e.target.value)}
                          className="pl-8 h-8 text-sm"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <button
                          className="text-xs text-blue-600 hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUserIds(new Set(teamMembers.map(m => m.id)));
                          }}
                        >
                          Selecionar todos
                        </button>
                        <button
                          className="text-xs text-gray-500 hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUserIds(new Set());
                          }}
                        >
                          Limpar
                        </button>
                      </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {teamMembers
                        .filter(m => m.name?.toLowerCase().includes(userSearchTerm.toLowerCase()))
                        .map(member => {
                          const isSelected = selectedUserIds.has(member.id);
                          return (
                            <div
                              key={member.id}
                              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedUserIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(member.id)) {
                                    next.delete(member.id);
                                  } else {
                                    next.add(member.id);
                                  }
                                  return next;
                                });
                              }}
                            >
                              <div className={`flex items-center justify-center h-4 w-4 rounded border ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                                {isSelected && <Check className="h-3 w-3 text-white" />}
                              </div>
                              <span className="text-gray-700 truncate">{member.name}</span>
                            </div>
                          );
                        })
                      }
                      {teamMembers.filter(m => m.name?.toLowerCase().includes(userSearchTerm.toLowerCase())).length === 0 && (
                        <p className="text-center text-gray-400 text-sm py-4">Nenhum usuário encontrado</p>
                      )}
                    </div>
                  </div>
                )}
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

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card
          className={`bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 cursor-pointer transition-all hover:scale-105 hover:shadow-lg ${activeCard === 'all' ? 'ring-4 ring-blue-300 scale-105' : ''}`}
          onClick={() => handleCardClick('all')}
        >
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-blue-100 uppercase tracking-wide mb-4">Total</p>
            <p className="text-4xl font-bold">{kpis.total}</p>
            <p className="text-sm text-blue-100 mt-2">{formatCurrency(Object.values(kpis.valueByStatus).reduce((a, b) => a + b, 0))}</p>
          </CardContent>
        </Card>
        <Card
          className={`bg-gradient-to-br from-yellow-500 to-yellow-600 text-white border-0 cursor-pointer transition-all hover:scale-105 hover:shadow-lg ${activeCard === 'ABERTO' ? 'ring-4 ring-yellow-300 scale-105' : ''}`}
          onClick={() => handleCardClick('ABERTO')}
        >
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-yellow-100 uppercase tracking-wide mb-4">Abertos</p>
            <p className="text-4xl font-bold">{kpis.byStatus['ABERTO'] || 0}</p>
            <p className="text-sm text-yellow-100 mt-2">{formatCurrency(kpis.valueByStatus['ABERTO'] || 0)}</p>
          </CardContent>
        </Card>
        <Card
          className={`bg-gradient-to-br from-blue-400 to-blue-500 text-white border-0 cursor-pointer transition-all hover:scale-105 hover:shadow-lg ${activeCard === 'ENVIADO' ? 'ring-4 ring-blue-300 scale-105' : ''}`}
          onClick={() => handleCardClick('ENVIADO')}
        >
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-blue-100 uppercase tracking-wide mb-4">Enviados</p>
            <p className="text-4xl font-bold">{kpis.byStatus['ENVIADO'] || 0}</p>
            <p className="text-sm text-blue-100 mt-2">{formatCurrency(kpis.valueByStatus['ENVIADO'] || 0)}</p>
          </CardContent>
        </Card>
        <Card
          className={`bg-gradient-to-br from-green-500 to-green-600 text-white border-0 cursor-pointer transition-all hover:scale-105 hover:shadow-lg ${activeCard === 'APROVADO' ? 'ring-4 ring-green-300 scale-105' : ''}`}
          onClick={() => handleCardClick('APROVADO')}
        >
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-green-100 uppercase tracking-wide mb-4">Aprovados</p>
            <p className="text-4xl font-bold">{kpis.byStatus['APROVADO'] || 0}</p>
            <p className="text-sm text-green-100 mt-2">{formatCurrency(kpis.valueByStatus['APROVADO'] || 0)}</p>
          </CardContent>
        </Card>
        <Card
          className={`bg-gradient-to-br from-red-500 to-red-600 text-white border-0 cursor-pointer transition-all hover:scale-105 hover:shadow-lg ${activeCard === 'REPROVADO' ? 'ring-4 ring-red-300 scale-105' : ''}`}
          onClick={() => handleCardClick('REPROVADO')}
        >
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-red-100 uppercase tracking-wide mb-4">Reprovados</p>
            <p className="text-4xl font-bold">{kpis.byStatus['REPROVADO'] || 0}</p>
            <p className="text-sm text-red-100 mt-2">{formatCurrency(kpis.valueByStatus['REPROVADO'] || 0)}</p>
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
              <Line type="monotone" dataKey="Reaberto" stroke="#f97316" strokeWidth={2} />
              <Line type="monotone" dataKey="Conferido" stroke="#8b5cf6" strokeWidth={2} />
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
                  <p className="text-xs text-gray-500">{regional.count} relatórios</p>
                </div>
              </div>
            )) : (
              <p className="text-gray-500 text-sm text-center py-4">Nenhum dado disponível</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filtro inline de usuários antes das tabelas */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-72" data-filter="user-inline">
          <div
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-h-[38px] flex items-center justify-between bg-white"
            onClick={() => setShowUserDropdownInline(!showUserDropdownInline)}
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="text-sm text-gray-600 truncate">
                {selectedUserIds.size === 0
                  ? 'Todos os usuários'
                  : `${selectedUserIds.size} selecionado(s)`}
              </span>
              {selectedUserIds.size > 0 && (
                <Badge className="bg-blue-500 text-white text-xs">{selectedUserIds.size}</Badge>
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform shrink-0 ${showUserDropdownInline ? 'rotate-180' : ''}`} />
          </div>
          {showUserDropdownInline && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-80 overflow-hidden flex flex-col">
              <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Buscar usuário..."
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    className="pl-8 h-8 text-sm"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <button
                    className="text-xs text-blue-600 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedUserIds(new Set(teamMembers.map(m => m.id)));
                    }}
                  >
                    Selecionar todos
                  </button>
                  <button
                    className="text-xs text-gray-500 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedUserIds(new Set());
                    }}
                  >
                    Limpar
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto flex-1">
                {teamMembers
                  .filter(m => m.name?.toLowerCase().includes(userSearchTerm.toLowerCase()))
                  .map(member => {
                    const isSelected = selectedUserIds.has(member.id);
                    return (
                      <div
                        key={member.id}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedUserIds(prev => {
                            const next = new Set(prev);
                            if (next.has(member.id)) {
                              next.delete(member.id);
                            } else {
                              next.add(member.id);
                            }
                            return next;
                          });
                        }}
                      >
                        <div className={`flex items-center justify-center h-4 w-4 rounded border ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <span className="text-gray-700 truncate">{member.name}</span>
                      </div>
                    );
                  })
                }
                {teamMembers.filter(m => m.name?.toLowerCase().includes(userSearchTerm.toLowerCase())).length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-4">Nenhum usuário encontrado</p>
                )}
              </div>
            </div>
          )}
        </div>
        {(selectedUserIds.size > 0 || statusFilter !== 'all' || searchTerm || costCenterFilter !== 'all' || cardFilter !== 'all' || yearFilter !== 'all' || regionalFilter !== 'all' || activeCard) && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="text-gray-500">
            <X className="h-4 w-4 mr-1" />
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Tabela Detalhada de Colaboradores */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Tabela Detalhada de Colaboradores
            {activeCard && activeCard !== 'all' && (
              <Badge variant="secondary" className="ml-2">
                {activeCard === 'ABERTO' ? 'Abertos' :
                 activeCard === 'ENVIADO' ? 'Enviados' :
                 activeCard === 'APROVADO' ? 'Aprovados' :
                 activeCard === 'REPROVADO' ? 'Reprovados' :
                 activeCard === 'REABERTO' ? 'Reabertos' : activeCard}
              </Badge>
            )}
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
