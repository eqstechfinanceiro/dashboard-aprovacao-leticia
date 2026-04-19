# Documentação da API VExpenses (v2)

Esta documentação descreve **todas as rotas da API pública do VExpenses v2**, quais delas foram validadas com sucesso usando o token da EQS, e o formato exato dos dados retornados (capturado diretamente da API em produção).

A documentação serve de base para o dashboard de aprovação/financeiro (`dashboard-aprovacao-leticia`).

- Documentação oficial (RapiDoc): <https://developers.vexpenses.com/v2/>
- Host base: `https://api.vexpenses.com`
- Todas as rotas ficam sob o prefixo `/v2`

---

## 1. Autenticação

A API usa `apiKey` enviada no header `Authorization` **sem prefixo** (não é `Bearer`):

```
Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8
Accept: application/json
```

Respostas de autenticação inválida:

| Cenário | HTTP | Body |
|--------|------|------|
| Sem header `Authorization` | `401` | `Unauthorized.` |
| Token inválido | `401` | `Unauthorized.` |

### Rate limit

As respostas trazem headers padrão do Laravel:

```
x-ratelimit-limit: 100
x-ratelimit-remaining: 99
```

Ou seja, **100 requisições por minuto por token**. Planeje cache/polling do dashboard de acordo.

---

## 2. Envelope padrão de resposta

Todas as rotas (sucesso ou erro) retornam um envelope consistente:

```json
{
  "request": "https://api.vexpenses.com/v2/<rota>",
  "method": "GET",
  "success": true,
  "code": 200,
  "message": "Team members successfully sent!",
  "data": [ ... ]   // objeto ou array, depende da rota
}
```

Campos:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `request` | string | URL completa requisitada |
| `method` | string | Método HTTP |
| `success` | boolean | `true` se `code` começar com 2xx |
| `code` | integer | Código HTTP |
| `message` | string | Mensagem textual (em inglês ou PT) |
| `data` | object / array | Payload útil — formato depende da rota |

### Erros comuns

| `code` | `message` | Quando ocorre |
|--------|-----------|---------------|
| 401 | `Unauthorized.` | Token ausente ou inválido |
| 404 | `No query results for this request.` | ID inexistente em rotas `/{id}` |
| 405 | `The GET method is not supported for route v2/...` | Método errado (ex.: `GET /v2/advances`) |
| 422 | `Filter fields are required` | `GET /v2/expenses` sem `search`/`searchFields` |

---

## 3. Paginação

Rotas de listagem aceitam (por padrão são **não paginadas** — retornam todos os registros em um único array `data`):

| Query param | Tipo | Descrição |
|-------------|------|-----------|
| `paginate` | boolean | `true` para ativar paginação estilo Laravel |
| `page` | integer | Página desejada (usado quando `paginate=true`) |
| `per_page` | integer | Tamanho da página |

Quando `paginate=true` o envelope inclui campos extras: `current_page`, `first_page_url`, `from`, `last_page`, `last_page_url`, `next_page_url`, `path`, `per_page`, `prev_page_url`, `to`, `total`.

> Observação importante validada em produção: na conta da EQS, `GET /v2/team-members` retornou **773 membros** em um único payload (~384 KB) e `GET /v2/reports` retornou **5.941 relatórios** (~3,9 MB). Para o dashboard, **sempre use `paginate=true` com `per_page` razoável** para não carregar megabytes a cada refresh.

---

## 4. Status possíveis

### 4.1 Status de relatório (`Report.status`)

Distribuição real na conta EQS (em `GET /v2/reports`):

| Status | Ocorrências |
|--------|-------------|
| `APROVADO` | 4614 |
| `ABERTO` | 572 |
| `ENVIADO` | 515 |
| `REPROVADO` | 186 |
| `REABERTO` | 54 |

A rota `/v2/reports/status/{status}` aceita: `ABERTO`, `APROVADO`, `REPROVADO`, `REABERTO`, `PAGO`, `ENVIADO`.

### 4.2 Tipos de usuário (`User.user_type`)

`ADMINISTRADOR`, `USUARIO`. Na conta EQS: 8 administradores e 765 usuários comuns.

---

## 5. Índice das rotas

Legenda de estado: **OK** = testado em produção com token EQS e retornou `200`; **SPEC** = definido na spec oficial, não foi executado nesta sessão (operação de escrita/destrutiva); **ERRO** = chamada retornou erro documentado abaixo.

### Team members (Colaboradores)

