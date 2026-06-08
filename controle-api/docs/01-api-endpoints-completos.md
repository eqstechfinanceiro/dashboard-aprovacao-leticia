# Documentação Completa da API VExpenses v2

## Configuração Base

**Base URL:** `https://api.vexpenses.com/v2`

**Autenticação:** Header `Authorization` com a API key

```typescript
headers = {
  "Authorization": "SUA_API_KEY",
  "Content-Type": "application/json",
  "Accept": "application/json"
}
```

**Variáveis de Ambiente:**
- `NEXT_PUBLIC_API_URL`: URL base da API (default: `https://api.vexpenses.com`)
- `VEXPENSES_API_KEY`: Chave de autenticação da API

---

## Endpoints Principais

### 1. Team Members (`/v2/team-members`)

**Método:** GET

**Descrição:** Retorna lista de membros da equipe (usuários)

**Parâmetros de Query:**
- `paginate` (boolean): Indica se a resposta deve ser paginada
- `per_page` (integer): Número de elementos por página (default: 100)
- `page` (integer): Número da página (default: 1)
- `include` (string): Flag para retornar objetos relacionados (costsCenters, projects)

**Exemplo de Requisição:**
```typescript
const response = await fetch(`${API_URL}/v2/team-members?paginate=false&per_page=1000&include=costsCenters`, {
  headers: {
    'Authorization': API_KEY,
    'Accept': 'application/json',
  },
  signal: AbortSignal.timeout(60000),
});
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
    {
      "id": 890792,
      "integration_id": null,
      "external_id": null,
      "company_id": 1825947,
      "role_id": null,
      "approval_flow_id": 174405,
      "expense_limit_policy_id": 16805,
      "user_type": "ADMINISTRADOR",
      "name": "Nome do Usuário",
      "email": "usuario@empresa.com.br",
      "cpf": "12345678900",
      "phone1": null,
      "phone2": null,
      "birth_date": null,
      "bank": null,
      "agency": null,
      "account": null,
      "pix_key": null,
      "confirmed": false,
      "active": true,
      "parameters": null,
      "created_at": "2025-04-07 10:34:58",
      "updated_at": "2025-10-09 13:53:18",
      "costsCenters": {
        "data": [
          {
            "id": 123,
            "name": "Nome do Centro de Custo"
          }
        ]
      }
    }
  ]
}
```

**Campos Importantes:**
- `id`: ID único do usuário
- `name`: Nome do colaborador
- `email`: Email do usuário
- `cpf`: CPF do usuário
- `active`: Status do usuário (true=ativo, false=inativo)
- `user_type`: Tipo de usuário (ADMINISTRADOR, COLABORADOR, etc)
- `approval_flow_id`: ID do fluxo de aprovação
- `expense_limit_policy_id`: ID da política de limite de despesas
- `costsCenters`: Array de centros de custo associados

**Timeout:** 60 segundos

**Cache:** 10 minutos (dados de membros mudam menos frequentemente)

---

### 2. Expenses (`/v2/expenses`)

**Método:** GET

**Descrição:** Retorna lista de despesas com filtros avançados

**Parâmetros de Query:**
- `search` (string): Critérios de busca (OBRIGATÓRIO)
- `searchFields` (string): Operadores de busca (OBRIGATÓRIO)
- `searchJoin` (string): Operador lógico (and/or, default: and)
- `include` (string): Campos relacionados separados por vírgula
- `paginate` (boolean): Indica se deve paginar
- `page` (integer): Número da página (default: 1)
- `per_page` (integer): Itens por página (default: 100)

**Valores de `include`:**
- `user`: Dados do usuário
- `costs_center`: Centro de custo
- `payment_method`: Método de pagamento
- `expense_type`: Tipo de despesa
- `report`: Relatório associado
- `apportionment`: Rateio
- `gps`: Dados GPS
- `fueling`: Dados de abastecimento

