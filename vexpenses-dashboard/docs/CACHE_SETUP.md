# Configuração do Cache Neon

Este projeto usa o banco de dados Neon para cache persistente de dados da API vExpenses.

## Configuração

### 1. Obter a URL de conexão do Neon

1. Acesse o console do Neon: https://console.neon.tech/
2. Selecione o projeto: `billowing-dust-36154446`
3. Vá em "Connection Details"
4. Copie a connection string (Connection String)
5. Formato: `postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb`

### 2. Configurar variável de ambiente

Crie ou edite o arquivo `.env.local` na raiz do projeto:

```bash
NEON_DATABASE_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb
```

### 3. A tabela do cache será criada automaticamente

A tabela `api_cache` será criada automaticamente na primeira vez que o cache for usado. Não é necessário criar manualmente.

## Estrutura do Cache

### Tabela: api_cache

- `id`: Identificador único
- `cache_key`: Chave única para identificar o cache
- `cache_data`: Dados em formato JSONB
- `created_at`: Timestamp de criação
- `expires_at`: Timestamp de expiração
- `last_accessed_at`: Timestamp do último acesso
- `data_type`: Tipo de dado armazenado

### Endpoints de Cache

#### Verificar status do cache
```
GET /api/cache/status
```

#### Limpar todo o cache
```
DELETE /api/cache/status
```

#### Atualizar cache específico
```
POST /api/cache/refresh
Body: { "endpoint": "expenses", "params": {...} }
```

#### Atualizar todos os caches
```
GET /api/cache/refresh
```

## TTL (Time To Live) por Endpoint

- `expenses`: 5 minutos
- `reports`: 5 minutos
- `team-members`: 10 minutos
- `costs-centers`: 15 minutos
- `expenses-type`: 15 minutos

## Manutenção Automática

- O cache expirado é limpo automaticamente a cada hora
- A tabela é criada automaticamente se não existir
- Operações de cache são tolerantes a falhas (não quebram a aplicação)

## Atualização em Background

Este projeto já está configurado com cron jobs automáticos através do arquivo `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cache/refresh",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

Isso atualizará automaticamente o cache a cada 15 minutos quando hospedado no Vercel.

### Opções alternativas:

Se não estiver usando Vercel, você pode:

1. **Usar um serviço externo**:
   - Configure um cron job em qualquer serviço para chamar o endpoint
   - Exemplo: GitHub Actions, AWS Lambda, cron-job.org

2. **Atualização manual**:
   - Chame `/api/cache/refresh` manualmente quando necessário

3. **Usar um cron job local**:
   - Configure um cron job no servidor para chamar o endpoint periodicamente

## Monitoramento

Para verificar o status do cache:

```bash
curl http://localhost:3000/api/cache/status
```

Resposta:
```json
{
  "success": true,
  "stats": {
    "total": 15,
    "expired": 2,
    "byType": {
      "expenses": 10,
      "team-members": 3,
      "costs-centers": 2
    }
  },
  "timestamp": "2026-05-04T16:00:00.000Z"
}
```

## Troubleshooting

### Erro: "NEON_DATABASE_URL não está definida"

Certifique-se de que a variável de ambiente `NEON_DATABASE_URL` está definida no arquivo `.env.local`.

### Erro: "relation "api_cache" does not exist"

A tabela será criada automaticamente na primeira operação de cache. Se o erro persistir, verifique as permissões do usuário do banco de dados.

### Cache não está funcionando

1. Verifique se a URL de conexão está correta
2. Verifique se o banco de dados está acessível
3. Verifique os logs do console para mensagens de erro

## Benefícios do Cache Neon

- **Persistente**: O cache sobrevive a reinicializações do servidor
- **Distribuído**: Pode ser compartilhado entre múltiplas instâncias
- **Escalável**: Neon escala automaticamente
- **Confiável**: Backup automático e replicação
- **Econômico**: Paga apenas pelo que usa (serverless)
