# Documentação da API VExpenses v2

## Configuração

**Base URL:** `https://api.vexpenses.com/v2`

**Autenticação:** Header `Authorization` com a API key

```python
headers = {
    "Authorization": "SUA_API_KEY",
    "Content-Type": "application/json"
}
```

## Endpoints Testados

### 1. Team Members (/v2/team-members)

**Método:** GET

**Descrição:** Retorna lista de membros da equipe (usuários)

**Parâmetros de Query:**
- `paginate` (boolean): Indica se a resposta deve ser paginada
- `per_page` (integer): Número de elementos por página
- `page` (integer): Número da página
- `include` (enum): Flag para retornar objetos relacionados (costsCenters, projects)

**Exemplo de requisição:**
```python
response = requests.get(
    "https://api.vexpenses.com/v2/team-members",
    headers=headers,
    params={"paginate": "false", "per_page": 100}
)
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
      "expense_limit_policy_id": 16805,  // IMPORTANTE: ID da política de limite
      "user_type": "ADMINISTRADOR",
      "name": "conf",
      "email": "conf@eqsengenharia.com.br",
      "cpf": null,
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
      "updated_at": "2025-10-09 13:53:18"
    }
  ]
}
```

**Campos importantes:**
- `expense_limit_policy_id`: ID da política de limite de despesas do usuário
- `approval_flow_id`: ID do fluxo de aprovação
- `active`: Status do usuário (ativo/inativo)

---

### 2. Reports (/v2/reports)

**Método:** GET

**Descrição:** Retorna lista de relatórios de despesas

**Parâmetros de Query:**
- `paginate` (boolean): Indica se a resposta deve ser paginada
- `per_page` (integer): Número de elementos por página
- `page` (integer): Número da página
- `status` (string): Filtrar por status (ex: "APPROVED", "PENDING")

**Exemplo de requisição:**
```python
response = requests.get(
    "https://api.vexpenses.com/v2/reports",
    headers=headers,
    params={"paginate": "false", "per_page": 100, "status": "APPROVED"}
)
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
      "updated_at": "2026-01-22 08:37:53"
    }
  ]
}
```

**Campos importantes:**
- `user_id`: ID do usuário dono do relatório
- `status`: Status do relatório (APROVADO, PENDENTE, etc)
- `pdf_link`: Link para PDF do relatório
- `excel_link`: Link para Excel do relatório

---

### 2.1. Report Detail (/v2/reports/{id})

**Método:** GET

**Descrição:** Retorna detalhes de um relatório específico

**Parâmetros de Path:**
- `id` (integer): ID do relatório

**Exemplo de requisição:**
```python
response = requests.get(
    f"https://api.vexpenses.com/v2/reports/{report_id}",
    headers=headers
)
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
    "external_id": null,
    "user_id": 895944,
    "description": "CAIXA 06/2025",
    "status": "APROVADO",
    // ... mesmos campos do endpoint /reports
  }
}
```

**Nota:** Este endpoint NÃO inclui as despesas individuais do relatório. O endpoint `/reports/{id}/expenses` não existe (404).

---

### 3. Projects (/v2/projects)

**Método:** GET

**Descrição:** Retorna lista de projetos

**Parâmetros de Query:**
- `paginate` (boolean): Indica se a resposta deve ser paginada
- `per_page` (integer): Número de elementos por página
- `page` (integer): Número da página

**Exemplo de requisição:**
```python
response = requests.get(
    "https://api.vexpenses.com/v2/projects",
    headers=headers,
    params={"paginate": "false", "per_page": 100}
)
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

### 4. Approval Flows (/v2/approval-flows)

**Método:** GET

**Descrição:** Retorna lista de fluxos de aprovação

**Parâmetros de Query:**
- `paginate` (boolean): Indica se a resposta deve ser paginada
- `per_page` (integer): Número de elementos por página
- `page` (integer): Número da página

**Exemplo de requisição:**
```python
response = requests.get(
    "https://api.vexpenses.com/v2/approval-flows",
    headers=headers,
    params={"paginate": "false", "per_page": 100}
)
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

## Endpoints Não Funcionais

### Expenses (/v2/expenses)

**Status:** ❌ Requer filtros obrigatórios não identificados

