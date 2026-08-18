# Endpoints Internos da Aplicação (Proxy API)

## Visão Geral

A aplicação Next.js possui endpoints internos que funcionam como proxy para a API VExpenses, adicionando camadas de cache, tratamento de erros e lógica de negócio.

**Base URL da Aplicação:** `http://localhost:3000` (ou URL de produção)

**Prefixo:** `/api`

---

## Endpoints de Proxy VExpenses

### 1. `/api/vexpenses/expenses`

**Método:** GET

**Descrição:** Proxy para endpoint `/v2/expenses` da API VExpenses com cache

**Parâmetros de Query:**
- `include` (string): Campos relacionados (user, costs_center, payment_method, etc)
- `search` (string): Critérios de busca (default: `date:2024-01-01,2024-12-31`)
- `searchFields` (string): Operadores de busca (default: `date:between`)
- `searchJoin` (string): Operador lógico (default: and)
- `page` (string): Número da página (default: 1)
- `per_page` (string): Itens por página (default: 100)

**Cache:**
- **Key:** `expenses:{include}:{search}:{page}:{perPage}`
- **Strategy:** stale-while-revalidate
- **TTL:** Automático baseado no tipo de dado

**Exemplo de Requisição:**
```typescript
const response = await fetch('/api/vexpenses/expenses?include=user,costs_center&search=date:2026-04-01,2026-04-30&searchFields=date:between&page=1&per_page=200');
const data = await response.json();
```

**Resposta (200):**
```json
{
  "request": "https://api.vexpenses.com/v2/expenses",
  "method": "GET",
  "success": true,
  "code": 200,
  "message": "Expenses successfully sent!",
  "data": [
    // Array de expenses
  ]
}
```

**Método:** POST

**Descrição:** Salva dados diretamente no cache (usado pelo background preloader)

**Body:**
```json
{
  "cacheKey": "expenses:user,costs_center:date:2026-04-01,2026-04-30:1:200",
  "data": {
    // Dados a serem cacheados
  },
  "skipFetch": true
}
```

**Resposta (200):**
```json
{
  "success": true,
  "cacheKey": "expenses:user,costs_center:date:2026-04-01,2026-04-30:1:200"
}
```

**Timeout:** 5 minutos

---

### 2. `/api/vexpenses/reports`

**Método:** GET

**Descrição:** Proxy para endpoint `/v2/reports` da API VExpenses com cache

**Parâmetros de Query:**
- `include` (string): Campos relacionados (default: user)

**Cache:**
- **Key:** `reports:{include}`
- **Strategy:** stale-while-revalidate
- **TTL:** Automático

**Exemplo de Requisição:**
```typescript
const response = await fetch('/api/vexpenses/reports?include=user');
const data = await response.json();
```

**Resposta (200):**
```json
{
  "request": "https://api.vexpenses.com/v2/reports",
  "method": "GET",
  "success": true,
  "code": 200,
  "message": "Reports successfully sent!",
  "data": [
    // Array de reports
  ]
}
```

**Método:** POST

**Descrição:** Aprova/reprova relatório (simulado - não implementado na API VExpenses)

**Body:**
```json
{
  "reportId": 7603397,
  "action": "approve",
  "observation": "Observação da aprovação"
}
```

**Resposta (200):**
```json
{
  "success": true,
  "message": "Relatório aprovado com sucesso"
}
```

**Timeout:** 5 minutos (reports é muito lento)

---

### 3. `/api/vexpenses/team-members`

**Método:** GET

**Descrição:** Proxy para endpoint `/v2/team-members` da API VExpenses com cache

**Parâmetros de Query:**
- `include` (string): Campos relacionados (costsCenters, projects)

**Cache:**
- **Key:** `team-members:{include}`
- **Strategy:** Cache simples
- **TTL:** 10 minutos

**Exemplo de Requisição:**
```typescript
const response = await fetch('/api/vexpenses/team-members?include=costsCenters');
const data = await response.json();
```

**Resposta (200):**
```json
{
  "request": "https://api.vexpenses.com/v2/team-members",
  "method": "GET",
  "success": true,
  "code": 200,
  "message": "Team members successfully sent!",
  "data": [
    // Array de team members
  ]
}
```

**Timeout:** 2 minutos

---

### 4. `/api/vexpenses/costs-centers`

**Método:** GET

**Descrição:** Proxy para endpoint `/v2/costs-centers` da API VExpenses com cache

