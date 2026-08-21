import { NextRequest, NextResponse } from 'next/server';
import { apiCache } from '@/lib/neon-cache';
import { getApiHeaders, getApiUrl } from '@/lib/vexpenses-client';

// Force dynamic to prevent static generation during build
export const dynamic = 'force-dynamic';

const API_URL = getApiUrl();

// Log para debug (remover em produção)
console.log('[Expenses Type API] API_KEY exists:', !!process.env.VEXPENSES_API_KEY);
console.log('[Expenses Type API] API_KEY length:', process.env.VEXPENSES_API_KEY?.length);

export async function GET() {
  try {
    // Criar chave de cache
    const cacheKey = 'expenses-type';
    
    // Verificar se está no cache
    const cachedData = await apiCache.get(cacheKey);
    if (cachedData) {
      console.log('Cache hit for expenses-type');
      return NextResponse.json(cachedData);
    }
    
    console.log('Cache miss for expenses-type');
    
    const response = await fetch(`${API_URL}/v2/expenses-type`, {
      headers: getApiHeaders(),
      signal: AbortSignal.timeout(120000),
      cache: 'no-store', // 2 minutos de timeout
    });
    
    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }
    
    const data = await response.json();
    
    // Salvar no cache por 15 minutos (tipos de despesa mudam muito raramente)
    await apiCache.set(cacheKey, data, 15 * 60 * 1000);
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error fetching expense types:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expense types' },
      { status: 500 }
    );
  }
}