**Operadores de `searchFields`:**
- `between`: Intervalo (requer 2 valores separados por vírgula)
- `=`: Igual
- `>=`: Maior ou igual
- `<=`: Menor ou igual
- `>`: Maior
- `<`: Menor

**Exemplos de `search` e `searchFields`:**

**Filtro por período de data:**
```typescript
const params = new URLSearchParams();
params.append('search', 'date:2026-04-01,2026-04-30');
params.append('searchFields', 'date:between');
params.append('searchJoin', 'and');
params.append('include', 'user,costs_center,payment_method');
params.append('paginate', 'true');
params.append('page', '1');
params.append('per_page', '200');
```

**Filtro por usuário:**
```typescript
params.append('search', 'user_id:895945');
params.append('searchFields', 'user_id:=');
```

**Filtro por reembolsável:**
```typescript
params.append('search', 'reimbursable:true');
params.append('searchFields', 'reimbursable:=');
```

**Filtros combinados:**
```typescript
params.append('search', 'date:2026-04-01,2026-04-30;user_id:895945;reimbursable:true');
params.append('searchFields', 'date:between;user_id:=;reimbursable:=');
params.append('searchJoin', 'and');
```

**Exemplo de Requisição Completa:**
```typescript
const response = await fetch(`${API_URL}/v2/expenses?${params.toString()}`, {
  headers: {
    'Authorization': API_KEY,
    'Accept': 'application/json',
  },
  signal: AbortSignal.timeout(300000), // 5 minutos
});
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
    {
      "id": 1234567,
      "user_id": 895945,
      "value": 150.50,
      "date": "2026-04-15",
      "title": "Despesa de exemplo",
      "observation": "Observação da despesa",
      "reimbursable": false,
      "external_id": null,
      "expense_type_id": 123,
      "payment_method_id": 456,
      "costs_center_id": 789,
      "report_id": null,
      "user": {
        "data": {
          "id": 895945,
          "name": "Nome do Usuário",
          "cpf": "12345678900"
        }
      },
      "costs_center": {
        "data": {
          "id": 789,
          "name": "Centro de Custo"
        }
      },
      "payment_method": {
        "data": {
          "id": 456,
          "description": "Cartão Corporativo Itaú"
        }
      },
      "expense_type": {
        "data": {
          "id": 123,
          "name": "Alimentação"
        }
      }
    }
  ],
  "meta": {
    "current_page": 1,
    "last_page": 5,
    "per_page": 200,
    "total": 1000
  }
}
```

**Campos Importantes:**
- `id`: ID da despesa
- `user_id`: ID do usuário
- `value`: Valor da despesa
- `date`: Data da despesa (YYYY-MM-DD)
- `title`: Título/descrição
- `observation`: Observação
- `reimbursable`: Se é reembolsável
- `payment_method`: Método de pagamento
- `costs_center`: Centro de custo
- `expense_type`: Tipo de despesa

**Timeout:** 5 minutos (endpoint pode ser lento)

**Cache:** TTL automático baseado no tipo de dado

**Paginação:**
- Quando `total > per_page`, buscar páginas subsequentes
- Usar `meta.last_page` para saber total de páginas

---

### 3. Reports (`/v2/reports`)

**Método:** GET

**Descrição:** Retorna lista de relatórios de despesas

**Parâmetros de Query:**
- `include` (string): Campos relacionados (default: user)
- `status` (string): Filtrar por status (APPROVED, PENDING, etc)
- `paginate` (boolean): Paginação
- `page` (integer): Número da página
- `per_page` (integer): Itens por página

**Valores de `include`:**
- `expenses`: Despesas do relatório
- `expenses.apportionment`: Rateio das despesas
- `expenses.expense_type`: Tipo das despesas
- `expenses.gps`: GPS das despesas
- `expenses.costs_center`: Centro de custo das despesas
- `user`: Dados do usuário
- `payment_method`: Método de pagamento
- `advance`: Adiantamentos
- `approval`: Aprovações
- `invoice`: Faturas
- `history`: Histórico

