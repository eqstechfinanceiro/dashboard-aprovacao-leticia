import { NextRequest, NextResponse } from 'next/server';
import { apiCache } from '@/lib/neon-cache';

// Force dynamic to prevent static generation during build
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const keys = searchParams.get('keys');

    if (!keys) {
      return NextResponse.json(
        { error: 'keys parameter is required' },
        { status: 400 }
      );
    }

    const keysArray = keys.split(',');

    // Obter metadados para todas as chaves
    const metadata = await apiCache.getMultipleMetadata(keysArray);

    // Formatar os metadados para torná-los mais amigáveis
    const formattedMetadata: Record<string, any> = {};
    
    for (const [key, data] of Object.entries(metadata)) {
      if (data && data.exists) {
        const ageMinutes = Math.floor(data.age / 1000 / 60);
        const ttlMinutes = Math.floor(data.ttl / 1000 / 60);
        const expiresDate = new Date(data.expiresAt);
        
        formattedMetadata[key] = {
          exists: true,
          lastUpdated: new Date(data.timestamp).toISOString(),
          ageMinutes,
          ageFormatted: formatAge(ageMinutes),
          ttlMinutes,
          ttlFormatted: formatTTL(ttlMinutes),
          expiresAt: expiresDate.toISOString(),
          expiresFormatted: formatExpires(expiresDate),
          dataType: data.dataType, 
          isStale: ageMinutes > ttlMinutes * 0.8 // Considera stale se tiver mais de 80% do TTL
        };
      } else {
        formattedMetadata[key] = {
          exists: false,
          message: 'Dados não encontrados no cache'
        };
      }
    }

    return NextResponse.json({
      success: true,
      metadata: formattedMetadata,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting cache metadata:', error);
    return NextResponse.json(
      { error: 'Failed to get cache metadata' },
      { status: 500 }
    );
  }
}

// Formatar idade de forma amigável
function formatAge(minutes: number): string {
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `${minutes} min atrás`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

// Formatar TTL de forma amigável
function formatTTL(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

// Formatar data de expiração de forma amigável
function formatExpires(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMinutes = Math.floor(diffMs / 1000 / 60);
  
  if (diffMinutes < 0) return 'expirado';
  if (diffMinutes < 60) return `em ${diffMinutes} min`;
  
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `em ${hours}h`;
  
  const days = Math.floor(hours / 24);
  return `em ${days}d`;
}