import { NextResponse } from 'next/server';
import { apiCache } from '@/lib/neon-cache';

// Force dynamic to prevent static generation during build
export const dynamic = 'force-dynamic';

// Verificar se estamos em ambiente de build
const isBuildTime = process.env.NEXT_PHASE === 'phase-build' || process.env.NODE_ENV === 'production' && !process.env.NEON_DATABASE_URL;

// Endpoint para verificar o status do cache
export async function GET() {
  // Se estivermos em build time, retornar status simplificado
  if (isBuildTime) {
    return NextResponse.json({
      success: true,
      stats: { total: 0, expired: 0, byType: {} },
      timestamp: new Date().toISOString(),
      buildTime: true,
      message: 'Cache não disponível durante build'
    });
  }

  try {
    const stats = await apiCache.getStats();

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Cache Status] Erro:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get cache status',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Endpoint para limpar o cache
export async function DELETE() {
  try {
    await apiCache.clear();

    return NextResponse.json({
      success: true,
      message: 'Cache cleared successfully',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Cache Clear] Erro:', error);
    return NextResponse.json(
      { 
        error: 'Failed to clear cache',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