**Exemplo de Requisição:**
```typescript
const params = new URLSearchParams();
params.append('include', 'user');
params.append('status', 'APPROVED');
params.append('paginate', 'false');

const response = await fetch(`${API_URL}/v2/reports?${params.toString()}`, {
  headers: {
    'Authorization': API_KEY,
    'Accept': 'application/json',
  },
  signal: AbortSignal.timeout(300000), // 5 minutos (reports é muito lento)
});
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
    {
      "id": 7603397,
      "external_id": null,
      "user_id": 895944,
      "device_id": null,
      "description": "CAIXA 06/2025",
      "status": "APROVADO",
      "approval_stage_id": 15492965,
      "approval_user_id": null,
      "approval_date": "2026-01-22 08:37:53",
      "payment_date": null,
      "payment_method_id": 627721,
      "observation": "Despesas referentes a segunda quinzena de Maio",
      "paying_company_id": 1861279,
      "on": true,
      "justification": "Despesas de meses diferentes no mesmo relatório",
      "pdf_link": "https://...",
      "excel_link": "https://...",
      "created_at": "2025-12-01 10:00:00",
      "updated_at": "2026-01-22 08:37:53",
      "user": {
        "data": {
          "id": 895944,
          "name": "Nome do Usuário",
          "cpf": "12345678900"
        }
      }
    }
  ]
}
```

**Campos Importantes:**
- `id`: ID do relatório
- `user_id`: ID do usuário dono do relatório
- `description`: Descrição do relatório
- `status`: Status (APROVADO, PENDENTE, REPROVADO, etc)
- `approval_date`: Data de aprovação
- `payment_date`: Data de pagamento
- `pdf_link`: Link para PDF
- `excel_link`: Link para Excel

**Timeout:** 5 minutos (endpoint é muito lento)

**Cache:** TTL automático

---

### 4. Report Detail (`/v2/reports/{id}`)

**Método:** GET

**Descrição:** Retorna detalhes de um relatório específico

**Parâmetros de Path:**
- `id` (integer): ID do relatório

**Parâmetros de Query:**
- `include` (string): Campos relacionados (default: expenses)

**Exemplo de Requisição:**
```typescript
const response = await fetch(`${API_URL}/v2/reports/7603397?include=expenses`, {
  headers: {
    'Authorization': API_KEY,
    'Accept': 'application/json',
  },
});
```

**Resposta (200):**
```json
{
  "request": "https://api.vexpenses.com/v2/reports/7603397",
  "method": "GET",
  "success": true,
  "code": 200,
  "message": "Report successfully sent!",
  "data": {
    "id": 7603397,
    "user_id": 895944,
    "description": "CAIXA 06/2025",
    "status": "APROVADO",
    // ... mesmos campos do endpoint /reports
    "expenses": {
      "data": [
        // Array de despesas do relatório
      ]
    }
  }
}
```

**Nota:** Endpoint `/v2/reports/{id}/expenses` não existe (404). Use `include=expenses`.

---

### 5. Costs Centers (`/v2/costs-centers`)

**Método:** GET

**Descrição:** Retorna lista de centros de custo

**Parâmetros de Query:**
- Nenhum parâmetro obrigatório

**Exemplo de Requisição:**
```typescript
const response = await fetch(`${API_URL}/v2/costs-centers`, {
  headers: {
    'Authorization': API_KEY,
    'Accept': 'application/json',
  },
  signal: AbortSignal.timeout(120000), // 2 minutos
});
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
    {
      "id": 123,
      "name": "Nome do Centro de Custo",
      "integration_id": null,
      "approval_flow_id": 174405
    }
  ]
}
```

**Timeout:** 2 minutos

**Cache:** 6 horas (dados mudam muito raramente)

---

### 6. Expenses Type (`/v2/expenses-type`)

**Método:** GET

**Descrição:** Retorna lista de tipos de despesas

**Parâmetros de Query:**
- Nenhum parâmetro obrigatório

