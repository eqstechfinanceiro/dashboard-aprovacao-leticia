import { NextResponse } from 'next/server';
import { sql, createCacheTable, isDatabaseAvailable } from '@/lib/neon';

// Force dynamic to prevent static generation during build
export const dynamic = 'force-dynamic';

// Endpoint para testar a conexão com o Neon
export async function GET() {
  // Se o banco não estiver disponível, retornar erro informativo
  if (!isDatabaseAvailable || !sql) {
    return NextResponse.json(
      { 
        success: false,
        error: 'Database not available',
        message: 'Neon connection is not available during build time or when database is not configured',
        isDatabaseAvailable: isDatabaseAvailable
      },
      { status: 503 }
    );
  }

  try {
    console.log('[Neon Test] Iniciando teste de conexão...');

    // Tentar executar uma query simples
    const result = await sql`SELECT NOW() as current_time`;
    
    console.log('[Neon Test] Query executada com sucesso:', result);

    // Tentar criar a tabela do cache
    await createCacheTable();
    
    console.log('[Neon Test] Tabela de cache verificada');

    return NextResponse.json({
      success: true,
      message: 'Conexão com Neon estabelecida com sucesso',
      current_time: result[0]?.current_time,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Neon Test] Erro:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Falha na conexão com Neon',
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Verifique se a variável de ambiente NEON_DATABASE_URL está configurada corretamente'
      },
      { status: 500 }
    );
  }
}
