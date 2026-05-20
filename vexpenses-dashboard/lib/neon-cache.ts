// Sistema de cache persistente usando banco de dados Neon
// Mantém a mesma interface do SimpleCache para fácil substituição

import { sql, ensureCacheTable, isDatabaseAvailable } from './neon';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live em milissegundos
}

// Estratégias de TTL baseadas no tipo de dado
const TTL_STRATEGIES = {
  // Dados históricos (períodos passados) - não mudam
  'historical': 30 * 24 * 60 * 60 * 1000, // 30 dias (aumentado de 7 dias)
  
  // Dados do mês atual - podem mudar durante o mês
  'current-month': 60 * 60 * 1000, // 1 hora
  
  // Dados de configuração - mudam com menos frequência
  'config': 24 * 60 * 60 * 1000, // 24 horas (aumentado de 6h)
  
  // Dados de relatórios - mudam moderadamente
  'reports': 24 * 60 * 60 * 1000, // 24 horas (aumentado de 2h)
  
  // Padrão
  'default': 24 * 60 * 60 * 1000, // 24 horas (aumentado de 1h)
};

// Porcentagem do TTL considerada como "stale" (para stale-while-revalidate)
const STALE_THRESHOLD = 0.5; // Reduzido para 50% - mais agressivo com background refresh

class NeonCache {
  private defaultTTL: number = 60 * 60 * 1000; // 1 hora padrão (aumentado de 5 minutos)

  constructor(defaultTTL?: number) {
    if (defaultTTL) {
      this.defaultTTL = defaultTTL;
    }
  }

  // Determinar o tipo de dado baseado na chave do cache
  private getDataType(key: string): string {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    
    // Verificar se é mês atual
    if (key.includes(`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`)) {
      console.log(`[Neon Cache] Tipo detectado para ${key}: current-month`);
      return 'current-month';
    }
    
    // Verificar se é período histórico (ano anterior ou meses anteriores do ano atual)
    if (key.includes('2024') || key.includes('2025')) {
      console.log(`[Neon Cache] Tipo detectado para ${key}: historical (ano anterior)`);
      return 'historical';
    }
    
    // Verificar se é período de múltiplos meses no ano atual (últimos 3 meses, últimos 6 meses, etc)
    if (key.includes(`${currentYear}-`)) {
      // Se abrange múltiplos meses ou meses anteriores ao atual, considerar histórico
      const monthMatches = key.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (monthMatches) {
        const startMonth = parseInt(monthMatches[2]) - 1;
        if (startMonth < currentMonth) {
          console.log(`[Neon Cache] Tipo detectado para ${key}: historical (mês anterior no ano atual)`);
          return 'historical';
        }
      }
    }
    
    if (key.includes('costs-centers') || key.includes('expenses-type')) {
      console.log(`[Neon Cache] Tipo detectado para ${key}: config`);
      return 'config';
    }
    
    if (key.includes('reports')) {
      console.log(`[Neon Cache] Tipo detectado para ${key}: reports`);
      return 'reports';
    }
    
    console.log(`[Neon Cache] Tipo detectado para ${key}: default`);
    return 'default';
  }

  async set<T>(key: string, data: T, ttl?: number, dataType?: string): Promise<void> {
    // Se o banco não estiver disponível (build time), não fazer nada
    if (!isDatabaseAvailable || !sql) {
      console.log('[Neon Cache] Banco não disponível, ignorando set operation');
      return;
    }

    try {
      // Determinar tipo de dado automaticamente se não fornecido
      const type = dataType || this.getDataType(key);
      
      // Usar TTL específico ou estratégia baseada no tipo
      const entryTTL = ttl || TTL_STRATEGIES[type as keyof typeof TTL_STRATEGIES] || this.defaultTTL;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + entryTTL);
      
      const cacheEntry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl: entryTTL,
      };

      await sql`
        INSERT INTO api_cache (cache_key, cache_data, expires_at, data_type)
        VALUES (${key}, ${JSON.stringify(cacheEntry)}::jsonb, ${expiresAt}, ${type})
        ON CONFLICT (cache_key) 
        DO UPDATE SET 
          cache_data = EXCLUDED.cache_data,
          expires_at = EXCLUDED.expires_at,
          last_accessed_at = NOW(),
          data_type = EXCLUDED.data_type
      `;
      
