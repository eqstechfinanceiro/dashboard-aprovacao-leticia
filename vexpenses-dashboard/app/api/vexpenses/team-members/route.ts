import { NextRequest, NextResponse } from 'next/server';
import { apiCache } from '@/lib/neon-cache';

// Force dynamic to prevent static generation during build
export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

// Log para debug (remover em produção)
console.log('[Team Members API] API_KEY exists:', !!API_KEY);
console.log('[Team Members API] API_KEY length:', API_KEY?.length);
console.log('[Team Members API] API_KEY prefix:', API_KEY?.substring(0, 10));

export async function GET(request: NextRequest) {
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
      headers: {
        'Authorization': API_KEY.startsWith('Bearer ') ? API_KEY : `Bearer ${API_KEY}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(120000), // 2 minutos de timeout
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