**Cache:**
- **Key:** `costs-centers`
- **Strategy:** stale-while-revalidate
- **TTL:** 6 horas

**Exemplo de Requisição:**
```typescript
const response = await fetch('/api/vexpenses/costs-centers');
const data = await response.json();
```

**Resposta (200):**
```json
{
  "request": "https://api.vexpenses.com/v2/costs-centers",
  "method": "GET",
  "success": true,
  "code": 200,
  "message": "Costs centers successfully sent!",
  "data": [
    // Array de costs centers
  ]
}
```

**Timeout:** 2 minutos

---

### 5. `/api/vexpenses/expenses-type`

**Método:** GET

**Descrição:** Proxy para endpoint `/v2/expenses-type` da API VExpenses com cache

**Cache:**
- **Key:** `expenses-type`
- **Strategy:** Cache simples
- **TTL:** 15 minutos

**Exemplo de Requisição:**
```typescript
const response = await fetch('/api/vexpenses/expenses-type');
const data = await response.json();
```

**Resposta (200):**
```json
{
  "request": "https://api.vexpenses.com/v2/expenses-type",
  "method": "GET",
  "success": true,
  "code": 200,
  "message": "Expenses type successfully sent!",
  "data": [
    // Array de expenses types
  ]
}
```

**Timeout:** 2 minutos

---

### 6. `/api/vexpenses/financial-calculations`

**Método:** GET

**Descrição:** Calcula dados financeiros para usuários baseado em expenses

**Parâmetros de Query:**
- `year` (integer): Ano (default: 2026)
- `month` (integer): Mês (default: 4)
- `userId` (string): ID do usuário (opcional - se não fornecido, calcula para todos)
- `dayStart` (integer): Dia inicial (default: 1)
- `dayEnd` (integer): Dia final (default: 15)

**Exemplo de Requisição:**
```typescript
const response = await fetch('/api/vexpenses/financial-calculations?year=2026&month=4&dayStart=1&dayEnd=15&userId=895945');
const data = await response.json();
```

**Resposta (200):**
```json
{
  "success": true,
  "userId": 895945,
  "year": 2026,
  "month": 4,
  "dayStart": 1,
  "dayEnd": 15,
  "data": {
    "totalExpenses": 1500.50,
    "reimbursableExpenses": 500.00,
    "nonReimbursableExpenses": 1000.50,
    "expensesByPaymentMethod": {
      "Cartão Corporativo Itaú": 1000.00,
      "Pix VExpenses": 500.50
    },
    "expensesByCostCenter": {
      "Centro de Custo A": 800.00,
      "Centro de Custo B": 700.50
    }
  }
}
```

**Timeout:** 2 minutos

---

### 7. `/api/vexpenses/planilha-completa`

**Método:** GET

**Descrição:** Gera planilha completa combinando dados da API com cálculos

**Parâmetros de Query:**
- `year` (integer): Ano (default: 2026)
- `month` (integer): Mês (default: 5)
- `quinzena` (integer): Quinzena (1 ou 2, default: 1)

**Exemplo de Requisição:**
```typescript
const response = await fetch('/api/vexpenses/planilha-completa?year=2026&month=4&quinzena=1');
const data = await response.json();
```

**Resposta (200):**
```json
{
  "success": true,
  "period": {
    "year": 2026,
    "month": 4,
    "quinzena": 1,
    "start_date": "2026-04-01",
    "end_date": "2026-04-15"
  },
  "data": [
    {
      "colaborador": "Nome do Colaborador",
      "cpf": "12345678900",
      "situacao": "ATIVO",
      "regional": "REGIONAL SP",
      "centroCusto": "Centro de Custo",
      "gestor": "Nome do Gestor",
      "diretor": "Nome do Diretor",
      "saldoReembolsar": 500.00,
      "saldoFinal": 1000.00,
      "primeiraQZ": 1500.00,
      "saldoCartao": 200.00,
      "adiantamento": 0,
      "cargaParcial": 300.00,
      "reembolso": 250.00,
      "cargaFinal": 550.00,
      "obs": "",
      "statusCartao": "ATIVO",
      "userId": 895945
    }
  ]
}
```

**Timeout:** 2 minutos

---

### 8. `/api/vexpenses/saldo-complete`

**Método:** GET

**Descrição:** Gera dados completos de saldos usando padrões matemáticos

