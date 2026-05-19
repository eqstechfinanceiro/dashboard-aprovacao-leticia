// Sistema de pré-carregamento em background com progresso visível
import { sql } from './neon';

interface PreloadTask {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number; // 0-100
  currentStep: string;
  totalSteps: number;
  completedSteps: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  results: {
    period: string;
    cacheKey: string;
    success: boolean;
    duration: number;
    recordCount: number;
  }[];
}

// Armazenamento em memória para tasks ativas (em produção, usar Redis ou banco)
const activeTasks = new Map<string, PreloadTask>();

// Função para dividir um período em meses individuais
function splitPeriodIntoMonths(startDate: string, endDate: string): Array<{ start: string; end: string; label: string }> {
  const months: Array<{ start: string; end: string; label: string }> = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const year = current.getFullYear();
    const month = current.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    months.push({
      start: firstDay.toISOString().split('T')[0],
      end: lastDay.toISOString().split('T')[0],
      label: `${year}-${String(month + 1).padStart(2, '0')}`
    });
    
    current.setMonth(month + 1);
  }

  return months;
}

// Função para buscar dados de um mês específico
async function fetchMonthData(
  startDate: string,
  endDate: string,
  include: string = 'expense_type,costs_center'
): Promise<{ data: any; recordCount: number; duration: number }> {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
  const API_KEY = process.env.VEXPENSES_API_KEY || '';
  const baseUrl = process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:3000';

  const startTime = Date.now();
  const cacheKey = `expenses:${include}:date:${startDate},${endDate}:1:100`;

  try {
    const params = new URLSearchParams();
    params.append('include', include);
    params.append('search', `date:${startDate},${endDate}`);
    params.append('searchFields', 'date:between');
    params.append('paginate', 'true');
    params.append('page', '1');
    params.append('per_page', '100');

    const response = await fetch(`${API_URL}/v2/expenses?${params.toString()}`, {
      headers: {
        'Authorization': API_KEY,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(60000), // 1 minuto por mês
    });

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();
    const duration = Date.now() - startTime;
    const recordCount = data.data?.length || 0;

    // Salvar no cache via endpoint local
    try {
      await fetch(`${baseUrl}/api/vexpenses/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cacheKey,
          data,
          skipFetch: true // Indica para salvar direto no cache sem buscar da API
        }),
      });
    } catch (cacheError) {
      console.error(`[Background Preloader] Erro ao salvar cache para ${cacheKey}:`, cacheError);
    }

    return { data, recordCount, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    throw new Error(`Failed to fetch ${startDate} to ${endDate}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Função principal de pré-carregamento
export async function startFractionalPreload(
  startDate: string,
  endDate: string,
  taskId?: string
): Promise<string> {
  const taskIdFinal = taskId || `preload_${Date.now()}`;
  
  const months = splitPeriodIntoMonths(startDate, endDate);
  const task: PreloadTask = {
    id: taskIdFinal,
    status: 'running',
    progress: 0,
    currentStep: 'Iniciando pré-carregamento...',
    totalSteps: months.length,
    completedSteps: 0,
    startedAt: new Date(),
    results: [],
  };

  activeTasks.set(taskIdFinal, task);
  console.log(`[Background Preloader] Iniciando task ${taskIdFinal}: ${months.length} meses para carregar`);

  try {
    for (let i = 0; i < months.length; i++) {
      const month = months[i];
      task.currentStep = `Carregando ${month.label} (${i + 1}/${months.length})...`;
      task.progress = Math.round((i / months.length) * 100);
      activeTasks.set(taskIdFinal, { ...task });

      console.log(`[Background Preloader] ${taskIdFinal}: ${task.currentStep}`);

      try {
        const result = await fetchMonthData(month.start, month.end);
        
        task.results.push({
          period: month.label,
          cacheKey: `expenses:expense_type,costs_center:date:${month.start},${month.end}:1:100`,
          success: true,
          duration: result.duration,
          recordCount: result.recordCount,
        });
        
        task.completedSteps = i + 1;
        task.progress = Math.round(((i + 1) / months.length) * 100);
        
        console.log(`[Background Preloader] ${taskIdFinal}: ${month.label} concluído (${result.recordCount} registros em ${result.duration}ms)`);
        
      } catch (error) {
        task.results.push({
          period: month.label,
          cacheKey: `expenses:expense_type,costs_center:date:${month.start},${month.end}:1:100`,
          success: false,
          duration: 0,
          recordCount: 0,
        });
        
        console.error(`[Background Preloader] ${taskIdFinal}: Erro ao carregar ${month.label}:`, error);
      }
      
      activeTasks.set(taskIdFinal, { ...task });
      
      // Pequena pausa entre requisições para não sobrecarregar a API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    task.status = 'completed';
    task.currentStep = 'Pré-carregamento concluído!';
    task.progress = 100;
    task.completedAt = new Date();
    activeTasks.set(taskIdFinal, { ...task });

    console.log(`[Background Preloader] Task ${taskIdFinal} concluída com sucesso`);
    
    // Salvar estatísticas no banco
    await savePreloadStats(task);

    return taskIdFinal;

  } catch (error) {
    task.status = 'failed';
    task.error = error instanceof Error ? error.message : String(error);
    task.currentStep = 'Falha no pré-carregamento';
    task.completedAt = new Date();
    activeTasks.set(taskIdFinal, { ...task });

    console.error(`[Background Preloader] Task ${taskIdFinal} falhou:`, error);
    throw error;
  }
}

// Função para obter status de uma task
export function getTaskStatus(taskId: string): PreloadTask | null {
  return activeTasks.get(taskId) || null;
}

// Função para obter todas as tasks ativas
export function getAllActiveTasks(): PreloadTask[] {
  return Array.from(activeTasks.values());
}

// Função para salvar estatísticas no banco
async function savePreloadStats(task: PreloadTask): Promise<void> {
  try {
    const successful = task.results.filter(r => r.success);
    const totalRecords = successful.reduce((sum, r) => sum + r.recordCount, 0);
    const totalDuration = successful.reduce((sum, r) => sum + r.duration, 0);
    const avgDuration = successful.length > 0 ? totalDuration / successful.length : 0;

    await sql`
      INSERT INTO preload_stats (
        task_id,
        status,
        total_months,
        successful_months,
        failed_months,
        total_records,
        total_duration_ms,
        avg_duration_ms,
        started_at,
        completed_at
      ) VALUES (
        ${task.id},
        ${task.status},
        ${task.totalSteps},
        ${successful.length},
        ${task.results.length - successful.length},
        ${totalRecords},
        ${totalDuration},
        ${avgDuration},
        ${task.startedAt},
        ${task.completedAt}
      )
    `;
    
    console.log(`[Background Preloader] Estatísticas salvas para task ${task.id}`);
  } catch (error) {
    console.error('[Background Preloader] Erro ao salvar estatísticas:', error);
  }
}

// Função para pré-carregar automaticamente períodos comuns
export async function preloadCommonPeriods(): Promise<void> {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  
  const periods = [
    // Mês atual
    {
      start: new Date(currentYear, currentMonth, 1).toISOString().split('T')[0],
      end: new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0],
      label: 'current-month'
    },
    // Últimos 3 meses
    {
      start: new Date(currentYear, Math.max(0, currentMonth - 2), 1).toISOString().split('T')[0],
      end: new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0],
      label: 'last-3-months'
    },
    // Últimos 6 meses
    {
      start: new Date(currentYear, Math.max(0, currentMonth - 5), 1).toISOString().split('T')[0],
      end: new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0],
      label: 'last-6-months'
    },
  ];

  for (const period of periods) {
    const taskId = `auto_${period.label}_${Date.now()}`;
    console.log(`[Background Preloader] Iniciando pré-carregamento automático: ${period.label}`);
    
    try {
      await startFractionalPreload(period.start, period.end, taskId);
    } catch (error) {
      console.error(`[Background Preloader] Erro no pré-carregamento automático ${period.label}:`, error);
    }
  }
}
