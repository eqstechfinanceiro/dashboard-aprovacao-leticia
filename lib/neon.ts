import { Pool, QueryResult } from 'pg';

// Configuração do banco de dados (Neon PostgreSQL)
const DATABASE_URL = process.env.NEON_DATABASE_URL;

// Verificar se estamos em ambiente de build (Next.js build time)
const isBuildTime = process.env.NEXT_PHASE === 'phase-build' || process.env.NODE_ENV === 'production' && !DATABASE_URL;

// Parse connection string to configure SSL properly
function parseConnString(url: string) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: parseInt(u.port) || 5432,
      database: u.pathname.slice(1),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      ssl: { rejectUnauthorized: false },
    };
  } catch {
    return { connectionString: url, ssl: { rejectUnauthorized: false } };
  }
}

let pool: Pool | null = null;

if (DATABASE_URL && !isBuildTime) {
  pool = new Pool({
    ...parseConnString(DATABASE_URL),
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
}

// Tagged template literal wrapper that mimics @neondatabase/serverless interface
const sqlFn = (strings: TemplateStringsArray, ...values: any[]) => {
  let query = strings[0];
  for (let i = 0; i < values.length; i++) {
    query += `$${i + 1}${strings[i + 1]}`;
  }
  return pool!.query(query, values).then((res: QueryResult) => res.rows);
};

// Attach .query method for raw query access (used by pipeline batch inserts)
(sqlFn as any).query = (text: string, params?: any[]) => pool!.query(text, params);

export const sql = pool ? (sqlFn as any) : null;

// Flag para indicar se o banco está disponível
export const isDatabaseAvailable = !!DATABASE_URL && !isBuildTime;

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