| Método | Rota | Estado | Descrição |
|--------|------|--------|-----------|
| GET | `/v2/team-members` | OK | Lista todos os colaboradores |
| POST | `/v2/team-members` | SPEC | Cria um colaborador |
| GET | `/v2/team-members/{id}` | OK | Retorna um colaborador por ID |
| PUT | `/v2/team-members/{id}` | SPEC | Atualiza um colaborador |
| GET | `/v2/team-members/email/{email}` | OK | Busca colaborador por e-mail |
| GET | `/v2/team-members/parameters` | OK | Parâmetros customizados disponíveis |
| POST | `/v2/team-members/{id}/attach-cost-center` | SPEC | Vincula centro de custo ao colaborador |
| POST | `/v2/team-members/{id}/attach-projects` | SPEC | Vincula projetos ao colaborador |

### Costs centers (Centros de custo)

| Método | Rota | Estado | Descrição |
|--------|------|--------|-----------|
| GET | `/v2/costs-centers` | OK | Lista centros de custo |
| POST | `/v2/costs-centers` | SPEC | Cria centro de custo |
| GET | `/v2/costs-centers/{id}` | OK | Detalha centro de custo |
| PUT | `/v2/costs-centers/{id}` | SPEC | Atualiza centro de custo |

### Projects (Projetos)

| Método | Rota | Estado | Descrição |
|--------|------|--------|-----------|
| GET | `/v2/projects` | OK | Lista projetos |
| POST | `/v2/projects` | SPEC | Cria projeto |
| GET | `/v2/projects/{id}` | OK | Detalha projeto |
| PUT | `/v2/projects/{id}` | SPEC | Atualiza projeto |

### Approval flows (Fluxos de aprovação)

| Método | Rota | Estado | Descrição |
|--------|------|--------|-----------|
| GET | `/v2/approval-flows` | OK | Lista fluxos de aprovação |
| POST | `/v2/approval-flows` | SPEC | Cria fluxo |
| GET | `/v2/approval-flows/{id}` | OK | Detalha fluxo |
| PUT | `/v2/approval-flows/{id}` | SPEC | Atualiza fluxo |
| POST | `/v2/approval-flows/{id}/attach-cost-centers` | SPEC | Vincula centros de custo ao fluxo |

### Reports (Relatórios de despesa)

| Método | Rota | Estado | Descrição |
|--------|------|--------|-----------|
| GET | `/v2/reports` | OK | Lista relatórios |
| POST | `/v2/reports` | SPEC | Cria relatório |
| GET | `/v2/reports/{id}` | OK | Detalha relatório |
| PUT | `/v2/reports/{id}` | SPEC | Atualiza relatório |
| GET | `/v2/reports/status/{status}` | OK | Lista relatórios por status |
| POST | `/v2/reports/{id}/approve` | SPEC | Aprova um relatório |
| PUT | `/v2/reports/{id}/pay` | SPEC | Marca relatório como pago |

### Expenses (Despesas)

| Método | Rota | Estado | Descrição |
|--------|------|--------|-----------|
| GET | `/v2/expenses` | OK (requer filtro) | Lista despesas; exige `search`+`searchFields` |
| POST | `/v2/expenses` | SPEC | Cria despesa |
| GET | `/v2/expenses/{id}` | SPEC | Detalha despesa |
| PUT | `/v2/expenses/{id}` | SPEC | Atualiza despesa |

### Expense types (Tipos de despesa)

| Método | Rota | Estado | Descrição |
|--------|------|--------|-----------|
| GET | `/v2/expenses-type` | OK | Lista tipos de despesa |
| POST | `/v2/expenses-type` | SPEC | Cria tipo de despesa |
| GET | `/v2/expenses-type/{id}` | OK | Detalha tipo de despesa |
| PUT | `/v2/expenses-type/{id}` | SPEC | Atualiza tipo de despesa |

### Currencies

| Método | Rota | Estado | Descrição |
|--------|------|--------|-----------|
| GET | `/v2/currencies` | OK | Lista moedas suportadas |

### Advances (Adiantamentos)

| Método | Rota | Estado | Descrição |
|--------|------|--------|-----------|
| POST | `/v2/advances` | SPEC | Cria um adiantamento |

> `GET /v2/advances` **não existe** (retorna `405 – The GET method is not supported for route v2/advances. Supported methods: POST, OPTIONS.`).

---

## 6. Detalhamento por recurso

