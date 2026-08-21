# Filtros e Formas de Acesso aos Dados

## Visão Geral

Este documento detalha todas as formas de acessar e filtrar dados da API VExpenses, incluindo parâmetros avançados, estratégias de busca e combinações de filtros.

---

## 1. Sistema de Filtros da API VExpenses

### Estrutura Básica

A API VExpenses usa um sistema de filtros poderoso baseado em três parâmetros principais:

1. **`search`**: Os valores a buscar
2. **`searchFields`**: Os operadores de comparação
3. **`searchJoin`**: O operador lógico (AND/OR)

### Sintaxe

```
search: campo1:valor1,campo2:valor2;campo3:valor3
searchFields: campo1:operador1;campo2:operador2;campo3:operador3
searchJoin: and|or
```

**Regras:**
- Campos são separados por `;`
- Para operador `between`, usar dois valores separados por `,`
- `searchJoin` define como múltiplos campos são combinados

---

## 2. Operadores Disponíveis

### `between` - Intervalo
**Uso:** Para datas e valores numéricos

**Exemplo:**
```typescript
search: 'date:2026-04-01,2026-04-30'
searchFields: 'date:between'
```

**Nota:** Requer exatamente 2 valores separados por vírgula

### `=` - Igual
**Uso:** Para correspondência exata

**Exemplo:**
```typescript
search: 'user_id:895945'
searchFields: 'user_id:='
```

### `>=` - Maior ou Igual
**Uso:** Para valores mínimos

**Exemplo:**
```typescript
search: 'value:100'
searchFields: 'value:>='
```

### `<=` - Menor ou Igual
**Uso:** Para valores máximos

**Exemplo:**
```typescript
search: 'value:500'
searchFields: 'value:<='
```

### `>` - Maior
**Uso:** Para valores estritamente maiores

**Exemplo:**
```typescript
search: 'value:100'
searchFields: 'value:>'
```

### `<` - Menor
**Uso:** Para valores estritamente menores

**Exemplo:**
```typescript
search: 'value:500'
searchFields: 'value:<'
```

---

## 3. Campos Filtráveis em Expenses

### Campos Principais

#### `date` - Data da despesa
**Tipo:** Date (YYYY-MM-DD)
**Operadores:** between, =, >=, <=, >, <

**Exemplos:**
```typescript
// Intervalo de datas
search: 'date:2026-04-01,2026-04-30'
searchFields: 'date:between'

// Data específica
search: 'date:2026-04-15'
searchFields: 'date:='

// A partir de uma data
search: 'date:2026-04-01'
searchFields: 'date:>='
```

#### `user_id` - ID do usuário
**Tipo:** Integer
**Operadores:** =, >=, <=, >, <

**Exemplos:**
```typescript
// Usuário específico
search: 'user_id:895945'
searchFields: 'user_id:='

// Múltiplos usuários (não suportado diretamente, usar múltiplas requisições)
```

#### `value` - Valor da despesa
**Tipo:** Decimal
**Operadores:** between, =, >=, <=, >, <

**Exemplos:**
```typescript
// Intervalo de valores
search: 'value:100,500'
searchFields: 'value:between'

// Valor mínimo
search: 'value:100'
searchFields: 'value:>='

// Valor máximo
search: 'value:500'
searchFields: 'value:<='
```

#### `reimbursable` - Se é reembolsável
**Tipo:** Boolean
**Operadores:** =

**Exemplos:**
```typescript
// Apenas reembolsáveis
search: 'reimbursable:true'
searchFields: 'reimbursable:='

// Apenas não reembolsáveis
search: 'reimbursable:false'
searchFields: 'reimbursable:='
```

#### `costs_center_id` - ID do centro de custo
**Tipo:** Integer
**Operadores:** =

**Exemplos:**
```typescript
search: 'costs_center_id:123'
searchFields: 'costs_center_id:='
```

#### `payment_method_id` - ID do método de pagamento
**Tipo:** Integer
**Operadores:** =

**Exemplos:**
```typescript
search: 'payment_method_id:456'
searchFields: 'payment_method_id:='
```

#### `expense_type_id` - ID do tipo de despesa
**Tipo:** Integer
**Operadores:** =

**Exemplos:**
```typescript
search: 'expense_type_id:789'
searchFields: 'expense_type_id:='
```

#### `report_id` - ID do relatório
**Tipo:** Integer
**Operadores:** =