**Erro:** 422 - "Filter fields are required"

**Filtros testados que NÃO funcionaram:**
- `report_id`
- `user_id`
- `start_date` + `end_date`
- Combinações dos acima

**Nota:** É possível que este endpoint requira campos específicos que ainda não foram identificados. Pode ser necessário consultar a documentação oficial ou entrar em contato com o suporte VExpenses.

---

### Cost Centers (/v2/cost-centers)

**Status:** ❌ Método GET não suportado

**Erro:** 405 - "The GET method is not supported for route v2/cost-centers. Supported methods: OPTIONS."

---

### Expense Limit Policies (/v2/expense-limit-policies)

**Status:** ❌ Método GET não suportado

**Erro:** 405 - "The GET method is not supported for route v2/expense-limit-policies. Supported methods: OPTIONS."

**Nota:** Isso é problemático pois precisamos deste endpoint para obter os limites de despesas por usuário. O `expense_limit_policy_id` está disponível no endpoint `/team-members`, mas não conseguimos acessar os detalhes da política.

---

### Cards (/v2/cards)

**Status:** ❌ Método GET não suportado

**Erro:** 405 - "The GET method is not supported for route v2/cards. Supported methods: OPTIONS."

---

### Card Limits (/v2/card-limits, /v2/cards-limits)

**Status:** ❌ Método GET não suportado

**Erro:** 405 - "The GET method is not supported for route v2/card-limits. Supported methods: OPTIONS."

---

### Team Member Cards (/v2/team-members/{id}/cards)

**Status:** ❌ Endpoint não encontrado

**Erro:** 404 - "Url [v2/team-members/{id}/cards] not found."

---

### Team Member Parameters (/v2/team-members/{id}/parameters)

**Status:** ❌ Endpoint não encontrado

**Erro:** 404 - "Url [v2/team-members/{id}/parameters] not found."

---

## Mapeamento de Filtros do Usuário

O usuário mencionou os seguintes filtros (baseados na interface do usuário):

### Categoria: Período
- **Data Inicial**: `start_date` (formato: YYYY-MM-DD)
- **Data Final**: `end_date` (formato: YYYY-MM-DD)

### Categoria: Resumo / Exibição
- **Mostrar resumo por relatório**: Não mapeado diretamente na API
- **Mostrar resumo geral**: Não mapeado diretamente na API

### Categoria: Tipo de Reembolso
- **Mostrar reembolsáveis**: Não mapeado diretamente na API
- **Mostrar não reembolsáveis**: Não mapeado diretamente na API

### Categoria: Informações adicionais
- **Mostrar datas e política**: Não mapeado diretamente na API
- **Filtrar usuários inativos**: Pode ser filtrado pelo campo `active: false` em `/team-members`

---

## Dados das Planilhas vs API

### Planilha 2 (CONTROLE - VEXPENSES - ABRIL-2026)
Contém dados detalhados de usuários com:
- Nome, CPF, código
- Status (ATIVO/INATIVO)
- Status do cartão
- Regional, cliente, gestor
- Valores de gastos, limites, saldos

### Mapeamento para API:
- **Nome/CPF/Status**: Disponível em `/team-members`
- **Limite**: `expense_limit_policy_id` em `/team-members`, mas endpoint de políticas não acessível
- **Saldo**: Não identificado diretamente na API (pode estar em `/expenses` ou endpoint específico)
- **Regional/Cliente/Gestor**: Não identificado diretamente na API

---

## Próximos Passos

1. **Investigar endpoint `/expenses`**: Descobrir quais são os filtros obrigatórios
2. **Encontrar endpoint para limites**: Descobrir como acessar os detalhes das políticas de limite
3. **Encontrar endpoint para saldo**: Descobrir como obter saldo atual do cartão por usuário
4. **Documentar filtros adicionais**: Mapear completamente os filtros mencionados pelo usuário
5. **Testar endpoints não documentados**: Explorar outros endpoints que podem existir

---

## Script de Teste

Um script Python completo para testar os endpoints está disponível em:
`vexpenses-dashboard/test_vexpenses_api.py`

Para executar:
```bash
cd vexpenses-dashboard
python test_vexpenses_api.py
```