**Parâmetros de Query:**
- `year` (integer): Ano (default: 2026)
- `month` (integer): Mês (default: 5)
- `quinzena` (integer): Quinzena (1 ou 2, default: 1)

**Exemplo de Requisição:**
```typescript
const response = await fetch('/api/vexpenses/saldo-complete?year=2026&month=4&quinzena=1');
const data = await response.json();
```

**Resposta (200):**
```json
{
  "success": true,
  "period": {
    "year": 2026,
    "month": 4,
    "quinzena": 1,
    "start_date": "2026-04-01",
    "end_date": "2026-04-15"
  },
  "results": [
    {
      "period": {
        "year": 2026,
        "month": 4,
        "quinzena": 1,
        "start_date": "2026-04-01",
        "end_date": "2026-04-15"
      },
      "user_info": {
        "user_id": 895945,
        "name": "Nome do Usuário",
        "cpf": "12345678900",
        "email": "usuario@empresa.com.br"
      },
      "financial_data": {
        "user_id": 895945,
        "quinzena_qz": 1500.00,
        "saldo_final": 1275.75,
        "saldo_cartao": 192.45,
        "saldo_reembolsar": 695.40,
        "adiantamento": 0,
        "carga_parcial": 31.80,
        "reembolso": 347.70,
        "carga_final": 379.50,
        "expenses_count": 15
      },
      "data_sources": {
        "quinzena_qz": "api",
        "saldos": "calculated_patterns",
        "formulas": "spreadsheet_logic"
      }
    }
  ]
}
```

**Padrões Matemáticos:**
- `saldo_final_ratio`: 0.8505 (SALDO FINAL = 1QZ * 0.8505)
- `saldo_cartao_ratio`: 0.1283 (SALDO CARTAO = 1QZ * 0.1283)
- `saldo_reembolsar_ratio`: 0.4636 (SALDO REEMBOLSAR = 1QZ * 0.4636)

---

## Endpoints de Cache

### 9. `/api/cache/debug`

**Método:** GET

**Descrição:** Debug do cache - lista entradas ou busca entrada específica

**Parâmetros de Query:**
- `key` (string, opcional): Chave específica para buscar

**Exemplo de Requisição (listar todas):**
```typescript
const response = await fetch('/api/cache/debug');
const data = await response.json();
```

**Resposta (200):**
```json
{
  "total": 50,
  "entries": [
    {
      "key": "expenses:user,costs_center:date:2026-04-01,2026-04-30:1:200",
      "dataType": "expenses",
      "createdAt": "2026-04-15T10:30:00.000Z",
      "lastAccessedAt": "2026-04-15T14:20:00.000Z",
      "expiresAt": "2026-04-15T16:30:00.000Z",
      "secondsUntilExpiry": 7200,
      "minutesUntilExpiry": 120,
      "isExpired": false
    }
  ]
}
```

**Exemplo de Requisição (entrada específica):**
```typescript
const response = await fetch('/api/cache/debug?key=expenses:user,costs_center:date:2026-04-01,2026-04-30:1:200');
const data = await response.json();
```

**Resposta (200):**
```json
{
  "exists": true,
  "key": "expenses:user,costs_center:date:2026-04-01,2026-04-30:1:200",
  "dataType": "expenses",
  "createdAt": "2026-04-15T10:30:00.000Z",
  "lastAccessedAt": "2026-04-15T14:20:00.000Z",
  "expiresAt": "2026-04-15T16:30:00.000Z",
  "currentTime": "2026-04-15T14:30:00.000Z",
  "secondsUntilExpiry": 7200,
  "minutesUntilExpiry": 120,
  "hoursUntilExpiry": 2,
  "daysUntilExpiry": 0,
  "isExpired": false,
  "cacheAge": 240,
  "cacheTTL": 360
}
```

---

### 10. `/api/cache/metadata`

**Método:** GET

**Descrição:** Retorna metadados do cache

**Resposta (200):**
```json
{
  "totalEntries": 150,
  "entriesByType": {
    "expenses": 50,
    "reports": 20,
    "team-members": 30,
    "costs-centers": 10,
    "expenses-type": 5
  },
  "oldestEntry": "2026-04-01T00:00:00.000Z",
  "newestEntry": "2026-04-15T14:30:00.000Z"
}
```

---

### 11. `/api/cache/status`

**Método:** GET

**Descrição:** Status do sistema de cache