**Exemplo de Requisição:**
```typescript
const response = await fetch(`${API_URL}/v2/expenses-type`, {
  headers: {
    'Authorization': API_KEY,
    'Accept': 'application/json',
  },
  signal: AbortSignal.timeout(120000), // 2 minutos
});
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
    {
      "id": 123,
      "name": "Alimentação",
      "active": true
    }
  ]
}
```

**Timeout:** 2 minutos

**Cache:** 15 minutos (tipos de despesa mudam muito raramente)

---

### 7. Projects (`/v2/projects`)

**Método:** GET

**Descrição:** Retorna lista de projetos

**Parâmetros de Query:**
- `paginate` (boolean): Paginação
- `per_page` (integer): Itens por página
- `page` (integer): Número da página

**Exemplo de Requisição:**
```typescript
const response = await fetch(`${API_URL}/v2/projects?paginate=false&per_page=100`, {
  headers: {
    'Authorization': API_KEY,
    'Accept': 'application/json',
  },
});
```

**Resposta (200):**
```json
{
  "request": "https://api.vexpenses.com/v2/projects",
  "method": "GET",
  "success": true,
  "code": 200,
  "message": "Projects successfully sent!",
  "data": [
    {
      "id": 1825949,
      "name": "Projeto 1",
      "company_name": null,
      "cnpj": null,
      "address": null,
      "neighborhood": null,
      "city": null,
      "state": null,
      "zip_code": null,
      "phone1": null,
      "phone2": null,
      "on": false,
      "integration_id": null
    }
  ]
}
```

---

### 8. Approval Flows (`/v2/approval-flows`)

**Método:** GET

**Descrição:** Retorna lista de fluxos de aprovação

**Parâmetros de Query:**
- `paginate` (boolean): Paginação
- `per_page` (integer): Itens por página
- `page` (integer): Número da página

**Exemplo de Requisição:**
```typescript
const response = await fetch(`${API_URL}/v2/approval-flows?paginate=false&per_page=100`, {
  headers: {
    'Authorization': API_KEY,
    'Accept': 'application/json',
  },
});
```

**Resposta (200):**
```json
{
  "request": "https://api.vexpenses.com/v2/approval-flows",
  "method": "GET",
  "success": true,
  "code": 200,
  "message": "Approval flows successfully sent!",
  "data": [
    {
      "id": 172530,
      "external_id": null,
      "company_id": 1825947,
      "description": "REGIONAL CO",
      "use_automatic_approver": false,
      "steps": [
        {
          "operator": "E",
          "entrance_value": null,
          "order": 1,
          "groups": [
            {
              "operator": "OU",
              "approvers": [891980, 891977, 946419, 891979, 891904, 896335]
            }
          ]
        }
      ]
    }
  ]
}
```

---

## Endpoints POST

### POST Expenses (`/v2/expenses`)

**Método:** POST

**Descrição:** Insere uma nova despesa

**Parâmetros de Query:**
- `include` (string): apportionment (default)

**Body (Obrigatório):**
```json
{
  "user_id": 1234,
  "external_id": "uuid-externo",
  "date": "2026-04-15",
  "paying_company_id": 5678,
  "value": 150.50,
  "title": "Despesa de exemplo"
}
```

**Resposta (200):**
```json
{
  "request": "https://api.vexpenses.com/v2/expenses",
  "method": "POST",
  "success": true,
  "code": 200,
  "message": "Expenses successfully created!",
  "data": [
    {
      // Dados da despesa criada
    }
  ]
}
```

---

### POST Reports (`/v2/reports`)

**Método:** POST

**Descrição:** Insere um novo relatório

**Body (Obrigatório):**
```json
{
  "user_id": 1234,
  "external_id": "uuid-externo",
  "description": "Descrição do relatório",
  "payment_method_id": 5678
}
```