**Exemplos:**
```typescript
search: 'report_id:7603397'
searchFields: 'report_id:='
```

### Campos Relacionados

#### `report.approval_date` - Data de aprovação do relatório
**Tipo:** Date (YYYY-MM-DD)
**Operadores:** between, =, >=, <=, >, <

**Exemplos:**
```typescript
search: 'report.approval_date:2026-04-01,2026-04-30'
searchFields: 'report.approval_date:between'
```

#### `payment_date` - Data de pagamento
**Tipo:** Date (YYYY-MM-DD)
**Operadores:** between, =, >=, <=, >, <

**Exemplos:**
```typescript
search: 'payment_date:2026-04-01'
searchFields: 'payment_date:>='
```

#### `created_at` - Data de criação
**Tipo:** Date (YYYY-MM-DD)
**Operadores:** between, =, >=, <=, >, <

**Exemplos:**
```typescript
search: 'created_at:2026-04-01,2026-04-30'
searchFields: 'created_at:between'
```

---

## 4. Combinação de Filtros

### Múltiplos Campos com AND

**Exemplo:** Despesas de um usuário em um período
```typescript
search: 'date:2026-04-01,2026-04-30;user_id:895945'
searchFields: 'date:between;user_id:='
searchJoin: 'and'
```

**Exemplo:** Despesas reembolsáveis acima de um valor
```typescript
search: 'reimbursable:true;value:100'
searchFields: 'reimbursable:=;value:>='
searchJoin: 'and'
```

### Múltiplos Campos com OR

**Exemplo:** Despesas de dois usuários diferentes
```typescript
search: 'user_id:895945;user_id:895946'
searchFields: 'user_id:=;user_id:='
searchJoin: 'or'
```

**Nota:** A API pode não suportar múltiplos valores para o mesmo campo com OR. Testar antes de usar.

### Combinação Complexa

**Exemplo:** Despesas de um usuário, em um período, reembolsáveis, acima de um valor
```typescript
search: 'date:2026-04-01,2026-04-30;user_id:895945;reimbursable:true;value:100'
searchFields: 'date:between;user_id:=;reimbursable:=;value:>='
searchJoin: 'and'
```

---

## 5. Parâmetro `include`

### Visão Geral

O parâmetro `include` permite incluir dados relacionados na resposta, evitando requisições adicionais.

### Sintaxe

```
include: campo1,campo2,campo3
```

### Valores Disponíveis para Expenses

#### `user` - Dados do usuário
**Inclui:**
- `user.data.id`
- `user.data.name`
- `user.data.cpf`
- `user.data.email`

**Exemplo:**
```typescript
include: 'user'
```

#### `costs_center` - Centro de custo
**Inclui:**
- `costs_center.data.id`
- `costs_center.data.name`

**Exemplo:**
```typescript
include: 'costs_center'
```

#### `payment_method` - Método de pagamento
**Inclui:**
- `payment_method.data.id`
- `payment_method.data.description`
- `payment_method.data.name`

**Exemplo:**
```typescript
include: 'payment_method'
```

#### `expense_type` - Tipo de despesa
**Inclui:**
- `expense_type.data.id`
- `expense_type.data.name`

**Exemplo:**
```typescript
include: 'expense_type'
```

#### `report` - Relatório
**Inclui:**
- `report.data.id`
- `report.data.description`
- `report.data.status`

**Exemplo:**
```typescript
include: 'report'
```

#### `apportionment` - Rateio
**Inclui:**
- `apportionment.data[]` - Array de rateios

**Exemplo:**
```typescript
include: 'apportionment'
```

#### `gps` - Dados GPS
**Inclui:**
- `gps.data.latitude`
- `gps.data.longitude`
- `gps.data.accuracy`

**Exemplo:**
```typescript
include: 'gps'
```

#### `fueling` - Dados de abastecimento
**Inclui:**
- `fueling.data.liters`
- `fueling.data.price_per_liter`

**Exemplo:**
```typescript
include: 'fueling'
```

### Múltiplos Includes

**Exemplo:**
```typescript
include: 'user,costs_center,payment_method,expense_type'
```

### Includes Aninhados

**Exemplo:** Incluir rateio com detalhes
```typescript
include: 'apportionment,apportionment.costs_center'
```

**Nota:** Verificar documentação da API para suporte a includes aninhados.

---

## 6. Paginação