Todas as respostas abaixo foram capturadas em produção com o token EQS. Campos sensíveis foram mantidos porque já são visíveis no painel VExpenses da própria conta.

### 6.1 Team member (colaborador)

`GET /v2/team-members` → `data: User[]`
`GET /v2/team-members/{id}` e `GET /v2/team-members/email/{email}` → `data: User`

Schema `User`:

| Campo | Tipo | Observações |
|-------|------|-------------|
| `id` | integer | PK interna do VExpenses |
| `integration_id` | string \| null | Código do colaborador no ERP do cliente |
| `external_id` | string \| null | UUID externo (SSO/integração) |
| `company_id` | integer | ID da empresa-mãe (1825947 na EQS) |
| `role_id` | integer \| null | ID do cargo |
| `approval_flow_id` | integer \| null | FK → Approval-Flow |
| `expense_limit_policy_id` | integer \| null | FK → Política de limite |
| `user_type` | string | `ADMINISTRADOR` ou `USUARIO` |
| `name` | string | Nome completo |
| `email` | string | Usado em `/v2/team-members/email/{email}` |
| `cpf` | string \| null | Só dígitos |
| `phone1`, `phone2` | string \| null | |
| `birth_date` | string (YYYY-MM-DD) \| null | |
| `bank`, `agency`, `account`, `pix_key` | string \| null | Dados bancários |
| `confirmed` | boolean | Se o usuário confirmou o e-mail |
| `active` | boolean | Usuário ativo |
| `parameters` | object \| null | Parâmetros customizados (ver 6.2) |
| `created_at`, `updated_at` | string (`YYYY-MM-DD HH:MM:SS`) | |

Exemplo real:

```json
{
  "id": 891904,
  "integration_id": null,
  "external_id": null,
  "company_id": 1825947,
  "role_id": 40802,
  "approval_flow_id": 174405,
  "expense_limit_policy_id": 16805,
  "user_type": "ADMINISTRADOR",
  "name": "LETICIA ANGENITA SCHEIMANN BAUER",
  "email": "leticia@eqsengenharia.com.br",
  "cpf": "10053877969",
  "phone1": "+(55)(48) 99930-4091",
  "phone2": null,
  "birth_date": "1997-08-25",
  "bank": null, "agency": null, "account": null, "pix_key": null,
  "confirmed": true,
  "active": true,
  "parameters": null,
  "created_at": "2025-04-09 09:12:06",
  "updated_at": "2025-05-06 17:52:00"
}
```

**Query params suportados em `GET /v2/team-members`**

| Param | Tipo | Valores | Descrição |
|-------|------|---------|-----------|
| `include` | string | `costsCenters`, `projects` (separados por vírgula) | Inclui relacionamentos aninhados |
| `paginate` | boolean | `true`/`false` | Ativa paginação |
| `page` | integer | ≥1 | Página |
| `per_page` | integer | ≥1 | Itens por página |

### 6.2 Team member parameters

`GET /v2/team-members/parameters` → `data: Parameter[]`

```json
{
  "data": [
    {
      "name": "codigoUsuarioImportacaoDespesas",
      "label": "Código do usuário para importação de despesas pelo excel",
      "type": "string",
      "created_at": "2018-12-10 10:53:27",
      "updated_at": "2026-04-09 11:47:53"
    }
  ]
}
```

Cada item descreve um **campo custom** que aparece em `User.parameters`.

### 6.3 Cost center

`GET /v2/costs-centers` → `data: CostCenter[]`
`GET /v2/costs-centers/{id}` → `data: CostCenter`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | integer | PK |
| `integration_id` | string \| null | Código do ERP |
| `name` | string | Nome exibido |
| `company_group_id` | integer | ID do grupo/empresa-mãe |
| `on` | boolean | Ativo |
| `approval_flow_id` | integer \| null | Fluxo de aprovação vinculado |

Exemplo:

```json
{ "id": 1825948, "integration_id": "1201002", "name": "FINANCEIRO",
  "company_group_id": 1825947, "on": true, "approval_flow_id": null }
```

### 6.4 Project

`GET /v2/projects` → `data: Project[]`
`GET /v2/projects/{id}` → `data: Project`

| Campo | Tipo |
|-------|------|
| `id` | integer |
| `name` | string |
| `company_name` | string \| null |
| `cnpj` | string \| null |
| `address`, `neighborhood`, `city`, `state` | string \| null |
| `zip_code` | integer \| null |
| `phone1`, `phone2` | integer \| null |
| `on` | boolean |
| `integration_id` | string \| null |

