'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Receipt, 
  Search, 
  Filter, 
  Download, 
  ChevronDown,
  Calendar,
  Building2,
  TrendingUp,
  DollarSign,
  AlertCircle
} from 'lucide-react';
import { useExpenses, useCostCenters } from '@/lib/hooks';

export default function DespesasPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [costCenterFilter, setCostCenterFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('month');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;
  
  // Data padrão: último mês
  const today = new Date();
  const defaultStartDate = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate()).toISOString().split('T')[0];
  const defaultEndDate = today.toISOString().split('T')[0];
  
  const { data: expenses = [], isLoading } = useExpenses({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
  });
  
  const { data: costCenters = [] } = useCostCenters();
  
  // Filtrar despesas
  const filteredExpenses = useMemo(() => {
    let filtered = [...expenses];
    
    // Filtro de busca
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(e => 
        e.expense_type?.data?.description?.toLowerCase().includes(term) ||
        e.costs_center?.data?.name?.toLowerCase().includes(term) ||
        e.date?.includes(term)
      );
    }
    
    // Filtro de centro de custo
    if (costCenterFilter !== 'all') {
      filtered = filtered.filter(e => e.costs_center?.data?.name === costCenterFilter);
    }
    
    // Filtro de data
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
  }, [expenses, searchTerm, costCenterFilter, dateFilter]);
  
  // Paginação
  const totalPages = Math.ceil(filteredExpenses.length / itemsPerPage);
  const paginatedExpenses = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredExpenses.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredExpenses, currentPage]);
  
  // Calcular totais
  const totals = useMemo(() => {
    const totalValue = filteredExpenses.reduce((sum, exp) => sum + (exp.value || 0), 0);
    const avgValue = filteredExpenses.length > 0 ? totalValue / filteredExpenses.length : 0;
    
    // Agrupar por tipo de despesa
    const byType = filteredExpenses.reduce((acc, exp) => {
      const type = exp.expense_type?.data?.description || 'Outros';
      acc[type] = (acc[type] || 0) + (exp.value || 0);
      return acc;
    }, {} as Record<string, number>);
    
    // Agrupar por centro de custo
    const byCostCenter = filteredExpenses.reduce((acc, exp) => {
      const cc = exp.costs_center?.data?.name || 'Outros';
      acc[cc] = (acc[cc] || 0) + (exp.value || 0);
      return acc;
    }, {} as Record<string, number>);
    
    return {
      total: totalValue,
      average: avgValue,
      count: filteredExpenses.length,
      byType,
      byCostCenter,
    };
  }, [filteredExpenses]);

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
    setCostCenterFilter('all');
    setDateFilter('month');
    setCurrentPage(1);
  };

  const topExpenseTypes = Object.entries(totals.byType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  const topCostCenters = Object.entries(totals.byCostCenter)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Despesas</h1>
          <p className="text-gray-600 mt-1">Análise detalhada de todas as despesas</p>
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

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0">
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-blue-100 uppercase tracking-wide mb-4">Valor Total</p>
            <p className="text-4xl font-bold">{formatCurrency(totals.total)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0">
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-green-100 uppercase tracking-wide mb-4">Valor Médio</p>
            <p className="text-4xl font-bold">{formatCurrency(totals.average)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0">
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-purple-100 uppercase tracking-wide mb-4">Total Despesas</p>
            <p className="text-4xl font-bold">{totals.count}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white border-0">
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-orange-100 uppercase tracking-wide mb-4">Tipos</p>
            <p className="text-4xl font-bold">{Object.keys(totals.byType).length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Categorias */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Tipos de Despesa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topExpenseTypes.length > 0 ? topExpenseTypes.map(([type, value], index) => (
                <div key={type} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="w-8 h-8 flex items-center justify-center rounded-full">
                      {index + 1}
                    </Badge>
                    <span className="font-medium">{type}</span>
                  </div>
                  <span className="font-bold">{formatCurrency(value)}</span>
                </div>
              )) : (
                <p className="text-gray-500 text-sm">Nenhum dado disponível</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Top Centros de Custo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topCostCenters.length > 0 ? topCostCenters.map(([center, value], index) => (
                <div key={center} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="w-8 h-8 flex items-center justify-center rounded-full">
                      {index + 1}
                    </Badge>
                    <span className="font-medium">{center}</span>
                  </div>
                  <span className="font-bold">{formatCurrency(value)}</span>
                </div>
              )) : (
                <p className="text-gray-500 text-sm">Nenhum dado disponível</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      {showFilters && (
        <Card className="border-2 border-blue-200">
          <CardContent className="p-6 pt-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-4">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Buscar
                </label>
                <Input
                  placeholder="Tipo, centro de custo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
              
              <div className="space-y-4">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Centro de Custo
                </label>
                <select
                  value={costCenterFilter}
                  onChange={(e) => setCostCenterFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Todos</option>
                  {costCenters.map(cc => (
                    <option key={cc.id} value={cc.name}>{cc.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="space-y-4">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Período
                </label>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Todos</option>
                  <option value="today">Hoje</option>
                  <option value="week">Última semana</option>
                  <option value="month">Último mês</option>
                </select>
              </div>
              
              <div className="space-y-4">
                <label className="text-sm font-medium text-gray-700">Ações</label>
                <Button
                  onClick={resetFilters}
                  variant="outline"
                  className="w-full"
                >
                  Limpar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de Despesas */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Despesas</CardTitle>
              <CardDescription>
                {filteredExpenses.length} despesas encontradas
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600 font-medium">Carregando despesas...</p>
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Receipt className="h-16 w-16 text-gray-300 mb-4" />
              <p className="text-gray-500 font-medium text-lg">Nenhuma despesa encontrada</p>
              <p className="text-gray-400 text-sm mt-2">Tente ajustar os filtros ou a busca</p>
              <Button
                onClick={resetFilters}
                variant="outline"
                className="mt-4"
              >
                Limpar Filtros
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedExpenses.map((expense) => (
                <div
                  key={expense.id}
                  className="group border rounded-xl p-4 hover:shadow-lg hover:border-blue-300 transition-all bg-white hover:bg-blue-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-700 transition-colors">
                          {expense.expense_type?.data?.description || 'Despesa'}
                        </h3>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-2">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span>{formatDate(expense.date)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-4 w-4 text-gray-400" />
                          <span>{expense.costs_center?.data?.name || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex-shrink-0 text-right">
                      <p className="text-2xl font-bold text-gray-900">
                        {formatCurrency(expense.value)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <p className="text-sm text-gray-600">
                    Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, filteredExpenses.length)} de {filteredExpenses.length}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Anterior
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const pageNum = i + 1;
                        return (
                          <Button
                            key={pageNum}
                            size="sm"
                            variant={currentPage === pageNum ? "default" : "outline"}
                            onClick={() => setCurrentPage(pageNum)}
                            className="w-8 h-8 p-0"
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