### Parâmetros

#### `paginate` - Habilitar paginação
**Tipo:** Boolean
**Valores:** true, false

**Exemplo:**
```typescript
paginate: 'true'
```

#### `page` - Número da página
**Tipo:** Integer
**Default:** 1

**Exemplo:**
```typescript
page: '2'
```

#### `per_page` - Itens por página
**Tipo:** Integer
**Default:** 100
**Máximo:** 200 (recomendado)

**Exemplo:**
```typescript
per_page: '200'
```

### Estratégia de Paginação

**Exemplo Completo:**
```typescript
const params = new URLSearchParams();
params.append('search', 'date:2026-04-01,2026-04-30');
params.append('searchFields', 'date:between');
params.append('include', 'user,costs_center');
params.append('paginate', 'true');
params.append('page', '1');
params.append('per_page', '200');

const response = await fetch(`${API_URL}/v2/expenses?${params.toString()}`);
const data = await response.json();

// Verificar se há mais páginas
if (data.meta && data.meta.last_page > 1) {
  // Buscar páginas subsequentes
  for (let page = 2; page <= data.meta.last_page; page++) {
    params.set('page', String(page));
    const pageResponse = await fetch(`${API_URL}/v2/expenses?${params.toString()}`);
    const pageData = await pageResponse.json();
    // Processar página
  }
}
```

### Desabilitar Paginação

**Exemplo:**
```typescript
const params = new URLSearchParams();
params.append('search', 'date:2026-04-01,2026-04-30');
params.append('searchFields', 'date:between');
params.append('paginate', 'false');

const response = await fetch(`${API_URL}/v2/expenses?${params.toString()}`);
```

**Nota:** `paginate=false` pode retornar todos os registros, mas pode ser lento para grandes volumes.

---

## 7. Filtros para Reports

### Campos Filtráveis

#### `status` - Status do relatório
**Valores comuns:**
- `APPROVED` - Aprovado
- `PENDING` - Pendente
- `REPROVED` - Reprovado
- `CANCELLED` - Cancelado

**Exemplo:**
```typescript
const params = new URLSearchParams();
params.append('status', 'APPROVED');
params.append('include', 'user');

const response = await fetch(`${API_URL}/v2/reports?${params.toString()}`);
```

#### `user_id` - ID do usuário
**Exemplo:**
```typescript
const params = new URLSearchParams();
params.append('search', 'user_id:895945');
params.append('searchFields', 'user_id:=');
params.append('include', 'user');

const response = await fetch(`${API_URL}/v2/reports?${params.toString()}`);
```

### Includes para Reports

#### `expenses` - Despesas do relatório
**Exemplo:**
```typescript
include: 'expenses'
```

#### `expenses.apportionment` - Rateio das despesas
**Exemplo:**
```typescript
include: 'expenses.apportionment'
```

#### `expenses.expense_type` - Tipo das despesas
**Exemplo:**
```typescript
include: 'expenses.expense_type'
```

#### `expenses.costs_center` - Centro de custo das despesas
**Exemplo:**
```typescript
include: 'expenses.costs_center'
```

#### `user` - Dados do usuário
**Exemplo:**
```typescript
include: 'user'
```

#### `payment_method` - Método de pagamento
**Exemplo:**
```typescript
include: 'payment_method'
```

#### `advance` - Adiantamentos
**Exemplo:**
```typescript
include: 'advance'
```

#### `approval` - Aprovações
**Exemplo:**
```typescript
include: 'approval'
```

#### `invoice` - Faturas
**Exemplo:**
```typescript
include: 'invoice'
```

#### `history` - Histórico
**Exemplo:**
```typescript
include: 'history'
```

---

## 8. Filtros para Team Members

### Parâmetros

#### `include` - Campos relacionados
**Valores:**
- `costsCenters` - Centros de custo
- `projects` - Projetos

**Exemplo:**
```typescript
const params = new URLSearchParams();
params.append('include', 'costsCenters,projects');
params.append('paginate', 'false');
params.append('per_page', '1000');

const response = await fetch(`${API_URL}/v2/team-members?${params.toString()}`);
```

#### `active` - Status do usuário
**Exemplo:**
```typescript
const params = new URLSearchParams();
params.append('search', 'active:true');
params.append('searchFields', 'active:=');

const response = await fetch(`${API_URL}/v2/team-members?${params.toString()}`);
```

