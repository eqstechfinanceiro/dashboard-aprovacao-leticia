import { NextRequest, NextResponse } from 'next/server';
import { apiCache } from '@/lib/neon-cache';
import { getApiHeaders, getApiUrl } from '@/lib/vexpenses-client';

// Force dynamic to prevent static generation during build
export const dynamic = 'force-dynamic';

// Verificar se estamos em ambiente de build
const isBuildTime = process.env.NEXT_PHASE === 'phase-build' || process.env.NODE_ENV === 'production' && !process.env.NEON_DATABASE_URL;

const API_URL = getApiUrl();

// Log para debug (remover em produção)
console.log('[Expenses API] API_KEY exists:', !!process.env.VEXPENSES_API_KEY);
console.log('[Expenses API] API_KEY length:', process.env.VEXPENSES_API_KEY?.length);

// POST endpoint para salvar direto no cache (usado pelo background preloader)
export async function POST(request: NextRequest) {
  // Se estivermos em build time, não fazer nada
  if (isBuildTime) {
    return NextResponse.json({ success: true, buildTime: true, message: 'Build time - skipping cache operations' });
  }

  try {
    const body = await request.json();
    const { cacheKey, data, skipFetch } = body;

    if (skipFetch && cacheKey && data) {
      // Modo de salvamento direto no cache (sem buscar da API)
      console.log(`[Expenses API] Salvando direto no cache: ${cacheKey}`);
      try {
        await apiCache.set(cacheKey, data);
        console.log(`[Expenses API] Cache salvo com sucesso: ${cacheKey}`);
        return NextResponse.json({ success: true, cacheKey });
      } catch (cacheError) {
        console.error(`[Expenses API] Erro ao salvar cache: ${cacheKey}`, cacheError);
        return NextResponse.json({ success: false, error: 'Failed to save cache' }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error) {
    console.error('[Expenses API] Error in POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const include = searchParams.get('include');
    
    // O endpoint expenses exige parâmetros search e searchFields obrigatoriamente
    const search = searchParams.get('search') || 'date:2024-01-01,2024-12-31';
    const searchFields = searchParams.get('searchFields') || 'date:between';
    const searchJoin = searchParams.get('searchJoin') || 'and';
    
    // Adicionar paginação para melhorar performance
    const page = searchParams.get('page') || '1';
    const perPage = searchParams.get('per_page') || '100';
    
    // Criar chave de cache
    const cacheKey = `expenses:${include}:${search}:${page}:${perPage}`;
    
    // Usar stale-while-revalidate
    const staleResult = await apiCache.getWithStale(cacheKey);
    
    if (staleResult.data) {
      console.log(`Cache ${staleResult.isStale ? 'stale' : 'fresh'} hit for expenses:`, cacheKey);
      
      // Se estiver stale, iniciar refresh em background
      if (staleResult.shouldRefresh) {
        // Não aguardar o refresh - fazer em background
        refreshCacheInBackground(cacheKey, include, search, searchFields, searchJoin, page, perPage);
      }
      
      // Retornar dados imediatamente (mesmo se stale)
      return NextResponse.json(staleResult.data);
    }
    
    console.log('Cache miss for expenses:', cacheKey);
    
    const params = new URLSearchParams();
    if (include) params.append('include', include);
    params.append('search', search);
    params.append('searchFields', searchFields);
    params.append('searchJoin', searchJoin);
    params.append('paginate', 'true');
    params.append('page', page);
    params.append('per_page', perPage);
    
    const response = await fetch(`${API_URL}/v2/expenses?${params.toString()}`, {
      headers: getApiHeaders(),
      signal: AbortSignal.timeout(300000),
      cache: 'no-store', // 5 minutos de timeout
    });
    
    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }
    
    const data = await response.json();
    
    // Salvar no cache - TTL será determinado automaticamente baseado no tipo de dado
    console.log(`[Expenses API] Tentando salvar no cache: ${cacheKey}`);
    try {
      await apiCache.set(cacheKey, data);
      console.log(`[Expenses API] Cache salvo com sucesso: ${cacheKey}`);
    } catch (cacheError) {
      console.error(`[Expenses API] Erro ao salvar cache: ${cacheKey}`, cacheError);
      // Continuar mesmo se o cache falhar
    }
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error fetching expenses:', error);
    
    // Retornar erro mais específico
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch expenses';
    
    // Se for timeout, retornar 504 em vez de 500
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

// Função para atualizar cache em background
async function refreshCacheInBackground(
  cacheKey: string,
  include: string | null,
  search: string,
  searchFields: string,
  searchJoin: string,
  page: string,
  perPage: string
) {
  try {
    console.log(`[Background Refresh] Refreshing expenses: ${cacheKey}`);
    
    const params = new URLSearchParams();
    if (include) params.append('include', include);
    params.append('search', search);
    params.append('searchFields', searchFields);
    params.append('searchJoin', searchJoin);
    params.append('paginate', 'true');
    params.append('page', page);
    params.append('per_page', perPage);
    
    const response = await fetch(`${API_URL}/v2/expenses?${params.toString()}`, {
      headers: getApiHeaders(),
      signal: AbortSignal.timeout(300000),
      cache: 'no-store', // 5 minutos
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
