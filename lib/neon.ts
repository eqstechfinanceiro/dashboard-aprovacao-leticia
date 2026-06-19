import { neon } from '@neondatabase/serverless';

// Configuração do banco de dados Neon
const NEON_DATABASE_URL = process.env.NEON_DATABASE_URL;

// Verificar se estamos em ambiente de build (Next.js build time)
const isBuildTime = process.env.NEXT_PHASE === 'phase-build' || process.env.NODE_ENV === 'production' && !process.env.NEON_DATABASE_URL;

export const sql = NEON_DATABASE_URL ? neon(NEON_DATABASE_URL) : null;

// Flag para indicar se o banco está disponível
export const isDatabaseAvailable = !!NEON_DATABASE_URL && !isBuildTime;

// Flag para evitar múltiplas tentativas de criação da tabela
let tableCreationAttempted = false;

// Funções auxiliares para o cache
export async function createCacheTable() {
  if (!sql) {
    console.log('[Neon] Banco não disponível, não é possível criar tabela');
    return;
  }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS api_cache (
        id SERIAL PRIMARY KEY,
        cache_key VARCHAR(255) UNIQUE NOT NULL,
        cache_data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        data_type VARCHAR(50) NOT NULL
      )
    `;

    await sql`CREATE INDEX IF NOT EXISTS idx_cache_key ON api_cache(cache_key)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_expires_at ON api_cache(expires_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_data_type ON api_cache(data_type)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_last_accessed ON api_cache(last_accessed_at)`;
    
    console.log('[Neon] Tabela de cache criada/verificada com sucesso');
  } catch (error) {
    console.error('[Neon] Erro ao criar tabela de cache:', error);
    throw error;
  }
}

export async function ensureCacheTable() {
  if (tableCreationAttempted) {
    return;
  }
  
  tableCreationAttempted = true;
  await createCacheTable();
}

export async function clearCacheTable() {
  if (!sql) {
    console.log('[Neon] Banco não disponível, não é possível limpar tabela');
    return;
  }

  await sql`DELETE FROM api_cache`;
}

export async function dropCacheTable() {
  if (!sql) {
    console.log('[Neon] Banco não disponível, não é possível dropar tabela');
    return;
  }

  await sql`DROP TABLE IF EXISTS api_cache`;
}

// Funções para estatísticas de pré-carregamento
export async function createPreloadStatsTable() {
  if (!sql) {
    console.log('[Neon] Banco não disponível, não é possível criar tabela de preload_stats');
    return;
  }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS preload_stats (
        id SERIAL PRIMARY KEY,
        task_id VARCHAR(255) UNIQUE NOT NULL,
        status VARCHAR(50) NOT NULL,
        total_months INTEGER NOT NULL,
        successful_months INTEGER NOT NULL,
        failed_months INTEGER NOT NULL,
        total_records INTEGER NOT NULL,
        total_duration_ms BIGINT NOT NULL,
        avg_duration_ms FLOAT NOT NULL,
        started_at TIMESTAMP WITH TIME ZONE NOT NULL,
        completed_at TIMESTAMP WITH TIME ZONE
      )
    `;

    await sql`CREATE INDEX IF NOT EXISTS idx_preload_task_id ON preload_stats(task_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_preload_status ON preload_stats(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_preload_started_at ON preload_stats(started_at)`;
    
    console.log('[Neon] Tabela de preload_stats criada/verificada com sucesso');
  } catch (error) {
    console.error('[Neon] Erro ao criar tabela de preload_stats:', error);
    throw error;
  }
}

export async function ensurePreloadStatsTable() {
  try {
    await createPreloadStatsTable();
  } catch (error) {
    console.error('[Neon] Erro ao garantir tabela de preload_stats:', error);
    // Não lançar erro para não quebrar a aplicação
  }
}