### 6.5 Approval flow

`GET /v2/approval-flows` → `data: ApprovalFlow[]`
`GET /v2/approval-flows/{id}` → `data: ApprovalFlow`

```json
{
  "id": 172530,
  "external_id": null,
  "company_id": 1825947,
  "description": "REGIONAL CO",
  "steps": [
    {
      "operator": "E",
      "entrance_value": null,
      "order": 1,
      "groups": [
        { "operator": "OU", "approvers": [891980, 891977, 946419, 891979, 891904, 896335] }
      ]
    },
    {
      "operator": "E", "entrance_value": 3000, "order": 3,
      "groups": [ { "operator": "E", "approvers": [896357] } ]
    }
  ]
}
```

Semântica:

- `steps[].order` — ordem sequencial de aprovação.
- `steps[].operator` — `E` (AND) ou `OU` (OR) entre grupos de aprovadores do mesmo passo.
- `steps[].entrance_value` — valor mínimo (R$) para a etapa disparar. `null` = sempre.
- `steps[].groups[].operator` — operador interno do grupo: `E` exige todos, `OU` exige qualquer.
- `steps[].groups[].approvers` — lista de `team-member.id` que podem aprovar.

### 6.6 Report

`GET /v2/reports` → `data: Report[]`
`GET /v2/reports/{id}` e `GET /v2/reports/status/{status}` → `data: Report` / `data: Report[]`

| Campo | Tipo | Observações |
|-------|------|-------------|
| `id` | integer | PK |
| `external_id` | string \| null | UUID externo |
| `user_id` | integer | Quem criou o relatório |
| `device_id` | integer \| null | Device que enviou |
| `description` | string | Título do relatório (ex.: `CAIXA 06/2025`) |
| `status` | string | `ABERTO` / `ENVIADO` / `APROVADO` / `REPROVADO` / `REABERTO` / `PAGO` |
| `approval_stage_id` | integer \| null | Etapa atual no fluxo |
| `approval_user_id` | integer \| null | Último aprovador |
| `approval_date` | datetime \| null | Data da última aprovação |
| `payment_date` | datetime \| null | Data do pagamento |
| `payment_method_id` | integer \| null | Meio de pagamento (ver `expense.payment_method`) |
| `observation` | string \| null | Observação do usuário |
| `paying_company_id` | integer \| null | Centro de custo pagador (FK → `costs-centers.id`) |
| `on` | boolean | Ativo |
| `justification` | string \| null | Justificativa (p.ex. quando reprovado) |
| `pdf_link` | string | URL permanente para o PDF do relatório |
| `excel_link` | string | URL para o Excel |
| `created_at`, `updated_at` | datetime | |

Exemplo real:

```json
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
  "justification": "Despesas de meses diferentes no mesmo relatório, favor arrumar...",
  "pdf_link": "https://app.vexpenses.com/relatorios/download/pdf/yMw4EGKJoey5Lxkq36o9",
  "excel_link": "https://app.vexpenses.com/relatorios/download/excel/yMw4EGKJoey5Lxkq36o9",
  "created_at": "2025-06-06 17:26:33",
  "updated_at": "2026-01-22 08:37:53"
}
```

**Query params de `GET /v2/reports` e `GET /v2/reports/status/{status}`**

| Param | Tipo | Descrição |
|-------|------|-----------|
| `include` | string | Lista separada por vírgula. Opções: `expenses`, `expenses.apportionment`, `expenses.expense_type`, `expenses.costs_center`, `expenses.payment_method`, `expenses.gps`, `user`, `payment_method`, `advance`, `approval`, `invoice`, `history` |
| `search` | string | Filtro em formato `campo:valor;campo:v1,v2`. Ex.: `approval_date:2025-01-01,2025-03-31;created_at:2025-01-01` |
| `searchFields` | string | Operadores para cada campo. Ex.: `approval_date:between;created_at:=` — suporta `=`, `>=`, `<=`, `between`, etc. |
| `searchJoin` | string | `and` (default) ou `or` |

> `POST /v2/reports/{id}/approve` requer body `{ "approver": <user_id>, "comment": "...", "expenses": [...] }` e retorna `data: ApprovalResult[]`. `PUT /v2/reports/{id}/pay` requer `{ "payment_date": "YYYY-MM-DD HH:MM:SS", "comment": "..." }`.

### 6.7 Expense

