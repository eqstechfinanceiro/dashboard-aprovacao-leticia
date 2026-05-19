import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Report, CostCenter, Expense } from './api';

// Hook para buscar centros de custo
export function useCostCenters() {
  return useQuery({
    queryKey: ['costs-centers'],
    queryFn: async () => {
      const response = await fetch('/api/vexpenses/costs-centers');
      if (!response.ok) throw new Error('Failed to fetch cost centers');
      const data = await response.json();
      return data.data as CostCenter[];
    },
    staleTime: 30 * 60 * 1000, // 30 minutos
    gcTime: 6 * 60 * 60 * 1000, // 6 horas
  });
}

// Hook para buscar despesas
export function useExpenses(params: {
  startDate: string;
  endDate: string;
  costCenterId?: string;
  startMonth?: string;
  endMonth?: string;
}) {
  const searchParams = new URLSearchParams();
  searchParams.append('include', 'expense_type,costs_center');
  searchParams.append('search', `date:${params.startDate},${params.endDate}`);
  searchParams.append('searchFields', 'date:between');
  
  if (params.costCenterId && params.costCenterId !== 'all') {
    searchParams.append('search', `;costs_center.id:${params.costCenterId}`);
    searchParams.append('searchFields', ';costs_center.id:=');
  }
  
  return useQuery({
    queryKey: ['expenses', params.startDate, params.endDate, params.costCenterId, params.startMonth, params.endMonth],
    queryFn: async () => {
      const response = await fetch(`/api/vexpenses/expenses?${searchParams.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch expenses');
      const data = await response.json();
      return data.data as Expense[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 60 * 60 * 1000, // 1 hora
  });
}

// Hook para buscar relatórios
export function useReports() {
  return useQuery({
    queryKey: ['reports'],
    queryFn: async () => {
      const response = await fetch('/api/vexpenses/reports?include=user');
      if (!response.ok) throw new Error('Failed to fetch reports');
      const data = await response.json();
      return data.data as Report[];
    },
    staleTime: 10 * 60 * 1000, // 10 minutos
    gcTime: 2 * 60 * 60 * 1000, // 2 horas
  });
}

// Hook para buscar relatórios pendentes de aprovação
export function usePendingReports() {
  return useQuery({
    queryKey: ['reports', 'pending'],
    queryFn: async () => {
      const response = await fetch('/api/vexpenses/reports?include=user');
      if (!response.ok) throw new Error('Failed to fetch reports');
      const data = await response.json();
      // Filtrar apenas relatórios pendentes
      const pendingReports = (data.data as Report[]).filter(r => r.status === 'ABERTO');
      return pendingReports;
    },
    staleTime: 5 * 60 * 1000, // 5 minutos (dados de aprovação mudam com mais frequência)
    gcTime: 1 * 60 * 60 * 1000, // 1 hora
  });
}

// Hook para buscar detalhes de um relatório específico
export function useReportDetails(reportId: number) {
  return useQuery({
    queryKey: ['report', reportId],
    queryFn: async () => {
      const response = await fetch('/api/vexpenses/reports?include=user');
      if (!response.ok) throw new Error('Failed to fetch report details');
      const data = await response.json();
      const report = (data.data as Report[]).find(r => r.id === reportId);
      return report;
    },
    enabled: !!reportId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

// Hook para aprovar/reprovar relatório
export function useApproveReport() {
  const queryClient = useQueryClient();
  
  return {
    approveReport: async (reportId: number, observation?: string) => {
      const response = await fetch('/api/vexpenses/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, action: 'APROVAR', observation }),
      });
      
      if (!response.ok) throw new Error('Failed to approve report');
      
      // Invalidar cache de relatórios
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      
      return response.json();
    },
    
    rejectReport: async (reportId: number, observation?: string) => {
      const response = await fetch('/api/vexpenses/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, action: 'REPROVAR', observation }),
      });
      
      if (!response.ok) throw new Error('Failed to reject report');
      
      // Invalidar cache de relatórios
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      
      return response.json();
    },
  };
}

// Hook para buscar metadados do cache
export function useCacheMetadata(keys: string[]) {
  return useQuery({
    queryKey: ['cache-metadata', keys],
    queryFn: async () => {
      const response = await fetch(`/api/cache/metadata?keys=${keys.join(',')}`);
      if (!response.ok) throw new Error('Failed to fetch cache metadata');
      const data = await response.json();
      return data.metadata as Record<string, any>;
    },
    staleTime: 30 * 1000, // 30 segundos
    gcTime: 5 * 60 * 1000, // 5 minutos
    refetchInterval: 30 * 1000, // Refetch a cada 30 segundos
  });
}

// Hook para invalidar e refetch queries
export function useRefreshData() {
  const queryClient = useQueryClient();
  
  return {
    refreshCostCenters: () => queryClient.invalidateQueries({ queryKey: ['costs-centers'] }),
    refreshExpenses: () => queryClient.invalidateQueries({ queryKey: ['expenses'] }),
    refreshReports: () => queryClient.invalidateQueries({ queryKey: ['reports'] }),
    refreshAll: () => queryClient.invalidateQueries(),
  };
}

// Hook para buscar dados de status-caixa (relatórios agrupados por status)
export function useStatusCaixa(params?: {
  startDate?: string;
  endDate?: string;
  costCenterId?: string;
}) {
  const searchParams = new URLSearchParams();
  searchParams.append('include', 'user,expense');
  
  if (params?.startDate && params?.endDate) {
    searchParams.append('search', `created_at:${params.startDate},${params.endDate}`);
    searchParams.append('searchFields', 'created_at:between');
  }
  
  return useQuery({
    queryKey: ['status-caixa', params],
    queryFn: async () => {
      const response = await fetch(`/api/vexpenses/reports?${searchParams.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch reports for status caixa');
      const data = await response.json();
      return data.data as Report[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 30 * 60 * 1000, // 30 minutos
  });
}

// Hook para buscar equipe (team-members) para filtros
export function useTeamMembers() {
  return useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const response = await fetch('/api/vexpenses/team-members');
      if (!response.ok) throw new Error('Failed to fetch team members');
      const data = await response.json();
      return data.data as any[];
    },
    staleTime: 30 * 60 * 1000, // 30 minutos
    gcTime: 6 * 60 * 60 * 1000, // 6 horas
  });
}