**Nota:** Verificar documentação para confirmar suporte a filtro por `active`.

---

## 9. Estratégias de Busca Comuns

### Buscar Despesas de uma Quinzena

**1ª Quinzena (Dia 1-15):**
```typescript
const year = 2026;
const month = 4;
const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
const endDate = `${year}-${String(month).padStart(2, '0')}-15`;

const params = new URLSearchParams();
params.append('search', `date:${startDate},${endDate}`);
params.append('searchFields', 'date:between');
params.append('include', 'user,costs_center,payment_method');
params.append('paginate', 'true');
params.append('page', '1');
params.append('per_page', '200');
```

**2ª Quinzena (Dia 16-último):**
```typescript
const year = 2026;
const month = 4;
const lastDay = new Date(year, month, 0).getDate();
const startDate = `${year}-${String(month).padStart(2, '0')}-16`;
const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

const params = new URLSearchParams();
params.append('search', `date:${startDate},${endDate}`);
params.append('searchFields', 'date:between');
params.append('include', 'user,costs_center,payment_method');
params.append('paginate', 'true');
params.append('page', '1');
params.append('per_page', '200');
```

### Buscar Despesas por Mês

```typescript
const year = 2026;
const month = 4;
const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
const lastDay = new Date(year, month, 0).getDate();
const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

const params = new URLSearchParams();
params.append('search', `date:${startDate},${endDate}`);
params.append('searchFields', 'date:between');
params.append('include', 'user,costs_center,payment_method');
params.append('paginate', 'true');
params.append('page', '1');
params.append('per_page', '200');
```

### Buscar Despesas por Usuário

```typescript
const userId = 895945;

const params = new URLSearchParams();
params.append('search', `user_id:${userId}`);
params.append('searchFields', 'user_id:=');
params.append('include', 'user,costs_center,payment_method');
params.append('paginate', 'true');
params.append('page', '1');
params.append('per_page', '200');
```

### Buscar Despesas Reembolsáveis

```typescript
const params = new URLSearchParams();
params.append('search', 'reimbursable:true');
params.append('searchFields', 'reimbursable:=');
params.append('include', 'user,costs_center');
params.append('paginate', 'true');
params.append('page', '1');
params.append('per_page', '200');
```

### Buscar Despesas por Método de Pagamento

```typescript
const paymentMethodId = 456; // ID do "Cartão Corporativo Itaú"

const params = new URLSearchParams();
params.append('search', `payment_method_id:${paymentMethodId}`);
params.append('searchFields', 'payment_method_id:=');
params.append('include', 'user,costs_center,payment_method');
params.append('paginate', 'true');
params.append('page', '1');
params.append('per_page', '200');
```

### Buscar Despesas por Centro de Custo

```typescript
const costCenterId = 123;

const params = new URLSearchParams();
params.append('search', `costs_center_id:${costCenterId}`);
params.append('searchFields', 'costs_center_id:=');
params.append('include', 'user,costs_center');
params.append('paginate', 'true');
params.append('page', '1');
params.append('per_page', '200');
```

### Buscar Relatórios Aprovados

```typescript
const params = new URLSearchParams();
params.append('status', 'APPROVED');
params.append('include', 'user');

const response = await fetch(`${API_URL}/v2/reports?${params.toString()}`);
```

### Buscar Relatórios de um Usuário

```typescript
const userId = 895945;

const params = new URLSearchParams();
params.append('search', `user_id:${userId}`);
params.append('searchFields', 'user_id:=');
params.append('include', 'user');

const response = await fetch(`${API_URL}/v2/reports?${params.toString()}`);
```

---

## 10. Otimização de Requisições

### Usar Includes Estrategicamente

**Ruim (múltiplas requisições):**
```typescript
// Requisição 1: Buscar expenses
const expenses = await fetch('/api/vexpenses/expenses?search=date:2026-04-01,2026-04-30&searchFields=date:between');

// Requisição 2: Buscar users para cada expense
for (const expense of expenses.data) {
  const user = await fetch(`/api/vexpenses/team-members/${expense.user_id}`);
}
```

**Bom (uma requisição com include):**
```typescript
const expenses = await fetch('/api/vexpenses/expenses?search=date:2026-04-01,2026-04-30&searchFields=date:between&include=user,costs_center,payment_method');
```

### Paginação Eficiente