**Resposta (200):**
```json
{
  "status": "healthy",
  "databaseAvailable": true,
  "cacheEnabled": true,
  "totalEntries": 150,
  "hitRate": 0.85
}
```

---

### 12. `/api/cache/refresh`

**Método:** POST

**Descrição:** Força refresh de uma entrada específica do cache

**Body:**
```json
{
  "key": "expenses:user,costs_center:date:2026-04-01,2026-04-30:1:200"
}
```

**Resposta (200):**
```json
{
  "success": true,
  "message": "Cache refresh initiated",
  "key": "expenses:user,costs_center:date:2026-04-01,2026-04-30:1:200"
}
```

---

### 13. `/api/cache/refresh-background`

**Método:** POST

**Descrição:** Inicia refresh em background de múltiplas entradas

**Body:**
```json
{
  "keys": [
    "expenses:user,costs_center:date:2026-04-01,2026-04-30:1:200",
    "reports:user",
    "team-members:costsCenters"
  ]
}
```

**Resposta (200):**
```json
{
  "success": true,
  "message": "Background refresh initiated",
  "keys": [
    "expenses:user,costs_center:date:2026-04-01,2026-04-30:1:200",
    "reports:user",
    "team-members:costsCenters"
  ]
}
```

---

### 14. `/api/cache/preload`

**Método:** POST

**Descrição:** Preload de dados no cache

**Body:**
```json
{
  "endpoints": [
    "team-members",
    "costs-centers",
    "expenses-type"
  ]
}
```

**Resposta (200):**
```json
{
  "success": true,
  "message": "Preload completed",
  "results": [
    {
      "endpoint": "team-members",
      "status": "success",
      "cacheKey": "team-members:costsCenters"
    },
    {
      "endpoint": "costs-centers",
      "status": "success",
      "cacheKey": "costs-centers"
    },
    {
      "endpoint": "expenses-type",
      "status": "success",
      "cacheKey": "expenses-type"
    }
  ]
}
```

---

### 15. `/api/cache/preload-now`

**Método:** POST

**Descrição:** Preload imediato de dados no cache

**Body:**
```json
{
  "endpoints": [
    "team-members",
    "costs-centers"
  ]
}
```

**Resposta (200):**
```json
{
  "success": true,
  "message": "Immediate preload completed",
  "results": [
    // Mesmo formato do /preload
  ]
}
```

---

### 16. `/api/cache/test`

**Método:** GET

**Descrição:** Testa funcionalidade do cache

**Resposta (200):**
```json
{
  "success": true,
  "message": "Cache is working correctly",
  "testResults": {
    "write": "success",
    "read": "success",
    "delete": "success",
    "ttl": "success"
  }
}
```

---

## Endpoints de Planilha

### 17. `/api/planilha-quinzena`

**Método:** GET

**Descrição:** Retorna dados da planilha 1QZ para qualquer período, combinando API com índice local

**Parâmetros de Query:**
- `year` (integer): Ano (default: 2026)
- `month` (integer): Mês (default: 4)
- `quinzena` (integer): Quinzena (1 ou 2, default: 1)

**Exemplo de Requisição:**
```typescript
const response = await fetch('/api/planilha-quinzena?year=2026&month=4&quinzena=1');
const data = await response.json();
```

**Resposta (200):**
```json
{
  "success": true,
  "period": {
    "year": 2026,
    "month": 4,
    "quinzena": 1,
    "start_date": "2026-04-01",
    "end_date": "2026-04-15"
  },
  "data": [
    {
      "colaborador": "Nome do Colaborador",
      "cpf": "12345678900",
      "situacao": "ATIVO",
      "regional": "REGIONAL SP",
      "centroCusto": "Centro de Custo",
      "gestor": "Nome do Gestor",
      "diretor": "Nome do Diretor",
      "saldoReembolsar": 500.00,
      "saldoFinal": 1000.00,
      "primeiraQZ": 1500.00,
      "saldoCartao": 200.00,
      "adiantamento": 0,
      "cargaParcial": 300.00,
      "reembolso": 250.00,
      "cargaFinal": 550.00,
      "obs": "",
      "statusCartao": "ATIVO",
      "userId": 895945,
      "dataSources": {
        "colaborador": "api",
        "cpf": "api",
        "situacao": "api",
        "centroCusto": "planilha",
        "primeiraQZ": "planilha",
        "saldoCartao": "planilha",
        "reembolso": "api"
      }
    }
  ],
  "errors": {
    "members": null,
    "expenses": null
  }
}
```

