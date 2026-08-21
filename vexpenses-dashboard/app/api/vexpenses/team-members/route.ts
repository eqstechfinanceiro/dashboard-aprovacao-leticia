import { NextRequest, NextResponse } from 'next/server';
import { apiCache } from '@/lib/neon-cache';
import { getApiHeaders, getApiUrl } from '@/lib/vexpenses-client';

// Force dynamic to prevent static generation during build
export const dynamic = 'force-dynamic';

// Verificar se estamos em ambiente de build
const isBuildTime = process.env.NEXT_PHASE === 'phase-build' || process.env.NODE_ENV === 'production' && !process.env.NEON_DATABASE_URL;

const API_URL = getApiUrl();

// Log para debug (remover em produção)
console.log('[Team Members API] API_KEY exists:', !!process.env.VEXPENSES_API_KEY);
console.log('[Team Members API] API_KEY length:', process.env.VEXPENSES_API_KEY?.length);

export async function GET(request: NextRequest) {
  // Se estivermos em build time, retornar dados vazios para não falhar
  if (isBuildTime) {
    return NextResponse.json({
      success: true,
      data: [],
      request: '',
      method: 'GET',
      code: 200,
      message: 'Build time - no data available',
      buildTime: true
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const include = searchParams.get('include');
    
    // Criar chave de cache
    const cacheKey = `team-members:${include}`;
    
    // Verificar se está no cache
    const cachedData = await apiCache.get(cacheKey);
    if (cachedData) {
      console.log('Cache hit for team-members:', cacheKey);
      return NextResponse.json(cachedData);
    }
    
    console.log('Cache miss for team-members:', cacheKey);
    
    const params = new URLSearchParams();
    if (include) params.append('include', include);
    
    const response = await fetch(`${API_URL}/v2/team-members?${params.toString()}`, {
      headers: getApiHeaders(),
      signal: AbortSignal.timeout(120000),
      cache: 'no-store', // 2 minutos de timeout
    });
    
    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }
    
    const data = await response.json();
    
    // Salvar no cache por 10 minutos (dados de membros mudam menos frequentemente)
    await apiCache.set(cacheKey, data, 10 * 60 * 1000);
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error fetching team members:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team members' },
      { status: 500 }
    );
  }
}
