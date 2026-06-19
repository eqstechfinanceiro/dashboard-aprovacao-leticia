'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, FileText, TrendingUp, Users, Clock } from 'lucide-react';
import { useCostCenters, useExpenses, useReports, useCacheMetadata } from '@/lib/hooks';
import { PreloadProgress } from '@/components/preload-progress';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';

interface Expense {
  id: number;
  value: number;
  date: string;
  expense_type: {
    data: {
      description: string;
    };
  };
  costs_center: {
    data: {
      name: string;
    };
  };
}

interface Report {
  id: number;
  status: string;
  description: string;
  user: {
    data: {
      name: string;
    };
  };
  created_at: string;
}

interface CostCenter {
  id: number;
  name: string;
  company_group_id: number;
}

interface Regional {
  id: number;
  name: string;
}

export default function Dashboard() {
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedPeriod, setSelectedPeriod] = useState<'current-month' | '3-months' | '6-months' | 'full-year' | 'custom'>('current-month');
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>('all');
  const [selectedRegional, setSelectedRegional] = useState<string>('all');
  const [showCacheInfo, setShowCacheInfo] = useState(false);
  
  // Filtros customizados para período específico
  const [customStartMonth, setCustomStartMonth] = useState<string>('01'); // Formato MM
  const [customEndMonth, setCustomEndMonth] = useState<string>('12'); // Formato MM

  // Função para calcular o intervalo de datas baseado no período
  const getDateRange = (year: string, period: string, startMonth?: string, endMonth?: string) => {
    const currentYear = new Date().getFullYear();
    const isCurrentYear = year === currentYear.toString();
    const currentMonth = new Date().getMonth();
    
    if (period === 'current-month' && isCurrentYear) {
      // Mês atual
      const startDate = new Date(parseInt(year), currentMonth, 1);
      const endDate = new Date(parseInt(year), currentMonth + 1, 0);
      return {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      };
    } else if (period === '3-months') {
      // Últimos 3 meses
      const startDate = new Date(parseInt(year), Math.max(0, currentMonth - 2), 1);
      const endDate = new Date(parseInt(year), currentMonth + 1, 0);
      return {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      };
    } else if (period === '6-months') {
      // Últimos 6 meses
      const startDate = new Date(parseInt(year), Math.max(0, currentMonth - 5), 1);
      const endDate = new Date(parseInt(year), currentMonth + 1, 0);
      return {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      };
    } else if (period === 'custom' && startMonth && endMonth) {
      // Período customizado (mês específico)
      const startMonthNum = parseInt(startMonth) - 1; // JavaScript months são 0-indexed
      const endMonthNum = parseInt(endMonth) - 1;
      
      const startDate = new Date(parseInt(year), startMonthNum, 1);
      const endDate = new Date(parseInt(year), endMonthNum + 1, 0);
      return {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      };
    } else {
      // Ano completo
      return {
        start: `${year}-01-01`,
        end: `${year}-12-31`
      };
    }
  };

  // Hooks do React Query
  const { data: costCenters = [], isLoading: loadingCostCenters } = useCostCenters();
  const { data: reports = [], isLoading: loadingReports } = useReports();
  
  // Calcular intervalo de datas (memoizado para evitar re-renders infinitos)
  const dateRange = useMemo(() => 
    getDateRange(selectedYear, selectedPeriod, customStartMonth, customEndMonth),
    [selectedYear, selectedPeriod, customStartMonth, customEndMonth]
  );
  
  const { data: expenses = [], isLoading: loadingExpenses } = useExpenses({
    startDate: dateRange.start,
    endDate: dateRange.end,
    costCenterId: selectedCostCenter,
    startMonth: selectedPeriod === 'custom' ? customStartMonth : undefined,
    endMonth: selectedPeriod === 'custom' ? customEndMonth : undefined,
  });

  // Hook para metadados do cache
  const cacheKeys = useMemo(() => [
    'costs-centers',
    'reports:user',
    `expenses:expense_type,costs_center:date:${dateRange.start},${dateRange.end}:1:100${selectedPeriod === 'custom' ? `:custom:${customStartMonth}-${customEndMonth}` : ''}`
  ], [dateRange.start, dateRange.end, selectedPeriod, customStartMonth, customEndMonth]);
  const { data: cacheMetadata = {} } = useCacheMetadata(cacheKeys);

  // Estados para os gráficos
  const [monthlyExpenses, setMonthlyExpenses] = useState<any[]>([]);
  const [expensesByType, setExpensesByType] = useState<any[]>([]);
  const [reportsByStatus, setReportsByStatus] = useState<any[]>([]);

  // Extrair regionais únicas dos centros de custo
  const regionals = React.useMemo(() => {
    const regionalMap = new Map<number, string>();
    costCenters.forEach(center => {
      if (center.company_group_id && !regionalMap.has(center.company_group_id)) {
        regionalMap.set(center.company_group_id, `Regional ${center.company_group_id}`);
      }
    });
    return Array.from(regionalMap.entries()).map(([id, name]) => ({ id, name }));
  }, [costCenters]);

  // Calcular KPIs
  const kpis = React.useMemo(() => {
    const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.value || 0), 0);
    const averageExpense = expenses.length > 0 ? totalExpenses / expenses.length : 0;
    const openReports = reports.filter(r => r.status === 'ABERTO').length;
    const pendingApprovals = openReports;

    return {
      totalExpenses,
      pendingApprovals,
      averageExpense,
      openReports
    };
  }, [expenses, reports]);

  const loading = loadingCostCenters || loadingExpenses || loadingReports;
  const error = null; // React Query lida com erros automaticamente

  // Calcular dados dos gráficos quando os dados mudarem
  useEffect(() => {
    // Só atualizar se tivermos dados
    if (!expenses.length && !reports.length) return;

    // Gráfico 1: Despesas por mês (TEMPORARIAMENTE DESABILITADO devido à lentidão da API)
    // TODO: Implementar solução alternativa (pré-carregamento, dados mockados, ou endpoint de agregação)
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const monthlyData: any[] = [];
    
    // Dados mockados temporários para o gráfico de linha
    for (let i = 5; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      monthlyData.push({
        month: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
        valor: 0 // Dados mockados - será substituído quando a API for mais rápida
      });
    }
    setMonthlyExpenses(monthlyData);

    // Gráfico 2: Despesas por tipo (usar dados do período selecionado)
    const expensesByTypeData: any[] = [];
    const typeMap = new Map();
    expenses.forEach(exp => {
      const type = exp.expense_type?.data?.description || 'Outros';
      const value = exp.value || 0;
      typeMap.set(type, (typeMap.get(type) || 0) + value);
    });
    
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    let colorIndex = 0;
    typeMap.forEach((value, type) => {
      expensesByTypeData.push({
        name: type,
        valor: value,
        color: colors[colorIndex % colors.length]
      });
      colorIndex++;
    });
    setExpensesByType(expensesByTypeData);

    // Gráfico 3: Relatórios por status
    const statusMap = new Map();
    reports.forEach(report => {
      const status = report.status || 'Outros';
      statusMap.set(status, (statusMap.get(status) || 0) + 1);
    });
    
    const statusData: any[] = [];
    statusMap.forEach((count, status) => {
      statusData.push({
        status: status,
        quantidade: count
      });
    });
    setReportsByStatus(statusData);
  }, [expenses.length, reports.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando dashboard...</p>
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
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PreloadProgress />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Visão geral das despesas corporativas</p>
        </div>
        
        <div className="flex gap-3 items-center flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Ano:</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
              <option value="2023">2023</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Período:</label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as any)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="current-month">Mês Atual</option>
              <option value="3-months">Últimos 3 Meses</option>
              <option value="6-months">Últimos 6 Meses</option>
              <option value="full-year">Ano Completo</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>

          {/* Filtros de mês personalizado */}
          {selectedPeriod === 'custom' && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">De:</label>
                <select
                  value={customStartMonth}
                  onChange={(e) => setCustomStartMonth(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Array.from({ length: 12 }, (_, i) => {
                    const monthNum = (i + 1).toString().padStart(2, '0');
                    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                    return (
                      <option key={monthNum} value={monthNum}>
                        {monthNames[i]} ({monthNum})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Até:</label>
                <select
                  value={customEndMonth}
                  onChange={(e) => setCustomEndMonth(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Array.from({ length: 12 }, (_, i) => {
                    const monthNum = (i + 1).toString().padStart(2, '0');
                    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                    return (
                      <option key={monthNum} value={monthNum}>
                        {monthNames[i]} ({monthNum})
                      </option>
                    );
                  })}
                </select>
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Centro de Custo:</label>
            <select
              value={selectedCostCenter}
              onChange={(e) => setSelectedCostCenter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos</option>
              {costCenters.map(center => (
                <option key={center.id} value={center.id.toString()}>
                  {center.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Regional:</label>
            <select
              value={selectedRegional}
              onChange={(e) => setSelectedRegional(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todas</option>
              {regionals.map(regional => (
                <option key={regional.id} value={regional.id.toString()}>
                  {regional.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Indicador de Cache Age */}
      {Object.keys(cacheMetadata).length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Status do Cache</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCacheInfo(!showCacheInfo)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                {showCacheInfo ? 'Ocultar detalhes' : 'Ver detalhes'}
              </button>
            </div>
          </div>
          
          {/* Resumo simplificado */}
          <div className="flex items-center gap-4 text-sm">
            {Object.entries(cacheMetadata).map(([key, data]: [string, any]) => (
              data.exists && (
                <div key={key} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${data.isStale ? 'bg-yellow-500' : 'bg-green-500'}`} />
                  <span className="text-gray-600">
                    {key.includes('costs-centers') ? 'Centros de Custo' :
                     key.includes('reports') ? 'Relatórios' : 'Despesas'}: {data.ageFormatted}
                  </span>
                </div>
              )
            ))}
          </div>

          {/* Detalhes expandidos */}
          {showCacheInfo && (
            <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
              {Object.entries(cacheMetadata).map(([key, data]: [string, any]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 font-medium">
                    {key.includes('costs-centers') ? 'Centros de Custo' :
                     key.includes('reports') ? 'Relatórios' : 'Despesas'}
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-500">
                      Atualizado: {data.ageFormatted}
                    </span>
                    <span className="text-gray-500">
                      Expira: {data.expiresFormatted}
                    </span>
                    <div className={`px-2 py-1 rounded text-xs font-medium ${
                      data.isStale 
                        ? 'bg-yellow-100 text-yellow-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {data.isStale ? 'Próximo de expirar' : 'Fresco'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cards de KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover:shadow-lg transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total de Despesas
            </CardTitle>
            <div className="p-2 bg-blue-100 rounded-lg">
              <DollarSign className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              R$ {kpis.totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
              <span className="font-medium">+12.5%</span>
              <span className="text-gray-500">vs mês anterior</span>
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Aprovações Pendentes
            </CardTitle>
            <div className="p-2 bg-orange-100 rounded-lg">
              <FileText className="h-4 w-4 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {kpis.pendingApprovals}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {kpis.pendingApprovals} relatórios aguardando
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Valor Médio por Despesa
            </CardTitle>
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              R$ {kpis.averageExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
              <span className="font-medium">+5.2%</span>
              <span className="text-gray-500">vs mês anterior</span>
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Relatórios Abertos
            </CardTitle>
            <div className="p-2 bg-purple-100 rounded-lg">
              <Users className="h-4 w-4 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {kpis.openReports}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {kpis.openReports} relatórios em andamento
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="hover:shadow-lg transition-shadow duration-200">
          <CardHeader>
            <CardTitle>Despesas por Mês</CardTitle>
            <CardDescription>Últimos 12 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyExpenses}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip 
                  formatter={(value: any) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Valor']}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="valor" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow duration-200">
          <CardHeader>
            <CardTitle>Status dos Relatórios</CardTitle>
            <CardDescription>Distribuição por status</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={reportsByStatus}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="quantidade" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Distribuição por Tipo em coluna inteira */}
      <Card className="hover:shadow-lg transition-shadow duration-200">
        <CardHeader>
          <CardTitle>Distribuição por Tipo</CardTitle>
          <CardDescription>Despesas por categoria</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-8">
            <ResponsiveContainer width="50%" height={350}>
              <PieChart>
                <Pie
                  data={expensesByType}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="valor"
                >
                  {expensesByType.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: any, name: any) => [
                    `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                    name
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Legenda customizada no canto direito */}
            <div className="w-1/2 grid grid-cols-2 gap-3">
              {expensesByType.map((entry: any, index: number) => {
                const total = expensesByType.reduce((sum: number, item: any) => sum + item.valor, 0);
                const percent = ((entry.valor / total) * 100).toFixed(1);
                
                return (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: entry.color }}
                    />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="font-medium text-gray-700 truncate" title={entry.name}>{entry.name}</span>
                      <span className="text-xs text-gray-500 truncate">
                        {percent}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