**Resposta (200):**
```json
{
  "request": "https://api.vexpenses.com/v2/reports",
  "method": "POST",
  "success": true,
  "code": 200,
  "message": "Reports successfully created!",
  "data": {
    // Dados do relatório criado
  }
}
```

---

## Endpoints NÃO Disponíveis

### ❌ `/v2/cards`
- **Erro:** 405 - GET method not supported
- **Status:** Não é possível obter dados de cartões via API

### ❌ `/v2/wallets`
- **Erro:** 405 - GET method not supported
- **Status:** Não é possível obter dados de carteiras via API

### ❌ `/v2/balances`
- **Erro:** 405 - GET method not supported
- **Status:** Não é possível obter saldos via API

### ❌ `/v2/transfers`
- **Erro:** 405 - GET method not supported
- **Status:** Não é possível obter transferências via API

### ❌ `/v2/payments`
- **Erro:** 405 - GET method not supported
- **Status:** Não é possível obter pagamentos via API

### ❌ `/v2/expense-limit-policies`
- **Erro:** 405 - GET method not supported
- **Status:** Não é possível obter políticas de limite via API

### ❌ `/v2/team-members/{id}/cards`
- **Erro:** 404 - URL not found
- **Status:** Endpoint não existe

### ❌ `/v2/team-members/{id}/parameters`
- **Erro:** 404 - URL not found
- **Status:** Endpoint não existe

---

## Estratégias de Cache

A aplicação usa um sistema de cache com stale-while-revalidate para melhorar performance:

### Cache Keys
- `expenses:{include}:{search}:{page}:{perPage}`
- `reports:{include}`
- `team-members:{include}`
- `costs-centers`
- `expenses-type`

### TTLs (Time To Live)
- **Costs Centers:** 6 horas
- **Expenses Type:** 15 minutos
- **Team Members:** 10 minutos
- **Reports:** Automático baseado no tipo de dado
- **Expenses:** Automático baseado no tipo de dado

### Stale-While-Revalidate
- Dados stale são retornados imediatamente
- Refresh acontece em background
- Melhora experiência do usuário

---

## Métodos de Pagamento Disponíveis

Baseado em análise de dados:
- **Saque VExpenses:** Saques em dinheiro
- **Cartão Corporativo Itaú:** Cartão corporativo Itaú
- **Cartão VExpenses:** Cartão VExpenses
- **Pix VExpenses:** Transferências PIX
- **Recurso Próprio:** Pagamentos com recurso próprio
- **Tarifa de Saque:** Tarifas bancárias

---

## Filtros Avançados para Expenses

### Filtro por Data
```typescript
search: 'date:2026-04-01,2026-04-30'
searchFields: 'date:between'
```

### Filtro por Usuário
```typescript
search: 'user_id:895945'
searchFields: 'user_id:='
```

### Filtro por Reembolsável
```typescript
search: 'reimbursable:true'
searchFields: 'reimbursable:='
```

### Filtro por Centro de Custo
```typescript
search: 'costs_center_id:123'
searchFields: 'costs_center_id:='
```

### Filtro por Método de Pagamento
```typescript
search: 'payment_method_id:456'
searchFields: 'payment_method_id:='
```

### Filtros Combinados
```typescript
search: 'date:2026-04-01,2026-04-30;user_id:895945;reimbursable:true'
searchFields: 'date:between;user_id:=;reembolsavel:='
searchJoin: 'and'
```

---

## Cálculos Financeiros

### Quinzenas
Para calcular dados por quinzena:

**1ª Quinzena:** Dia 1 a 15
```typescript
const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
const endDate = `${year}-${String(month).padStart(2, '0')}-15`;
```

**2ª Quinzena:** Dia 16 ao último dia do mês
```typescript
const lastDay = new Date(year, month, 0).getDate();
const startDate = `${year}-${String(month).padStart(2, '0')}-16`;
const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
```

### Cálculos Disponíveis via API
- **Total de despesas por período:** Soma de `expenses` filtrado por data
- **Despesas por payment_method:** Filtro em `expenses`
- **Despesas por usuário:** Filtro `user_id` em `expenses`
- **Despesas reembolsáveis:** Filtro `reimbursable:true` em `expenses`