      console.log(`[Neon Cache] Salvo: ${key} (TTL: ${entryTTL / 1000 / 60}min, tipo: ${type})`);
    } catch (error: any) {
      console.error('[Neon Cache] Erro ao salvar:', error);
      
      // Se o erro for de tabela não existir, tentar criar
      if (error.message && error.message.includes('relation "api_cache" does not exist')) {
        console.log('[Neon Cache] Tabela não existe, tentando criar...');
        try {
          await ensureCacheTable();
          // Tentar novamente após criar a tabela
          return this.set(key, data, ttl, dataType);
        } catch (retryError) {
          console.error('[Neon Cache] Erro ao criar tabela:', retryError);
          throw retryError;
        }
      }
      
      throw error;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    // Se o banco não estiver disponível (build time), retornar null
    if (!isDatabaseAvailable || !sql) {
      console.log('[Neon Cache] Banco não disponível, retornando null para get');
      return null;
    }

    try {
      // Primeiro atualizar last_accessed_at
      await sql`
        UPDATE api_cache 
        SET last_accessed_at = NOW() 
        WHERE cache_key = ${key} AND expires_at > NOW()
      `;

      // Buscar o cache
      const result = await sql`
        SELECT cache_data 
        FROM api_cache 
        WHERE cache_key = ${key} AND expires_at > NOW()
      `;

      if (!result || result.length === 0) {
        return null;
      }

      const cacheEntry: CacheEntry<T> = result[0].cache_data;
      
      // Verificar TTL adicional (redundância de segurança)
      const now = Date.now();
      const age = now - cacheEntry.timestamp;
      
      if (age > cacheEntry.ttl) {
        await this.delete(key);
        return null;
      }

      console.log(`[Neon Cache] Hit: ${key}`);
      return cacheEntry.data;
    } catch (error: any) {
      console.error('[Neon Cache] Erro ao buscar:', error);
      
      // Se o erro for de tabela não existir, tentar criar e retornar null
      if (error.message && error.message.includes('relation "api_cache" does not exist')) {
        console.log('[Neon Cache] Tabela não existe, tentando criar...');
        try {
          await ensureCacheTable();
        } catch (retryError) {
          console.error('[Neon Cache] Erro ao criar tabela:', retryError);
        }
      }
      
      return null;
    }
  }

  // Implementação de stale-while-revalidate
  // Retorna dados stale se existirem e inicia refresh em background
  async getWithStale<T>(key: string): Promise<{ 
    data: T | null; 
    isStale: boolean; 
    shouldRefresh: boolean;
  }> {
    try {
      // Buscar o cache (mesmo se expirado)
      const result = await sql`
        SELECT cache_data, expires_at
        FROM api_cache 
        WHERE cache_key = ${key}
      `;

      if (!result || result.length === 0) {
        return { data: null, isStale: false, shouldRefresh: true };
      }

      const cacheEntry: CacheEntry<T> = result[0].cache_data;
      const now = Date.now();
      const age = now - cacheEntry.timestamp;
      const isExpired = age > cacheEntry.ttl;
      const isStale = age > (cacheEntry.ttl * STALE_THRESHOLD);
      
      // Se estiver expirado, deletar e retornar null
      if (isExpired) {
        await this.delete(key);
        return { data: null, isStale: false, shouldRefresh: true };
      }

      // Se estiver stale mas não expirado, retornar dados e marcar para refresh
      if (isStale) {
        console.log(`[Neon Cache] Stale hit: ${key} (age: ${Math.floor(age / 1000 / 60)}min)`);
        return { data: cacheEntry.data, isStale: true, shouldRefresh: true };
      }

      // Cache fresco
      console.log(`[Neon Cache] Fresh hit: ${key}`);
      return { data: cacheEntry.data, isStale: false, shouldRefresh: false };
    } catch (error: any) {
      console.error('[Neon Cache] Erro ao buscar com stale:', error);
      return { data: null, isStale: false, shouldRefresh: true };
    }
  }

  async has(key: string): Promise<boolean> {
    // Se o banco não estiver disponível (build time), retornar false
    if (!isDatabaseAvailable || !sql) {
      console.log('[Neon Cache] Banco não disponível, retornando false para has');
      return false;
    }

    try {
      const result = await sql`
        SELECT 1 
        FROM api_cache 
        WHERE cache_key = ${key} AND expires_at > NOW()
      `;
      return result.length > 0;
    } catch (error) {
      console.error('[Neon Cache] Erro ao verificar:', error);
      return false;
    }
  }

  async clear(): Promise<void> {
    // Se o banco não estiver disponível (build time), não fazer nada
    if (!isDatabaseAvailable || !sql) {
      console.log('[Neon Cache] Banco não disponível, ignorando clear');
      return;
    }

    try {
      await sql`DELETE FROM api_cache`;
      console.log('[Neon Cache] Cache limpo');
    } catch (error) {
      console.error('[Neon Cache] Erro ao limpar:', error);
      throw error;
    }
  }

  async delete(key: string): Promise<boolean> {
    // Se o banco não estiver disponível (build time), retornar false
    if (!isDatabaseAvailable || !sql) {
      console.log('[Neon Cache] Banco não disponível, retornando false para delete');
      return false;
    }

    try {
      const result = await sql`
        DELETE FROM api_cache 
        WHERE cache_key = ${key}
      `;
      console.log(`[Neon Cache] Deletado: ${key}`);
      return result.length > 0;
    } catch (error) {
      console.error('[Neon Cache] Erro ao deletar:', error);
      return false;
    }
  }

  // Limpar entradas expiradas
  async cleanup(): Promise<void> {
    // Se o banco não estiver disponível (build time), não fazer nada
    if (!isDatabaseAvailable || !sql) {
      console.log('[Neon Cache] Banco não disponível, ignorando cleanup');
      return;
    }

    try {
      const result = await sql`
        DELETE FROM api_cache 
        WHERE expires_at < NOW()
      `;
      if (result.length > 0) {
        console.log(`[Neon Cache] ${result.length} entradas expiradas removidas`);
      }
    } catch (error) {
      console.error('[Neon Cache] Erro ao limpar expirados:', error);
    }
  }

  // Obter estatísticas do cache
  async getStats(): Promise<{ total: number; expired: number; byType: Record<string, number> }> {
    // Se o banco não estiver disponível (build time), retornar estatísticas vazias
    if (!isDatabaseAvailable || !sql) {
      console.log('[Neon Cache] Banco não disponível, retornando estatísticas vazias');
      return { total: 0, expired: 0, byType: {} };
    }

    try {
      const result = await sql`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN expires_at < NOW() THEN 1 ELSE 0 END) as expired,
          data_type
        FROM api_cache
        GROUP BY data_type
      `;
      
      const byType: Record<string, number> = {};
      let total = 0;
      let expired = 0;
      
      if (result && result.length > 0) {
        result.forEach((row: any) => {
          byType[row.data_type] = parseInt(row.total);
          total += parseInt(row.total);
          expired += parseInt(row.expired);
        });
      }
      
      return { total, expired, byType };
    } catch (error) {
      console.error('[Neon Cache] Erro ao obter estatísticas:', error);
      return { total: 0, expired: 0, byType: {} };
    }
  }

  // Obter metadados de uma chave específica (incluindo timestamp)
  async getMetadata(key: string): Promise<{ 
    exists: boolean; 
    timestamp: number; 
    age: number; 
    ttl: number; 
    expiresAt: string;
    dataType: string;
  } | null> {
    try {
      const result = await sql`
        SELECT 
          cache_data,
          expires_at,
          last_accessed_at,
          data_type,
          created_at
        FROM api_cache 
        WHERE cache_key = ${key}
      `;

      if (!result || result.length === 0) {
        return null;
      }

      const row = result[0];
      const cacheEntry: CacheEntry<any> = row.cache_data;
      const now = Date.now();
      const age = now - cacheEntry.timestamp;

      return {
        exists: true,
        timestamp: cacheEntry.timestamp,
        age,
        ttl: cacheEntry.ttl,
        expiresAt: row.expires_at,
        dataType: row.data_type
      };
    } catch (error) {
      console.error('[Neon Cache] Erro ao obter metadados:', error);
      return null;
    }
  }

  // Obter metadados de múltiplas chaves
  async getMultipleMetadata(keys: string[]): Promise<Record<string, {
    exists: boolean; 
    timestamp: number; 
    age: number; 
    ttl: number; 
    expiresAt: string;
    dataType: string;
  } | null>> {
    const metadata: Record<string, any> = {};
    
    for (const key of keys) {
      metadata[key] = await this.getMetadata(key);
    }
    
    return metadata;
  }
}

// Instância global do cache Neon
export const apiCache = new NeonCache(60 * 60 * 1000); // 1 hora (aumentado de 5 minutos)

// Limpar cache expirado a cada hora (em vez de cada minuto, pois é persistente)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    apiCache.cleanup();
  }, 60 * 60 * 1000);
}