**Ruim (per_page muito alto):**
```typescript
params.append('per_page', '1000'); // Pode causar timeout
```

**Bom (per_page razoável com paginação):**
```typescript
params.append('per_page', '200');
// Buscar páginas subsequentes conforme necessário
```

### Cache Agressivo

**Dados estáticos:**
```typescript
// Costs centers - mudam raramente
// Cache: 6 horas
await fetch('/api/vexpenses/costs-centers');

// Expenses type - mudam muito raramente
// Cache: 15 minutos
await fetch('/api/vexpenses/expenses-type');

// Team members - mudam ocasionalmente
// Cache: 10 minutos
await fetch('/api/vexpenses/team-members');
```

**Dados dinâmicos:**
```typescript
// Expenses - mudam frequentemente
// Cache: TTL automático (mais curto)
await fetch('/api/vexpenses/expenses?search=date:2026-04-01,2026-04-30&searchFields=date:between');

// Reports - mudam frequentemente
// Cache: TTL automático (mais curto)
await fetch('/api/vexpenses/reports');
```

### Stale-While-Revalidate

```typescript
// Retornar dados stale imediatamente
// Atualizar em background
const staleResult = await apiCache.getWithStale(cacheKey);

if (staleResult.data) {
  return NextResponse.json(staleResult.data); // Resposta imediata
  
  if (staleResult.shouldRefresh) {
    refreshCacheInBackground(cacheKey); // Background refresh
  }
}
```

---

## 11. Tratamento de Erros em Filtros

### Erro 422 - Filter Fields Required

**Causa:** Endpoint `/v2/expenses` requer filtros obrigatórios

**Solução:** Sempre fornecer `search` e `searchFields`

**Exemplo:**
```typescript
// Errado - vai causar 422
const response = await fetch(`${API_URL}/v2/expenses`);

// Correto
const params = new URLSearchParams();
params.append('search', 'date:2026-04-01,2026-04-30');
params.append('searchFields', 'date:between');
const response = await fetch(`${API_URL}/v2/expenses?${params.toString()}`);
```

### Erro 400 - Bad Request

**Causa:** Parâmetros inválidos

**Solução:** Verificar sintaxe dos parâmetros

**Exemplo:**
```typescript
// Errado - sintaxe incorreta
search: 'date:2026-04-01' // between requer 2 valores
searchFields: 'date:between'

// Correto
search: 'date:2026-04-01,2026-04-30'
searchFields: 'date:between'
```

### Timeout

**Causa:** Requisição demorou demais

**Solução:** Aumentar timeout ou otimizar filtros

**Exemplo:**
```typescript
// Aumentar timeout
signal: AbortSignal.timeout(300000) // 5 minutos

// Otimizar filtros
// Reduzir período de busca
// Reduzir per_page
// Usar includes mais específicos
```

---

## 12. Exemplos Práticos

### Exemplo 1: Dashboard Financeiro

**Requisito:** Buscar todas as despesas de abril/2026 com detalhes completos

```typescript
async function getExpensesAbril2026() {
  const params = new URLSearchParams();
  params.append('search', 'date:2026-04-01,2026-04-30');
  params.append('searchFields', 'date:between');
  params.append('include', 'user,costs_center,payment_method,expense_type');
  params.append('paginate', 'true');
  params.append('page', '1');
  params.append('per_page', '200');

  const response = await fetch(`${API_URL}/v2/expenses?${params.toString()}`, {
    headers: {
      'Authorization': API_KEY,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(300000),
  });

  const data = await response.json();
  const allExpenses = [...data.data];

  // Buscar páginas subsequentes
  if (data.meta && data.meta.last_page > 1) {
    for (let page = 2; page <= data.meta.last_page; page++) {
      params.set('page', String(page));
      const pageResponse = await fetch(`${API_URL}/v2/expenses?${params.toString()}`, {
        headers: {
          'Authorization': API_KEY,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(300000),
      });
      const pageData = await pageResponse.json();
      allExpenses.push(...pageData.data);
    }
  }

  return allExpenses;
}
```

### Exemplo 2: Despesas por Usuário e Período

**Requisito:** Buscar despesas de um usuário específico em uma quinzena

