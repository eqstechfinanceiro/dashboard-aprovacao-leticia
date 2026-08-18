import { NextRequest, NextResponse } from 'next/server';
import { apiCache } from '@/lib/neon-cache';

// Force dynamic to prevent static generation during build
export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

// Log para debug (remover em produção)
console.log('[Costs Centers API] API_KEY exists:', !!API_KEY);
console.log('[Costs Centers API] API_KEY length:', API_KEY?.length);
console.log('[Costs Centers API] API_KEY prefix:', API_KEY?.substring(0, 10));

export async function GET(request: NextRequest) {
  try {
    // Criar chave de cache
    const cacheKey = 'costs-centers';
    
    // Usar stale-while-revalidate
    const staleResult = await apiCache.getWithStale(cacheKey);
    
    if (staleResult.data) {
      console.log(`Cache ${staleResult.isStale ? 'stale' : 'fresh'} hit for costs-centers`);
      
      // Se estiver stale, iniciar refresh em background
      if (staleResult.shouldRefresh) {
        refreshCacheInBackground(cacheKey);
      }
      
      return NextResponse.json(staleResult.data);
    }
    
    console.log('Cache miss for costs-centers');
    
    const response = await fetch(`${API_URL}/v2/costs-centers`, {
      headers: {
        'Authorization': API_KEY,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(120000), // 2 minutos de timeout
    });
    
    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }
    
    const data = await response.json();
    
    // Salvar no cache - TTL será determinado automaticamente (config: 6 horas)
    await apiCache.set(cacheKey, data);
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error fetching cost centers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cost centers' },
      { status: 500 }
    );
  }
}

// Função para atualizar cache em background
async function refreshCacheInBackground(cacheKey: string) {
  try {
    console.log(`[Background Refresh] Refreshing costs-centers`);
    
    const response = await fetch(`${API_URL}/v2/costs-centers`, {
      headers: {
        'Authorization': API_KEY,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(120000), // 2 minutos
    });
    
    if (!response.ok) {
      console.error(`[Background Refresh] Failed to refresh costs-centers: ${response.status}`);
      return;
    }
    
    const data = await response.json();
    
    // Atualizar cache
    await apiCache.set(cacheKey, data);
    
    console.log(`[Background Refresh] Successfully refreshed costs-centers`);
  } catch (error) {
    console.error(`[Background Refresh] Error refreshing costs-centers:`, error);
  }
}