### Limitações
- **Saldos de cartão:** Não disponíveis via API
- **Cargas/transferências:** Não registradas como expenses
- **Limites de cartão:** Não disponíveis via API
- **Status do cartão:** Não disponível via API

---

## Tratamento de Erros

### Timeout
```typescript
if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
  return NextResponse.json(
    { error: 'API timeout - A requisição demorou muito tempo. Tente novamente.' },
    { status: 504 }
  );
}
```

### Unauthorized
```typescript
if (response.status === 401) {
  return NextResponse.json(
    { error: 'Não autorizado - Verifique sua API_KEY' },
    { status: 401 }
  );
}
```

### Filter Fields Required
```typescript
if (response.status === 422) {
  return NextResponse.json(
    { error: 'Filtros são obrigatórios para este endpoint' },
    { status: 422 }
  );
}
```

---

## Boas Práticas

1. **Sempre usar filtros em `/v2/expenses`**
   - O endpoint requer `search` e `searchFields`
   - Sem filtros, retorna erro 422

2. **Usar paginação para grandes volumes**
   - `paginate=true` com `per_page=200`
   - Verificar `meta.last_page` para buscar todas as páginas

3. **Implementar retry para timeouts**
   - Endpoints como `reports` podem demorar muito
   - Usar timeout de 5 minutos

4. **Cache agressivo para dados estáticos**
   - Costs centers: 6 horas
   - Expenses type: 15 minutos
   - Team members: 10 minutos

5. **Stale-while-revalidate para melhor performance**
   - Retornar dados stale imediatamente
   - Atualizar em background

6. **Tratar erros gracefulmente**
   - Timeouts: 504
   - Unauthorized: 401
   - Filter required: 422

---

## Exemplos de Uso

### Buscar todas as despesas de um usuário em um período
```typescript
const params = new URLSearchParams();
params.append('search', `date:2026-04-01,2026-04-30;user_id:895945`);
params.append('searchFields', 'date:between;user_id:=');
params.append('searchJoin', 'and');
params.append('include', 'user,costs_center,payment_method');
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
```

### Buscar relatórios aprovados de um usuário
```typescript
const params = new URLSearchParams();
params.append('include', 'user');
params.append('search', 'user_id:895945;status:APROVADO');
params.append('searchFields', 'user_id:=;status:=');
params.append('searchJoin', 'and');

const response = await fetch(`${API_URL}/v2/reports?${params.toString()}`, {
  headers: {
    'Authorization': API_KEY,
    'Accept': 'application/json',
  },
  signal: AbortSignal.timeout(300000),
});
```

### Buscar despesas reembolsáveis por período
```typescript
const params = new URLSearchParams();
params.append('search', `date:2026-04-01,2026-04-30;reimbursable:true`);
params.append('searchFields', 'date:between;reimbursable:=');
params.append('searchJoin', 'and');
params.append('include', 'user,costs_center');

const response = await fetch(`${API_URL}/v2/expenses?${params.toString()}`, {
  headers: {
    'Authorization': API_KEY,
    'Accept': 'application/json',
  },
  signal: AbortSignal.timeout(300000),
});
```

---

## Conclusão

A API VExpenses v2 fornece acesso a dados de despesas, relatórios, usuários e configurações, mas tem limitações importantes:

**✅ Disponível:**
- Dados cadastrais (usuários, centros de custo, tipos de despesa)
- Despesas individuais com filtros avançados
- Relatórios e seus metadados
- Fluxos de aprovação

**❌ Não disponível:**
- Saldos de cartão
- Limites de cartão
- Cargas/transferências
- Status do cartão
- Dados financeiros completos

Para dados financeiros completos, pode ser necessário:
1. Integração direta com banco emissor
2. Contatar VExpenses para documentação adicional
3. Usar combinação de API + dados manuais
