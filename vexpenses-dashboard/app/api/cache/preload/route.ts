import { NextRequest, NextResponse } from 'next/server';
import { apiCache } from '@/lib/neon-cache';

// Force dynamic to prevent static generation during build
export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

// Log para debug (remover em produção)
console.log('[Cache Preload] API_KEY exists:', !!API_KEY);
console.log('[Cache Preload] API_KEY length:', API_KEY?.length);
console.log('[Cache Preload] API_KEY prefix:', API_KEY?.substring(0, 10));

// Endpoint para pré-carregar dados essenciais do dashboard
// Este endpoint carrega os dados que serão usados no dashboard principal
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { year, month } = body;

    // Usar mês atual se não fornecido
    const currentDate = new Date();
    const targetYear = year || currentDate.getFullYear();
    const targetMonth = month !== undefined ? month : currentDate.getMonth();

    // Calcular intervalo de datas para o mês
    const startDate = new Date(targetYear, targetMonth, 1);
    const endDate = new Date(targetYear, targetMonth + 1, 0);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    console.log(`[Preload] Pré-carregando dados para ${startDateStr} a ${endDateStr}`);

    // Lista de chaves para pré-carregar
    const keysToPreload = [
      'costs-centers',
      `reports:user`,
      `expenses:expense_type,costs_center:date:${startDateStr},${endDateStr}:1:100`,
    ];

    const results = await preloadData(keysToPreload);

    return NextResponse.json({
      success: true,
      message: 'Preload completed',
      results,
      period: { start: startDateStr, end: endDateStr }
    });
  } catch (error) {
    console.error('Error preloading data:', error);
    return NextResponse.json(
      { error: 'Failed to preload data' },
      { status: 500 }
    );
  }
}

// Função para pré-carregar dados
async function preloadData(keys: string[]) {
  const results: { key: string; success: boolean; error?: string }[] = [];

  for (const key of keys) {
    try {
      // Verificar se já está no cache
      const cached = await apiCache.get(key);
      if (cached) {
        console.log(`[Preload] Already cached: ${key}`);
        results.push({ key, success: true });
        continue;
      }

      // Determinar qual endpoint chamar
      let fetchUrl: string;
      let fetchOptions: RequestInit = {
        headers: {
          'Authorization': API_KEY.startsWith('Bearer ') ? API_KEY : `Bearer ${API_KEY}`,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(300000), // 5 minutos
      };

      if (key.startsWith('expenses:')) {
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
        results.push({ key, success: false, error: 'Unknown key type' });
        continue;
      }

      console.log(`[Preload] Loading: ${key}`);
      
      const response = await fetch(fetchUrl, fetchOptions);
      
      if (!response.ok) {
        console.error(`[Preload] Failed to load ${key}: ${response.status}`);
        results.push({ key, success: false, error: `HTTP ${response.status}` });
        continue;
      }

      const data = await response.json();
      
      // Salvar no cache
      await apiCache.set(key, data);
      
      console.log(`[Preload] Successfully loaded: ${key}`);
      results.push({ key, success: true });
    } catch (error) {
      console.error(`[Preload] Error loading ${key}:`, error);
      results.push({ key, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  return results;
}

// Endpoint GET para pré-carregar o mês atual automaticamente
export async function GET(request: NextRequest) {
  return POST(request);
}