**Fontes de Dados:**
- **API VExpenses:** team-members, expenses
- **Índice Local:** planilha-full-index.json (dados históricos de planilhas)
- **Fallback:** planilha-1qz-data.json (dados históricos de saldos)

---

### 18. `/api/spreadsheet-data`

**Método:** GET

**Descrição:** Lê dados de planilhas Excel locais

**Parâmetros de Query:**
- `sheet` (string): 'planilha1' ou 'planilha2'

**Exemplo de Requisição (Planilha 1):**
```typescript
const response = await fetch('/api/spreadsheet-data?sheet=planilha1');
const data = await response.json();
```

**Resposta (200):**
```json
{
  "success": true,
  "data": [
    {
      "nome": "Nome do Colaborador",
      "cpf": "12345678900",
      "statusColab": "ATIVO",
      "centroCusto": "Centro de Custo",
      "codCentroCusto": "123",
      "gestor": "Nome do Gestor",
      "direcao": "Nome do Diretor",
      "saldoReembolsar": "500.00",
      "saldoFinal": "1000.00",
      "qzAbril26": "1500.00",
      "saldoCartao": "200.00",
      "adiantamento": "0",
      "cargaParcial": "300.00",
      "reembolso": "250.00",
      "cargaFinal": "550.00",
      "statusCartao": "ATIVO",
      "obs": ""
    }
  ]
}
```

**Exemplo de Requisição (Planilha 2):**
```typescript
const response = await fetch('/api/spreadsheet-data?sheet=planilha2');
const data = await response.json();
```

**Resposta (200):**
```json
{
  "success": true,
  "data": [
    {
      "nome": "Nome do Colaborador",
      "cpf": "12345678900",
      "situacao": "ATIVO",
      "statusCartao": "ATIVO",
      "regional": "REGIONAL SP",
      "centroCusto": "Centro de Custo",
      "gestor": "Nome do Gestor",
      "diretor": "Nome do Diretor",
      "cargaPainel": "1500.00",
      "descarga": "500.00",
      "tarifa": "50.00",
      "prestacao": "200.00",
      "saldoPrestacao": "750.00",
      "saldoCartaoPainel": "200.00",
      "saldoFinalPainel": "550.00",
      "primeiraQz": "800.00",
      "segundaQz": "700.00",
      "adicionaisPainel": "0",
      "reembolsoPainel": "250.00"
    }
  ]
}
```

**Arquivos Lidos:**
- **Planilha 1:** `../data/1QZ ABRIL 2026 - VEXPENSES (1).xlsx`
- **Planilha 2:** `../data/CONTROLE - VEXPENSES - ABRIL- 2026 (1).xlsb`

---

### 19. `/api/quinzena-complete`

**Método:** GET

**Descrição:** Retorna dados completos da quinzena combinando múltiplas fontes

**Parâmetros de Query:**
- `year` (integer): Ano (default: 2026)
- `month` (integer): Mês (default: 4)
- `quinzena` (integer): Quinzena (1 ou 2, default: 1)

**Exemplo de Requisição:**
```typescript
const response = await fetch('/api/quinzena-complete?year=2026&month=4&quinzena=1');
const data = await response.json();
```

**Resposta (200):**
```json
{
  "success": true,
  "period": {
    "year": 2026,
    "month": 4,
    "quinzena": 1,
    "start_date": "2026-04-01",
    "end_date": "2026-04-15"
  },
  "data": [
    // Dados combinados de múltiplas fontes
  ]
}
```

---

### 20. `/api/saldo-historico`

**Método:** GET

**Descrição:** Retorna dados históricos de saldos

**Parâmetros de Query:**
- `cpf` (string): CPF do usuário (opcional)
- `year` (integer): Ano (opcional)
- `month` (integer): Mês (opcional)

**Exemplo de Requisição:**
```typescript
const response = await fetch('/api/saldo-historico?cpf=12345678900&year=2026&month=4');
const data = await response.json();
```

**Resposta (200):**
```json
{
  "success": true,
  "data": [
    {
      "cpf": "12345678900",
      "year": 2026,
      "month": 4,
      "saldoFinal": 1000.00,
      "saldoCartao": 200.00,
      "saldoReembolsar": 500.00,
      "primeiraQZ": 1500.00
    }
  ]
}
```

---

### 21. `/api/compare-planilha-api`

**Método:** GET

