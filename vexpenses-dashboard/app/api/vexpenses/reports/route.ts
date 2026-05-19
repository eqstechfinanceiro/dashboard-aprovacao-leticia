import { NextRequest, NextResponse } from 'next/server';
import { apiCache } from '@/lib/neon-cache';

// Force dynamic to prevent static generation during build
export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

// Log para debug (remover em produção)
console.log('[Reports API] API_KEY exists:', !!API_KEY);
console.log('[Reports API] API_KEY length:', API_KEY?.length);
console.log('[Reports API] API_KEY prefix:', API_KEY?.substring(0, 10));

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const include = searchParams.get('include') || 'user';
    
    // Criar chave de cache
    const cacheKey = `reports:${include}`;
    
    // Usar stale-while-revalidate
    const staleResult = await apiCache.getWithStale(cacheKey);
    
    if (staleResult.data) {
      console.log(`Cache ${staleResult.isStale ? 'stale' : 'fresh'} hit for reports:`, cacheKey);
      
      // Se estiver stale, iniciar refresh em background
      if (staleResult.shouldRefresh) {
        refreshCacheInBackground(cacheKey, include);
      }
      
      return NextResponse.json(staleResult.data);
    }
    
    console.log('Cache miss for reports:', cacheKey);
    
    const params = new URLSearchParams();
    if (include) params.append('include', include);
    
    const response = await fetch(`${API_URL}/v2/reports?${params.toString()}`, {
      headers: {
        'Authorization': API_KEY.startsWith('Bearer ') ? API_KEY : `Bearer ${API_KEY}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(300000), // 5 minutos de timeout (reports é muito lento)
    });
    
    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }
    
    const data = await response.json();
    
    // Salvar no cache - TTL será determinado automaticamente baseado no tipo de dado
    await apiCache.set(cacheKey, data);
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error fetching reports:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch reports';
    
    if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
      return NextResponse.json(
        { error: 'API timeout - A requisição demorou muito tempo. Tente novamente.' },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

// Endpoint para aprovar/reprovar relatório
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reportId, action, observation } = body;
    
    // A API vExpenses pode ter endpoint específico para aprovação
    // Por enquanto, vamos simular a aprovação
    console.log(`[Reports API] ${action} relatório ${reportId}:`, observation);
    
    // TODO: Implementar chamada real à API de aprovação quando disponível
    // Exemplo: POST /v2/reports/{id}/approve ou similar
    
    return NextResponse.json({ 
      success: true, 
      message: `Relatório ${action.toLowerCase()} com sucesso` 
    });
    
  } catch (error) {
    console.error('[Reports API] Error in POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Função para atualizar cache em background
async function refreshCacheInBackground(cacheKey: string, include: string | null) {
  try {
    console.log(`[Background Refresh] Refreshing reports: ${cacheKey}`);
    
    const params = new URLSearchParams();
    if (include) params.append('include', include);
    
    const response = await fetch(`${API_URL}/v2/reports?${params.toString()}`, {
      headers: {
        'Authorization': API_KEY.startsWith('Bearer ') ? API_KEY : `Bearer ${API_KEY}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(300000), // 5 minutos
    });
    
    if (!response.ok) {
      console.error(`[Background Refresh] Failed to refresh ${cacheKey}: ${response.status}`);
      return;
    }
    
    const data = await response.json();
    
    // Atualizar cache
    await apiCache.set(cacheKey, data);
    
    console.log(`[Background Refresh] Successfully refreshed: ${cacheKey}`);
  } catch (error) {
    console.error(`[Background Refresh] Error refreshing ${cacheKey}:`, error);
  }
}
