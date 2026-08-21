import { NextRequest, NextResponse } from 'next/server';
import { apiCache } from '@/lib/neon-cache';
import { getApiHeaders, getApiUrl } from '@/lib/vexpenses-client';

// Force dynamic to prevent static generation during build
export const dynamic = 'force-dynamic';

const API_URL = getApiUrl();

// Log para debug (remover em produção)
console.log('[Cache Refresh Background] API_KEY exists:', !!process.env.VEXPENSES_API_KEY);
console.log('[Cache Refresh Background] API_KEY length:', process.env.VEXPENSES_API_KEY?.length);

// Endpoint para atualizar cache em background
// Este endpoint não espera pela resposta da API vExpenses
// Ele inicia o refresh e retorna imediatamente
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keys } = body;

    if (!keys || !Array.isArray(keys)) {
      return NextResponse.json(
        { error: 'keys array is required' },
        { status: 400 }
      );
    }

    // Iniciar refresh em background (não aguardar)
    refreshCacheInBackground(keys);

    return NextResponse.json({
      success: true,
      message: `Background refresh started for ${keys.length} keys`,
      keys
    });
  } catch (error) {
    console.error('Error starting background refresh:', error);
    return NextResponse.json(
      { error: 'Failed to start background refresh' },
      { status: 500 }
    );
  }
}

// Função para atualizar cache em background
async function refreshCacheInBackground(keys: string[]) {
  console.log(`[Background Refresh] Starting refresh for ${keys.length} keys`);

  for (const key of keys) {
    try {
      // Determinar qual endpoint chamar baseado na chave
      let fetchUrl: string;
      let fetchOptions: RequestInit = {
        headers: getApiHeaders(),
        signal: AbortSignal.timeout(300000),
      cache: 'no-store', // 5 minutos
      };

      if (key.startsWith('expenses:')) {
        // Extrair parâmetros da chave
        const parts = key.split(':');
        const include = parts[1];
        const search = parts[2];
        const page = parts[3];
        const perPage = parts[4];

        fetchUrl = `${API_URL}/v2/expenses?include=${include}&search=${search}&searchFields=date:between&searchJoin=and&paginate=true&page=${page}&per_page=${perPage}`;
      } else if (key.startsWith('reports:')) {
        const include = key.split(':')[1];
        fetchUrl = `${API_URL}/v2/reports?include=${include}`;
      } else if (key === 'costs-centers') {
        fetchUrl = `${API_URL}/v2/costs-centers`;
      } else {
        console.log(`[Background Refresh] Skipping unknown key: ${key}`);
        continue;
      }

      console.log(`[Background Refresh] Refreshing: ${key}`);
      
      const response = await fetch(fetchUrl, fetchOptions);
      
      if (!response.ok) {
        console.error(`[Background Refresh] Failed to refresh ${key}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      
      // Atualizar cache
      await apiCache.set(key, data);
      
      console.log(`[Background Refresh] Successfully refreshed: ${key}`);
    } catch (error) {
      console.error(`[Background Refresh] Error refreshing ${key}:`, error);
    }
  }

  console.log(`[Background Refresh] Completed for ${keys.length} keys`);
}

// Endpoint para atualizar todos os caches expirando em breve
export async function GET(request: NextRequest) {
  try {
    // Buscar estatísticas do cache
    const stats = await apiCache.getStats();
    
    // Em uma implementação real, buscaríamos as chaves que estão expirando em breve
    // Por ora, vamos retornar as estatísticas
    return NextResponse.json({
      success: true,
      stats,
      message: 'Cache stats retrieved. Use POST to refresh specific keys.'
    });
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return NextResponse.json(
      { error: 'Failed to get cache stats' },
      { status: 500 }
    );
  }
}