**Descrição:** Compara dados da planilha com dados da API

**Parâmetros de Query:**
- `year` (integer): Ano (default: 2026)
- `month` (integer): Mês (default: 4)

**Exemplo de Requisição:**
```typescript
const response = await fetch('/api/compare-planilha-api?year=2026&month=4');
const data = await response.json();
```

**Resposta (200):**
```json
{
  "success": true,
  "comparison": [
    {
      "cpf": "12345678900",
      "nome": "Nome do Colaborador",
      "planilha": {
        "primeiraQZ": 1500.00,
        "saldoCartao": 200.00,
        "saldoFinal": 1000.00
      },
      "api": {
        "totalExpenses": 1500.00,
        "cartaoExpenses": 200.00
      },
      "differences": {
        "primeiraQZ": 0,
        "saldoCartao": 0,
        "saldoFinal": 0
      },
      "match": true
    }
  ]
}
```

---

## Endpoints de Preload

### 22. `/api/preload`

**Método:** POST

**Descrição:** Preload de dados críticos no cache

**Body:**
```json
{
  "endpoints": [
    "team-members",
    "costs-centers",
    "expenses-type"
  ]
}
```

**Resposta (200):**
```json
{
  "success": true,
  "message": "Preload completed successfully",
  "results": [
    {
      "endpoint": "team-members",
      "status": "success",
      "cacheKey": "team-members:costsCenters",
      "records": 150
    }
  ]
}
```

---

## Estratégias de Cache

### Stale-While-Revalidate
```typescript
const staleResult = await apiCache.getWithStale(cacheKey);

if (staleResult.data) {
  // Retornar dados imediatamente (mesmo se stale)
  return NextResponse.json(staleResult.data);
  
  // Se estiver stale, iniciar refresh em background
  if (staleResult.shouldRefresh) {
    refreshCacheInBackground(cacheKey, ...);
  }
}
```

### Cache Keys
- `expenses:{include}:{search}:{page}:{perPage}`
- `reports:{include}`
- `team-members:{include}`
- `costs-centers`
- `expenses-type`

### TTLs
- **Costs Centers:** 6 horas
- **Expenses Type:** 15 minutos
- **Team Members:** 10 minutos
- **Reports:** Automático
- **Expenses:** Automático

---

## Tratamento de Erros

### Build Time
```typescript
if (isBuildTime) {
  return NextResponse.json({ 
    success: true, 
    buildTime: true, 
    message: 'Build time - skipping cache operations' 
  });
}
```

### Database Not Available
```typescript
if (!isDatabaseAvailable || !sql) {
  return NextResponse.json(
    { 
      error: 'Database not available',
      message: 'Cache is not available during build time or when database is not configured'
    },
    { status: 503 }
  );
}
```

### Timeout
```typescript
if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
  return NextResponse.json(
    { error: 'API timeout - A requisição demorou muito tempo. Tente novamente.' },
    { status: 504 }
  );
}
```

---

## Boas Práticas

1. **Usar endpoints proxy ao invés de chamadas diretas**
   - Beneficia-se de cache
   - Tratamento de erros centralizado
   - Timeout configurado

2. **Monitorar cache hits/misses**
   - Usar `/api/cache/debug` para verificar status
   - Ajustar TTLs baseado em padrões de uso

3. **Preload de dados críticos**
   - Usar `/api/preload` antes de picos de uso
   - Preload team-members, costs-centers, expenses-type

4. **Tratamento graceful de erros**
   - Build time: retornar dados vazios
   - Database unavailable: retornar erro 503
   - Timeout: retornar erro 504

5. **Background refresh para dados stale**
   - Não bloquear requisições por refresh
   - Usar stale-while-revalidate

---

## Conclusão

Os endpoints internos da aplicação fornecem:

**✅ Benefícios:**
- Cache inteligente com stale-while-revalidate
- Tratamento centralizado de erros
- Timeout configurado por endpoint
- Lógica de negócio adicional (cálculos financeiros)
- Combinação de múltiplas fontes de dados

**🔧 Funcionalidades:**
- Proxy para API VExpenses
- Cache com TTL automático
- Debug e monitoramento de cache
- Preload de dados críticos
- Cálculos financeiros
- Combinação de API + planilhas locais

**📊 Estratégias:**
- Stale-while-revalidate para performance
- TTLs diferenciados por tipo de dado
- Background refresh para não bloquear requisições
- Fallback para dados locais quando API falha