`GET /v2/expenses` **exige** os filtros `search` e `searchFields` — sem eles retorna `422 Filter fields are required`.

Exemplo funcional (todas as despesas de um relatório específico, com objetos aninhados):

```
GET /v2/expenses?search=report.id:7603397&searchFields=report.id:=
                &include=apportionment,user,expense_type,costs_center,payment_method,report,gps,fueling
```

**Query params**

| Param | Valores / Formato | Descrição |
|-------|-------------------|-----------|
| `include` | `apportionment`, `user`, `expense_type`, `costs_center`, `payment_method`, `report`, `gps`, `fueling` | Inclui relacionamentos |
| `search` | `campo:valor[;campo:valor]` | Filtros. Campos suportados incluem `date`, `report.approval_date`, `payment_date`, `created_at`, `report.id` |
| `searchFields` | `campo:operador` | Ex.: `date:between;report.id:=` — `between` exige dois valores separados por vírgula |
| `searchJoin` | `and` \| `or` | Combinação dos filtros |

Schema `Expense` (resposta em produção — note que o JSON usa `expense_id` para o relatório pai, não `report_id`, e `reicept_url` (typo oficial da API) para o comprovante):

| Campo | Tipo | Observações |
|-------|------|-------------|
| `id` | integer | PK |
| `user_id` | integer | Autor |
| `expense_id` | integer | **FK → `reports.id`** (apesar do nome, é o ID do relatório) |
| `device_id` | integer \| null | |
| `integration_id` | integer \| null | |
| `external_id` | string \| null | |
| `mileage` | string (numérico) | "0.00" quando não for quilometragem |
| `date` | datetime | Data real da despesa |
| `expense_type_id` | integer | FK → `expenses-type.id` |
| `payment_method_id` | integer | |
| `paying_company_id` | integer | FK → `costs-centers.id` |
| `course_id` | integer \| null | Rota (para quilometragem) |
| `reicept_url` | string \| null | **URL do comprovante (typo intencional da API)** |
| `value` | number | Valor original |
| `title` | string | |
| `validate` | string | `"S"` / `"N"` — se despesa foi validada pelo usuário |
| `reimbursable` | boolean | |
| `observation` | string \| null | |
| `rejected` | integer | 0 = não rejeitada |
| `on` | boolean | Ativa |
| `mileage_value` | number \| null | Valor por km |
| `original_currency_iso` | string | Ex.: `BRL`, `USD` |
| `exchange_rate` | number \| null | |
| `converted_value` | number \| null | Valor convertido para `converted_currency_iso` |
| `converted_currency_iso` | string \| null | |
| `created_at`, `updated_at` | datetime | |

Quando usar `include`, a resposta ganha chaves adicionais aninhadas no padrão Fractal (`{"data": ...}`):

```json
{
  "id": 61793895,
  "user_id": 895944,
  "expense_id": 7603397,
  "date": "2025-06-04 00:00:00",
  "value": 30,
  "title": "Pedagio",
  "reicept_url": "https://s3-vex-vexprod-app.s3.amazonaws.com/receipts/941e26f5-71ff-4f47-b55a-e469d2b87781.jpg",
  "original_currency_iso": "BRL",

  "apportionment": {
    "data": [
      { "id": 29610474, "expense_id": 61793895, "reimbursable_company_id": 1861280,
        "description": "REGIONAL CO", "percentage": "100.00", "on": true,
        "created_at": "2025-06-06 20:38:56", "updated_at": "2025-06-06 20:38:56" }
    ]
  },
  "user":         { "data": { /* User */ } },
  "expense_type": { "data": { "id": 1563009, "description": "PEDAGIO", "on": true } },
  "costs_center": { "data": { /* CostCenter */ } },
  "payment_method": {
    "data": { "id": 627721, "description": "Saque VExpenses",
              "reimbursable": false, "affects_advance": true }
  },
  "report":       { "data": { /* Report */ } }
}
```

### 6.8 Expense type

`GET /v2/expenses-type` → `data: ExpenseType[]`
`GET /v2/expenses-type/{id}` → `data: ExpenseType`

| Campo | Tipo |
|-------|------|
| `id` | integer |
| `integration_id` | string \| null |
| `description` | string (ex.: `ALMOÇO`, `HOSPEDAGEM`, `PEDAGIO`) |
| `on` | boolean |

### 6.9 Currencies

