import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (key) {
      // Buscar entrada específica do cache
      const result = await sql`
        SELECT 
          cache_key,
          cache_data,
          expires_at,
          created_at,
          last_accessed_at,
          data_type,
          NOW() as current_time,
          EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_until_expiry
        FROM api_cache 
        WHERE cache_key = ${key}
      `;

      if (result.length === 0) {
        return NextResponse.json({ 
          exists: false, 
          message: 'Cache key not found',
          key: key 
        });
      }

      const entry = result[0];
      const cacheData = entry.cache_data;
      
      return NextResponse.json({
        exists: true,
        key: entry.cache_key,
        dataType: entry.data_type,
        createdAt: entry.created_at,
        lastAccessedAt: entry.last_accessed_at,
        expiresAt: entry.expires_at,
        currentTime: entry.current_time,
        secondsUntilExpiry: entry.seconds_until_expiry,
        minutesUntilExpiry: Math.floor(entry.seconds_until_expiry / 60),
        hoursUntilExpiry: Math.floor(entry.seconds_until_expiry / 3600),
        daysUntilExpiry: Math.floor(entry.seconds_until_expiry / 86400),
        isExpired: entry.seconds_until_expiry <= 0,
        cacheAge: cacheData?.timestamp ? Math.floor((Date.now() - cacheData.timestamp) / 1000 / 60) : null, // em minutos
        cacheTTL: cacheData?.ttl ? Math.floor(cacheData.ttl / 1000 / 60) : null, // em minutos
      });
    } else {
      // Listar todas as entradas do cache
      const result = await sql`
        SELECT 
          cache_key,
          expires_at,
          created_at,
          last_accessed_at,
          data_type,
          NOW() as current_time,
          EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_until_expiry
        FROM api_cache 
        ORDER BY last_accessed_at DESC
        LIMIT 50
      `;

      const entries = result.map(entry => ({
        key: entry.cache_key,
        dataType: entry.data_type,
        createdAt: entry.created_at,
        lastAccessedAt: entry.last_accessed_at,
        expiresAt: entry.expires_at,
        secondsUntilExpiry: entry.seconds_until_expiry,
        minutesUntilExpiry: Math.floor(entry.seconds_until_expiry / 60),
        isExpired: entry.seconds_until_expiry <= 0,
      }));

      return NextResponse.json({
        total: entries.length,
        entries: entries
      });
    }
  } catch (error) {
    console.error('Error debugging cache:', error);
    return NextResponse.json(
      { error: 'Failed to debug cache', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
