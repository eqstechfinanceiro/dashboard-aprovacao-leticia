import { NextRequest, NextResponse } from 'next/server';
import { preloadPeriodData, preloadStaticData } from '@/lib/cache-preloader';

// Force dynamic to prevent static generation during build
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { force = false } = body;

    console.log('[Manual Preload] Iniciando pré-carregamento manual forçado...');

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    const results = [];

    // Pré-carregar mês atual
    try {
      await preloadPeriodData(currentYear, currentMonth, currentMonth);
      results.push({ period: 'current-month', status: 'success' });
    } catch (error) {
      results.push({ period: 'current-month', status: 'error', error: String(error) });
    }

    // Pré-carregar últimos 3 meses
    try {
      await preloadPeriodData(currentYear, Math.max(0, currentMonth - 2), currentMonth);
      results.push({ period: 'last-3-months', status: 'success' });
    } catch (error) {
      results.push({ period: 'last-3-months', status: 'error', error: String(error) });
    }

    // Pré-carregar últimos 6 meses
    try {
      await preloadPeriodData(currentYear, Math.max(0, currentMonth - 5), currentMonth);
      results.push({ period: 'last-6-months', status: 'success' });
    } catch (error) {
      results.push({ period: 'last-6-months', status: 'error', error: String(error) });
    }

    // Pré-carregar dados estáticos
    try {
      await preloadStaticData();
      results.push({ period: 'static-data', status: 'success' });
    } catch (error) {
      results.push({ period: 'static-data', status: 'error', error: String(error) });
    }

    return NextResponse.json({
      success: true,
      message: 'Pré-carregamento manual concluído',
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Manual Preload] Erro:', error);
    return NextResponse.json(
      { error: 'Failed to preload data' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Use POST to trigger manual preload',
    endpoint: '/api/cache/preload-now',
    method: 'POST',
    body: { force: true }
  });
}