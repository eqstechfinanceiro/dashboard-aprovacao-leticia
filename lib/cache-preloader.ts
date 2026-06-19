// Sistema de pré-carregamento automático de cache
// Este módulo é carregado quando o servidor inicia e pré-carrega os dados essenciais

const PRELOAD_INTERVAL = 30 * 60 * 1000; // 30 minutos

let preloadTimer: NodeJS.Timeout | null = null;

// Função para pré-carregar dados de um período específico
export async function preloadPeriodData(year: number, startMonth: number, endMonth: number) {
  try {
    const startDate = new Date(year, startMonth, 1);
    const endDate = new Date(year, endMonth + 1, 0);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    console.log(`[Cache Preloader] Pré-carregando: ${startDateStr} a ${endDateStr}`);

    // Buscar despesas para este período usando URL absoluta
    const baseUrl = process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:3000';
    const apiUrl = new URL('/api/vexpenses/expenses', baseUrl);
    apiUrl.searchParams.append('include', 'expense_type,costs_center');
    apiUrl.searchParams.append('search', `date:${startDateStr},${endDateStr}`);
    apiUrl.searchParams.append('searchFields', 'date:between');
    
    const expensesResponse = await fetch(apiUrl.toString());
    
    if (expensesResponse.ok) {
      console.log(`[Cache Preloader] ✓ Expenses carregados: ${startDateStr} a ${endDateStr}`);
    } else {
      console.error(`[Cache Preloader] ✗ Erro ao carregar expenses: ${startDateStr} a ${endDateStr}`);
    }
  } catch (error) {
    console.error(`[Cache Preloader] Erro ao pré-carregar período:`, error);
  }
}

// Função para pré-carregar dados essenciais do mês atual
async function preloadCurrentMonthData() {
  try {
    console.log('[Cache Preloader] Iniciando pré-carregamento do mês atual...');
    
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    
    // Pré-carregar mês atual
    await preloadPeriodData(currentYear, currentMonth, currentMonth);
    
    // Pré-carregar períodos comuns (últimos 3 meses, últimos 6 meses)
    await preloadPeriodData(currentYear, Math.max(0, currentMonth - 2), currentMonth); // Últimos 3 meses
    await preloadPeriodData(currentYear, Math.max(0, currentMonth - 5), currentMonth); // Últimos 6 meses
    
    // Pré-carregar costs-centers e reports
    await preloadStaticData();
    
    console.log('[Cache Preloader] Pré-carregamento concluído');
  } catch (error) {
    console.error('[Cache Preloader] Erro ao pré-carregar dados:', error);
  }
}

// Função para pré-carregar dados estáticos (costs-centers, reports)
export async function preloadStaticData() {
  try {
    console.log('[Cache Preloader] Pré-carregando dados estáticos...');
    
    const baseUrl = process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:3000';
    
    // Costs-centers
    const costsUrl = new URL('/api/vexpenses/costs-centers', baseUrl);
    const costsResponse = await fetch(costsUrl.toString());
    if (costsResponse.ok) {
      console.log('[Cache Preloader] ✓ Costs-centers carregados');
    }
    
    // Reports
    const reportsUrl = new URL('/api/vexpenses/reports', baseUrl);
    reportsUrl.searchParams.append('include', 'user');
    const reportsResponse = await fetch(reportsUrl.toString());
    if (reportsResponse.ok) {
      console.log('[Cache Preloader] ✓ Reports carregados');
    }
  } catch (error) {
    console.error('[Cache Preloader] Erro ao pré-carregar dados estáticos:', error);
  }
}

// Iniciar pré-carregamento automático
export function startAutoPreload() {
  // Pré-carregar imediatamente
  preloadCurrentMonthData();
  
  // Configurar intervalo para pré-carregar periodicamente
  if (typeof window === 'undefined') { // Apenas no servidor
    preloadTimer = setInterval(() => {
      console.log('[Cache Preloader] Executando pré-carregamento periódico...');
      preloadCurrentMonthData();
    }, PRELOAD_INTERVAL);
    
    console.log('[Cache Preloader] Auto-preload iniciado (intervalo: 30min)');
  }
}

// Parar pré-carregamento automático
export function stopAutoPreload() {
  if (preloadTimer) {
    clearInterval(preloadTimer);
    preloadTimer = null;
    console.log('[Cache Preloader] Auto-preload parado');
  }
}

// Pré-carregar manualmente (útil para testes)
export async function manualPreload() {
  return preloadCurrentMonthData();
}
