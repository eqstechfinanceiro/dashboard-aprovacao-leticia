# Mapeamento de Rotas da API VExpenses (v2)

Base URL: `https://api.vexpenses.com`

Autenticação: Header `Authorization` com API Key

---

## 1. GET /v2/team-members

**Propósito**: Retorna todos os membros da equipe (colaboradores)

**Parâmetros**:
- `paginate`: "false" (desliga paginação)
- `per_page`: "1000" (máximo por página)
- `include`: "costsCenters" (inclui centros de custo)

**Retorna**:
```json
{
  "data": [
    {
      "id": 123,
      "name": "João Silva",
      "cpf": "12345678901",
      "email": "joao@empresa.com",
      "costsCenters": [
        {
          "id": 456,
          "name": "Centro de Custo A"
        }
      ]
    }
  ]
}
```

**Uso no código**: `get_team_members(include="costsCenters")`

---

## 2. GET /v2/costs-centers

**Propósito**: Retorna todos os centros de custo

**Parâmetros**: Nenhum

**Retorna**:
```json
{
  "data": [
    {
      "id": 456,
      "name": "Centro de Custo A",
      "code": "CC001"
    }
  ]
}
```

**Uso no código**: `get_costs_centers()`

---

## 3. GET /v2/approval-flows

**Propósito**: Retorna todos os fluxos de aprovação

**Parâmetros**: Nenhum

**Retorna**:
```json
{
  "data": [
    {
      "id": 789,
      "name": "Fluxo Padrão",
      "steps": [...]
    }
  ]
}
```

**Uso no código**: `get_approval_flows()`

---

## 4. GET /v2/expenses/{expense_id}

**Propósito**: Retorna uma despesa específica por ID

**Parâmetros**:
- `include`: "user,expense_type,payment_method,costs_center,report"

**Retorna**:
```json
{
  "success": true,
  "data": {
    "id": 1001,
    "date": "2024-01-15",
    "amount": 150.00,
    "user": {
      "id": 123,
      "name": "João Silva",
      "cpf": "12345678901"
    },
    "expense_type": {
      "id": 5,
      "name": "Alimentação"
    },
    "payment_method": {
      "id": 2,
      "name": "Cartão Corporativo"
    },
    "costs_center": {
      "id": 456,
      "name": "Centro de Custo A"
    },
    "report": {
      "id": 2001,
      "title": "Relatório Janeiro"
    }
  }
}
```

**Uso no código**: `get_expense_by_id(expense_id)`

---

## 5. GET /v2/expenses (busca por ID)

**Propósito**: Busca despesas por ID específico usando search

**Parâmetros**:
- `search`: "id:{expense_id}"
- `searchFields`: "id:="
- `paginate`: "false"
- `per_page`: "1"

**Retorna**:
```json
{
  "data": [
    {
      "id": 1001,
      "date": "2024-01-15",
      "amount": 150.00
    }
  ]
}
```

**Uso no código**: `get_expenses_by_ids(expense_ids)` (busca um a um para evitar erros 500)

---

## 6. GET /v2/expenses (busca por período)

**Propósito**: Retorna todas as despesas de um período com paginação

**Parâmetros**:
- `search`: "date:{start_date},{end_date}"
- `searchFields`: "date:between"
- `paginate`: "true"
- `page`: "1" (página atual)
- `per_page`: "200"
- `include`: "user,expense_type" (ou outros includes)

**Retorna**:
```json
{
  "data": [
    {
      "id": 1001,
      "date": "2024-01-15",
      "amount": 150.00,
      "user": {
        "id": 123,
        "name": "João Silva",
        "cpf": "12345678901"
      },
      "expense_type": {
        "id": 5,
        "name": "Alimentação"
      }
    }
  ],
  "meta": {
    "current_page": 1,
    "per_page": 200,
    "total": 500
  }
}
```

**Uso no código**: `get_expenses_by_period(start_date, end_date, includes)`

---

## 7. GET /v2/reports

**Propósito**: Retorna relatórios por IDs

**Parâmetros**:
- `search`: "id:{rid1};id:{rid2};..." (IDs separados por ;)
- `searchFields`: "id:=;id:=;..." (um para cada ID)
- `searchJoin`: "or"
- `paginate`: "false"
- `per_page`: "1000"
- `include`: "user"

**Retorna**:
```json
{
  "data": [
    {
      "id": 2001,
      "title": "Relatório Janeiro",
      "user": {
        "id": 123,
        "name": "João Silva"
      },
      "status": "approved"
    }
  ]
}
```

**Uso no código**: `get_reports_by_ids(report_ids)`

---

## Cache

O cliente API implementa cache em memória com TTL de 5 minutos para evitar múltiplas requisições na mesma sessão de verificação.

## Carregamento de Arquivo

Para evitar chamadas excessivas à API, o cliente suporta carregar dados de arquivos JSON locais:
- `data/expenses.json` - Despesas
- `data/approval_flows.json` - Fluxos de aprovação
- `data/team_members.json` - Membros da equipe

Esses arquivos podem ser baixados via curl e carregados com:
- `load_expenses_from_file()`
- `load_approval_flows_from_file()`
- `load_team_members_from_file()`