```typescript
async function getExpensesUsuarioQuinzena(userId: number, year: number, month: number, quinzena: number) {
  const dayStart = quinzena === 1 ? 1 : 16;
  const dayEnd = quinzena === 1 ? 15 : new Date(year, month, 0).getDate();
  const startDate = `${year}-${String(month).padStart(2, '0')}-${String(dayStart).padStart(2, '0')}`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(dayEnd).padStart(2, '0')}`;

  const params = new URLSearchParams();
  params.append('search', `date:${startDate},${endDate};user_id:${userId}`);
  params.append('searchFields', 'date:between;user_id:=');
  params.append('searchJoin', 'and');
  params.append('include', 'user,costs_center,payment_method');
  params.append('paginate', 'false');

  const response = await fetch(`${API_URL}/v2/expenses?${params.toString()}`, {
    headers: {
      'Authorization': API_KEY,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(120000),
  });

  const data = await response.json();
  return data.data || [];
}
```

### Exemplo 3: Relatórios Aprovados Recentes

**Requisito:** Buscar relatórios aprovados nos últimos 30 dias

```typescript
async function getRelatoriosAprovadosRecentes() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  const params = new URLSearchParams();
  params.append('search', `approval_date:${startDateStr},${endDateStr};status:APPROVED`);
  params.append('searchFields', 'approval_date:between;status:=');
  params.append('searchJoin', 'and');
  params.append('include', 'user');
  params.append('paginate', 'false');

  const response = await fetch(`${API_URL}/v2/reports?${params.toString()}`, {
    headers: {
      'Authorization': API_KEY,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(300000),
  });

  const data = await response.json();
  return data.data || [];
}
```

### Exemplo 4: Análise por Centro de Custo

**Requisito:** Buscar despesas agrupadas por centro de custo

```typescript
async function getExpensesPorCentroCusto(startDate: string, endDate: string) {
  const params = new URLSearchParams();
  params.append('search', `date:${startDate},${endDate}`);
  params.append('searchFields', 'date:between');
  params.append('include', 'costs_center,user');
  params.append('paginate', 'true');
  params.append('page', '1');
  params.append('per_page', '200');

  const response = await fetch(`${API_URL}/v2/expenses?${params.toString()}`, {
    headers: {
      'Authorization': API_KEY,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(300000),
  });

  const data = await response.json();
  const expenses = data.data || [];

  // Agrupar por centro de custo
  const porCentroCusto = expenses.reduce((acc, expense) => {
    const centroCusto = expense.costs_center?.data?.name || 'Sem Centro de Custo';
    if (!acc[centroCusto]) {
      acc[centroCusto] = [];
    }
    acc[centroCusto].push(expense);
    return acc;
  }, {});

  return porCentroCusto;
}
```

---

## 13. Boas Práticas

1. **Sempre fornecer filtros em `/v2/expenses`**
   - Endpoint requer `search` e `searchFields`
   - Sem filtros, retorna erro 422

2. **Usar includes para evitar requisições adicionais**
   - Incluir dados relacionados na mesma requisição
   - Reduzir número de chamadas à API

3. **Paginação para grandes volumes**
   - Usar `per_page=200` como máximo
   - Buscar páginas subsequentes conforme necessário

4. **Cache agressivo para dados estáticos**
   - Costs centers: 6 horas
   - Expenses type: 15 minutos
   - Team members: 10 minutos

5. **Stale-while-revalidate para performance**
   - Retornar dados stale imediatamente
   - Atualizar em background

6. **Tratamento de erros graceful**
   - Timeout: 504
   - Unauthorized: 401
   - Filter required: 422

7. **Otimizar filtros**
   - Usar períodos menores quando possível
   - Evitar filtros muito complexos
   - Usar índices (user_id, costs_center_id) quando disponível

8. **Monitorar performance**
   - Logar tempo de requisições
   - Identificar endpoints lentos
   - Ajustar timeouts conforme necessário

---

## Conclusão

O sistema de filtros da API VExpenses é poderoso e flexível, permitindo:

**✅ Funcionalidades:**
- Filtros por múltiplos campos
- Operadores de comparação variados
- Combinação de filtros com AND/OR
- Includes de dados relacionados
- Paginação eficiente

**🔧 Estratégias:**
- Uso estratégico de includes
- Cache agressivo para dados estáticos
- Stale-while-revalidate para performance
- Tratamento graceful de erros

**📊 Melhores Práticas:**
- Sempre fornecer filtros obrigatórios
- Usar paginação para grandes volumes
- Otimizar requisições com includes
- Monitorar performance e ajustar timeouts
