import { NextResponse } from 'next/server';
import { apiCache } from '@/lib/neon-cache';

// Force dynamic to prevent static generation during build
export const dynamic = 'force-dynamic';

// Endpoint para atualizar o cache em background
// Pode ser chamado por um cron job ou manualmente
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Endpoint parameter is required' },
        { status: 400 }
      );
    }

    console.log(`[Cache Refresh] Atualizando cache para: ${endpoint}`);

    // URL base da API
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
    const apiKey = process.env.VEXPENSES_API_KEY || '';

    // Log para debug (remover em produção)
    console.log('[Cache Refresh] API_KEY exists:', !!apiKey);
    console.log('[Cache Refresh] API_KEY length:', apiKey?.length);
    console.log('[Cache Refresh] API_KEY prefix:', apiKey?.substring(0, 10));

    let cacheKey: string;
    let url: string;
    let ttl: number;

    switch (endpoint) {
      case 'expenses':
        // Para expenses, precisamos de parâmetros adicionais
        const params = body.params || {};
        const search = params.search || 'date:2024-01-01,2024-12-31';
        const page = params.page || '1';
        const perPage = params.per_page || '100';
        const include = params.include || '';
        
        cacheKey = `expenses:${include}:${search}:${page}:${perPage}`;
        url = `${baseUrl}/v2/expenses?search=${search}&searchFields=date:between&paginate=true&page=${page}&per_page=${perPage}${include ? `&include=${include}` : ''}`;
        ttl = 5 * 60 * 1000; // 5 minutos
        break;

      case 'reports':
        cacheKey = 'reports:';
        url = `${baseUrl}/v2/reports`;
        ttl = 5 * 60 * 1000; // 5 minutos
        break;

      case 'team-members':
        cacheKey = 'team-members:';
        url = `${baseUrl}/v2/team-members`;
        ttl = 10 * 60 * 1000; // 10 minutos
        break;

      case 'costs-centers':
        cacheKey = 'costs-centers';
        url = `${baseUrl}/v2/costs-centers`;
        ttl = 15 * 60 * 1000; // 15 minutos
        break;

      case 'expenses-type':
        cacheKey = 'expenses-type';
        url = `${baseUrl}/v2/expenses-type`;
        ttl = 15 * 60 * 1000; // 15 minutos
        break;

      default:
        return NextResponse.json(
          { error: 'Unknown endpoint' },
          { status: 400 }
        );
    }

    // Buscar dados da API
    const response = await fetch(url, {
      headers: {
        'Authorization': apiKey,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(300000), // 5 minutos de timeout
    });

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();

    // Atualizar cache
    await apiCache.set(cacheKey, data, ttl);

    console.log(`[Cache Refresh] Cache atualizado com sucesso: ${endpoint}`);

    return NextResponse.json({
      success: true,
      endpoint,
      cacheKey,
      ttl,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Cache Refresh] Erro:', error);
    return NextResponse.json(
      { 
        error: 'Failed to refresh cache',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Endpoint para atualizar todos os caches
export async function GET() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
    const apiKey = process.env.VEXPENSES_API_KEY || '';

    // Log para debug (remover em produção)
    console.log('[Cache Refresh GET] API_KEY exists:', !!apiKey);
    console.log('[Cache Refresh GET] API_KEY length:', apiKey?.length);
    console.log('[Cache Refresh GET] API_KEY prefix:', apiKey?.substring(0, 10));

    const results: any[] = [];

    // Atualizar cada endpoint
    const endpoints = [
      { name: 'costs-centers', url: `${baseUrl}/v2/costs-centers`, ttl: 15 * 60 * 1000 },
      { name: 'expenses-type', url: `${baseUrl}/v2/expenses-type`, ttl: 15 * 60 * 1000 },
      { name: 'team-members', url: `${baseUrl}/v2/team-members`, ttl: 10 * 60 * 1000 },
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`[Cache Refresh] Atualizando: ${endpoint.name}`);
        
        const response = await fetch(endpoint.url, {
          headers: {
            'Authorization': apiKey,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(120000),
        });

        if (!response.ok) {
          throw new Error(`API responded with status ${response.status}`);
        }

        const data = await response.json();
        await apiCache.set(endpoint.name, data, endpoint.ttl);

        results.push({
          endpoint: endpoint.name,
          success: true,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error(`[Cache Refresh] Erro ao atualizar ${endpoint.name}:`, error);
        results.push({
          endpoint: endpoint.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Cache Refresh] Erro geral:', error);
    return NextResponse.json(
      { 
        error: 'Failed to refresh all caches',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