`GET /v2/currencies` → `data: Currency[]`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `priority` | integer | Maior = preferida (BRL=100) |
| `iso_code` | string | `BRL`, `USD`, `EUR`, ... |
| `name` | string | Nome legível |
| `symbol` | string | `R$`, `$`, `€` ... |
| `subunit` | string | Ex.: `Centavo` |
| `subunit_to_unit` | integer | Centavos por unidade (100) |
| `symbol_first` | integer | 1 = símbolo antes do valor |
| `html_entity` | string | |
| `decimal_mark` | string | `,` ou `.` |
| `thousands_separator` | string | |
| `iso_numeric` | string \| null | |

### 6.10 Apportionment (rateio de despesa)

Só aparece aninhado em `Expense` via `include=apportionment`. Campos:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | integer | |
| `integration_id` | integer \| null | |
| `expense_id` | integer | FK → `expenses.id` (aqui sim é despesa) |
| `reimbursable_company_id` | integer | Empresa/centro de custo que absorve o rateio |
| `description` | string | |
| `percentage` | string (numérico, soma sempre 100) | |
| `on` | boolean | |
| `created_at`, `updated_at` | datetime | |

### 6.11 Advance

Só `POST /v2/advances`. Body esperado:

```json
{
  "description": "Adiantamento viagem SP",
  "advance_user_id": "895944",
  "advance_date": "2026-04-19",
  "value": 500.00,
  "currency_iso": "BRL",
  "creator_user_id": "891904"
}
```

Resposta (`data: Advance`):

| Campo | Tipo |
|-------|------|
| `id` | string (UUID) |
| `description` | string |
| `advance_user_id` | integer |
| `registration_user_id` | integer |
| `release_date` | datetime |
| `value` | number |
| `original_currency_iso` | string |
| `advance_number` | integer |
| `advance_report_id` | integer |
| `created_at`, `updated_at` | datetime |

---

## 7. Sugestão de modelagem para o dashboard

A partir do catálogo acima, recomendo organizar o dashboard em 4 domínios:

1. **Cadastros** — dados dimensionais, carregados 1x/dia em cache:
   - `team-members` (`/v2/team-members`)
   - `costs-centers`, `projects`, `expenses-type`, `currencies`, `approval-flows`
2. **Pipeline de aprovação** — consumo diário/ao vivo:
   - `GET /v2/reports/status/ABERTO` → relatórios aguardando o usuário enviar
   - `GET /v2/reports/status/ENVIADO` → fila de aprovação da Letícia/aprovadores
   - `GET /v2/reports/status/REPROVADO` e `REABERTO` → KPIs de retrabalho
3. **Financeiro (pós-aprovação)**:
   - `GET /v2/reports/status/APROVADO` com `include=expenses.apportionment,expenses.costs_center,payment_method` — alimenta a visão de pagamento (campo `payment_date` indica se já foi pago)
   - `PUT /v2/reports/{id}/pay` para dar baixa
4. **Drill-down de despesas**:
   - `GET /v2/expenses?search=report.id:<id>&searchFields=report.id:=&include=apportionment,expense_type,costs_center,user,payment_method`

### Exemplo mínimo em `fetch`

```ts
const VEX_TOKEN = process.env.VEXPENSES_TOKEN!;
const base = "https://api.vexpenses.com/v2";

async function vex<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: VEX_TOKEN, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data as T;
}

// KPI: nº de relatórios aguardando aprovação
const pendentes = await vex<Report[]>("/reports/status/ENVIADO");
```

### Boas práticas

- **Nunca versione o token no código** — use variável de ambiente (`VEXPENSES_TOKEN`) carregada via `.env` (no server) ou via secret manager do deploy.
- Respeite o rate limit (100/min). Em dashboards com múltiplos widgets, faça uma única chamada por recurso no backend e propague via props/context no frontend.
- Para histórico, armazene localmente (DB/Supabase/Postgres): a API não expõe endpoints analíticos — todo agregado (somatórios, médias, contagens por centro de custo) precisa ser calculado pelo cliente.
- Trate `"reicept_url"` (sic) e `expense.expense_id` (que é `report_id`) — são inconsistências conhecidas da API.

---

## 8. Referências

- OpenAPI oficial: <https://developers.vexpenses.com/v2/openApi-EN.yaml> e arquivos `*.yaml` em `https://developers.vexpenses.com/v2/{tag}/...`.
- Site VExpenses: <https://vexpenses.com>
- Contato: `vexpenses@vexpenses.com`

---

_Documentação gerada automaticamente a partir da spec oficial + chamadas reais à conta EQS em 2026-04-19._
