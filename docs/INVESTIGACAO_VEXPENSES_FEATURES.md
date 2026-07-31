# Investigação de Features da Plataforma VExpenses

## Objetivo
Mapear features da plataforma VExpenses (UI + API) que podem melhorar nossa automação do dashboard de aprovação/carga quinzenal.

**Investigação realizada em sessão live com Playwright MCP em 30/07/2026.**
Todos os endpoints e dados abaixo foram confirmados via captura de tráfego real no navegador autenticado.

---

## 1. Hórus — IA Antifraude

### O que é
IA de auditoria da VExpenses que detecta:
- **Duplicidade de comprovantes** — mesma foto/recibo em mais de um relatório ou despesa
- **Tags restritivas** — itens fora da política (bebidas alcoólicas, cigarros, etc.)
- **OCR automático** — leitura automática dos comprovantes em imagem

### Endpoints confirmados (API web interna)

#### 1.1. Inconsistências por relatório (na aprovação)
```
GET https://api.vexpenses.com/web/approvals/{approval_id}/inconsistencies?include_horus_details=true
GET https://api.vexpenses.com/web/approvals/{approval_id}/inconsistencies?include_horus_details=true&include_expenses=true
```
**Autenticação**: Cookie Laravel token (sessão web)

**Resposta (sem include_expenses)**:
```json
{
  "report": { "id": 11107695, "uuid": "fc3efe21-..." },
  "inconsistencies": {
    "has_policy_related_inconsistencies": false,
    "has_inconsistencies_related_to_alert_parameters": false,
    "has_fuel_policy_inconsistencies": false,
    "horus": {
      "sync": "processed",
      "content": {
        "has_possible_duplicates": true,
        "has_restrictive_tags": false
      }
    }
  }
}
```

**Resposta (com include_expenses=true)**:
- Retorna array `expenses[]` com cada despesa do relatório
- Cada despesa tem `horus_informations` com:
  - `sync`: "processed" | "pending"
  - `has_possible_duplicates`: boolean
  - `has_restrictive_tags`: boolean
  - `details.duplicates[]`: lista de despesas duplicadas
  - `details.restrictive_tags[]`: tags restritivas encontradas

**Estrutura de cada duplicate**:
```json
{
  "uuid": "1810d41b-...",
  "id": 69786433,
  "user": { "id": 966214, "name": "DAVID DE OLIVEIRA FRIGERIO" },
  "title": "GONCALVES   P L",
  "amount": 130,
  "date": "2025-10-14",
  "is_reimbursable": false,
  "observations": "MATERIAL APLICADO EM...",
  "score": 73,
  "fields": ["cnpj", "time"],
  "type": { "id": 1563006, "description": "MATERIAL" },
  "payment_method": { "id": 627401, "description": "Cartão Corporativo Itaú" },
  "receipt": { "id": 67580630, "type": "PDF", "original_url": "https://s3-vex-vexprod-app.s3.amazonaws.com/pdfs/..." },
  "report": { "id": 8868135, "description": "FATURA 11/2025", "status": "APROVADO" },
  "cost_center": { "id": 1861388, "nome": "CEF NORTE PR" },
  "apportionments": [{ "percentual": "100.00000000", "project": { "nome": "REGIONAL PR" } }]
}
```

**Campos-chave do Hórus**:
- **`score`**: Score de similaridade (0-100). Ex: 73 = correspondência alta
- **`fields`**: Campos que bateram entre as despesas. Ex: `["cnpj", "time"]` = mesmo CNPJ e horário
- **`sync`**: Status do processamento. "processed" = já analisado, "pending" = em fila

#### 1.2. Relatório Hórus (Gestão admin)
```
POST https://app.vexpenses.com/admin/relatorio-horus?page=1
Content-Type: application/x-www-form-urlencoded

startDate=30%2F06%2F2026&endDate=30%2F07%2F2026&orderBy=date&desc=0&type=both
```

**Parâmetros**:
- `startDate` / `endDate`: dd/MM/yyyy
- `orderBy`: "date" | "amount" | "title"
- `desc`: 0 (crescente) | 1 (decrescente)
- `type`: "both" | "duplicates" | "tags"
- `users[]`: IDs de usuários (opcional)
- `minValue` / `maxValue`: filtro de valor (opcional)

**Resposta**: HTML server-side rendered (Laravel/Blade) com:
- Painéis agrupados por conjunto de duplicatas
- Tabela por grupo: Título, Usuário, Data, Valor, Tag, Relatório, Status, Imagem do recibo
- Paginação (169 páginas encontradas para 30 dias!)
- Botão "Gerar Excel" para exportação

**Colunas do Excel Hórus** (mesmas da tabela HTML):
- Título, Usuário, Data, Valor, Tag, Relatório (#ID - descrição), Status, URL da imagem do recibo

### Como podemos usar

#### Integração via API web (recomendado)
1. **Pré-aprovação**: Antes de aprovar um relatório, chamar `GET /web/approvals/{id}/inconsistencies?include_horus_details=true&include_expenses=true`
2. **Dashboard**: Mostrar badge de duplicidades no card de cada relatório
3. **Detalhe**: Expandir para mostrar despesas duplicadas com score e fields
4. **Relatório completo**: Scraping do Excel admin para auditoria periódica

#### Integração via scraping admin
1. Acessar `app.vexpenses.com/admin/relatorio-horus` com Laravel token
2. POST com filtros de período quinzenal
3. Parsear HTML ou clicar "Gerar Excel" e baixar XLSX
4. Inserir no Neon para cruzamento com dados de carga

---

## 2. API de Aprovações (web interna)

### Endpoints confirmados

#### 2.1. Lista de aprovações por usuário
```
GET https://api.vexpenses.com/web/approvals/list-by-user?order_by=send_date&order=desc&status=aguardando_voce&per_page=10&page=1&reference_date=send_date
```

**Parâmetros**:
- `status`: "aguardando_voce" | "aguardando_outros" | "aprovado" | "reprovado" | "pago"
- `order_by`: "send_date" | "amount" | "description"
- `order`: "asc" | "desc"
- `reference_date`: "send_date" | "created_at"
- `per_page` / `page`: paginação

**Resposta**:
```json
{
  "success": true,
  "current_page": 1,
  "data": [{
    "id": 112960665,
    "description": "FATURA 08/2026",
    "amount": 1434.85,
    "approval_status": "AGUARDANDO_VOCE",
    "approval_details": {
      "approval_flow_steps": { "total": 2, "completed": 0 },
      "days_awaiting": 0,
      "days_since_status": null
    },
    "user": { "id": 896358, "name": "THIAGO PEREIRA DE LIMA" },
    "report": {
      "id": 11107695, "uuid": "fc3efe21-...",
      "description": "FATURA 08/2026",
      "status": "ENVIADO",
      "sent_for_approval_at": "2026-07-29T19:11:43.000000Z",
      "created_at": "2026-07-29T18:39:21.000000Z"
    },
    "currency": { "id": 20, "symbol": "R$", "iso_code": "BRL" }
  }]
}
```

#### 2.2. Detalhe da aprovação
```
GET https://api.vexpenses.com/web/approvals/{approval_id}
```
**Retorna**: id, description, amount, report (com uuid, status, has_travel_expenses, has_refund, advance_payment, advance_resume), currency, approval_status, approval_details (approval_flow_steps com total/completed, days_awaiting, approval_comment), user, has_canceled_travel

#### 2.3. Resumo/sumário da aprovação
```
GET https://api.vexpenses.com/web/approvals/{approval_id}/summary
```
**Retorna**:
```json
{
  "total": 1434.85,
  "count": 8,
  "summary_by_type": [
    { "description": "MATERIAL", "value": 1134.85, "kilometrage_value": null },
    { "description": "PRESTAÇÃO DE SERVIÇO", "value": 300, "kilometrage_value": null }
  ],
  "summary_by_payment_method": [
    { "description": "Cartão Corporativo Itaú", "value": 1434.85 }
  ],
  "summary_by_reimbursable": {
    "non_reimbursable": { "value": 1434.85 }
  },
  "summary_by_expense_status": []
}
```

#### 2.4. Quantidade por status
```
GET https://api.vexpenses.com/web/approvals/quantity-per-status
```
**Retorna**:
```json
{
  "data": [
    { "count": 14, "status": "AGUARDANDO_VOCE" },
    { "count": 67, "status": "AGUARDANDO_OUTROS" },
    { "count": 6947, "status": "APROVADO" },
    { "count": 150, "status": "REPROVADO" },
    { "count": 0, "status": "PAGO" }
  ]
}
```

#### 2.5. Resumo de valores
```
GET https://api.vexpenses.com/web/approvals/value-resume
```
**Retorna**:
```json
{
  "total_amount": 13486872.83,
  "approved_amount": 12974331.49,
  "waiting_approval_amount": 295875.02,
  "reimbursable_amount": 3246.75,
  "currency": { "id": 20, "symbol": "R$", "iso_code": "BRL" }
}
```

### Como podemos usar
- **`quantity-per-status` + `value-resume`**: KPIs no topo do dashboard
- **`list-by-user`**: Substituir scraping admin por chamada API direta
- **`approval_details.approval_flow_steps`**: Mostrar "Etapa 1 de 2" no dashboard
- **`days_awaiting`**: Alertar relatórios parados há muitos dias
- **`summary`**: Mostrar breakdown por tipo/forma de pagamento antes de aprovar

---

## 3. Alertas do Painel de Gestão

### Endpoints confirmados

#### 3.1. Usuários sem fluxo de aprovação
```
GET https://api.vexpenses.com/web/alerts/users-without-entity
```
**Retorna**: Lista de usuários sem entidade/fluxo configurado (ex: JOCAFER DUTRA DE LIMA, LUAN DOS SANTOS LACERDA)

#### 3.2. Relatórios sem aprovação há mais de 10 dias
```
GET https://api.vexpenses.com/web/alerts/reports-without-approval
```
**Retorna**: Lista de relatórios com título, usuário e valor (ex: 21 relatórios pendentes)

#### 3.3. Relatórios aguardando confirmação de pagamento
```
GET https://api.vexpenses.com/web/alerts/not-paid-reports
```
**Retorna**: 6972 relatórios aprovados mas não pagos, com título, usuário e valor

### Como podemos usar
- **Dashboard de gestão**: Seção de alertas com contadores e listas
- **Notificação proativa**: Avisar sobre relatórios parados
- **Gestão de pagamentos**: Acompanhar relatórios aprovados não pagos

---

## 4. Parâmetros de Configuração

### Endpoint confirmado
```
GET https://api.vexpenses.com/web/parameters/expenses
```

**Retorna** (campos-chave para nossa automação):
```json
{
  "uses_advance": false,
  "uses_exchange": "FORMA_DE_PAGAMENTO",
  "uses_checking_account": true,
  "uses_invoice_reconciliation": true,
  "uses_observation_attachment": true,
  "allow_add_manual_route": true,
  "allow_expense_with_negative_value": true,
  "is_obs_mandatory": true,
  "is_project_mandatory": true,
  "is_payment_method_mandatory": true,
  "is_expense_description_mandatory": true,
  "policy_type": "USUARIO",
  "company_fields": {
    "company_fields": {
      "expense_cost_center": "Centro de Custos",
      "expense_payment_method": "Forma de Pagamento",
      "expense_project": "Regional",
      "report_cost_center": "Centro de Custos"
    },
    "company_uses_fields": true
  },
  "default_currency": { "company": 20 },
  "company_approval_type": "USUARIO",
  "allows_create_expense": true,
  "allows_edit_expense": true
}
```

### Como podemos usar
- **`uses_advance: false`**: Confirma que EQS não usa adiantamento via VExpenses
- **`policy_type: "USUARIO"`**: Políticas são por usuário, não por empresa
- **`company_approval_type: "USUARIO"`**: Aprovação é por usuário, não por fluxo fixo
- **`uses_invoice_reconciliation: true`**: Confirma que conciliação de faturas está ativa

---

## 5. Formas de Pagamento

### Endpoint confirmado
```
GET https://api.vexpenses.com/web/payment-methods/list-by-user
```

**Retorna**:
```json
{
  "data": [
    { "id": 627399, "description": "Dinheiro", "refundable": false, "usesExchange": false, "required_advance": false, "active": false },
    { "id": 627400, "description": "Cartão Pessoal", "refundable": true, "usesExchange": false, "active": false },
    { "id": 627401, "description": "Cartão Corporativo Itaú", "refundable": false, "active": true,
      "parameters": { "blocks_route_editing": false, "blocks_route_deletion": false, "hide_for_user": false } }
  ]
}
```

### Como podemos usar
- **`refundable`**: Identificar despesas reembolsáveis vs não-reembolsáveis
- **`parameters.blocks_route_editing`**: Se true, não permitir edição de rota
- **`active`**: Filtrar apenas formas de pagamento ativas

---

## 6. API v3/pay — Cartões e Saldos

### Endpoints confirmados

#### 6.1. Saldo da empresa
```
GET https://api.vexpenses.com/v3/pay/company/balance
```
**Retorna**: `{ "amount": 25896.23 }`

#### 6.2. Dados da empresa
```
GET https://api.vexpenses.com/v3/pay/company/authenticated
```
**Retorna**:
```json
{
  "id": "44fc5c1d-5796-4725-80c4-40a947285543",
  "withdrawal_limit": 1000,
  "account_holder": {
    "document_number": "80464753000197",
    "kyc_status": "APPROVED",
    "legal_name": "EQS ENGENHARIA S.A"
  },
  "features": {
    "spending_controls": true,
    "virtual_card": true,
    "pix_out": true,
    "card_group": true,
    "smart_allocation": false
  }
}
```

#### 6.3. Usuário autenticado (v3)
```
GET https://api.vexpenses.com/v3/pay/users/authenticated
```
**Retorna**: id, type ("ACCOUNT_MANAGER" | "MANAGER"), name, manager, card_group_manager, is_card_holder, card_holder

#### 6.4. Todas as contas/cartões
```
GET https://api.vexpenses.com/v3/pay/v2/app/accounts
```
**Retorna**: Lista de contas com:
- `user_id`, `user_name`
- `account.id`, `account.status` ("ACTIVE"), `account.card_number` (últimos 4 dígitos)
- `account.card_status` ("BLOCKED" | "ACTIVE")
- `account.card_lock_level` ("MANAGER" | null)
- `account.has_virtual_card`
- `account.balances[]` (id, description)
- `account.type` ("CORP_PERSONAL")

#### 6.5. Grupos de cartões
```
GET https://api.vexpenses.com/v3/pay/v2/app/card-groups/
```
**Retorna**: Grupos: ADMINISTRATIVO, COMERCIAL, DIRETORIA, FINANCEIRO (com id, balance_id, account_aggregation_id)

#### 6.6. Saldo alocado por grupo
```
GET https://api.vexpenses.com/v3/pay/v2/app/card-groups/allocated-balance
```

#### 6.7. Admins de grupos de cartão
```
GET https://api.vexpenses.com/v3/pay/v2/app/card-group-admins?limit=100
```
**Retorna**: 35 administradores de grupos de cartão com id e name

#### 6.8. Cartões expirando
```
GET https://api.vexpenses.com/v3/pay/v2/app/accounts/card/expiring-soon
```

#### 6.9. Extrato Excel (já conhecido)
```
GET https://api.vexpenses.com/v3/pay/statement/excel-all?start_date=2026-07-01&end_date=2026-07-15
```
**Retorna**: `{ "url": "https://s3-vex-vexprod-app.s3.us-east-1.amazonaws.com/pay/statements/xxx.xlsx", "expires_in": "2026-08-30 10:05:50" }`

### Como podemos usar
- **`company/balance`**: Mostrar saldo total da empresa no dashboard
- **`v2/app/accounts`**: Listar todos os cartões com status e saldo
- **`card_status: BLOCKED`**: Alertar sobre cartões bloqueados
- **`card_groups`**: Mostrar saldo por grupo (ADMINISTRATIVO, COMERCIAL, etc.)
- **`card-group-admins`**: Mapear quem é gestor de cada grupo

---

## 7. Análises de Despesas

### Endpoint confirmado
```
POST https://api.vexpenses.com/web/analysis/users/header
Content-Type: application/json
```

**Request body**:
```json
{
  "cost_centers": [],
  "date_to_consider": "expense_created_at",
  "final_date": "2026-07-30",
  "initial_date": "2026-07-23",
  "payment_type": "2",
  "projects": [],
  "report_codes": [],
  "users": [],
  "top_five": true
}
```

**Parâmetros**:
- `date_to_consider`: "expense_created_at" | "expense_date"
- `payment_type`: "1" (reembolsável) | "2" (não reembolsável) | "3" (ambos)
- `cost_centers[]`, `projects[]`, `users[]`, `report_codes[]`: Filtros opcionais (UUIDs)
- `top_five`: true para top 5, false para todos

**Resposta**:
```json
{
  "data": [
    {
      "name": "CHARLYTON COSTA ANDRADE",
      "total_reports": 3,
      "total_expenses": 106,
      "average_per_expense": "92.74",
      "sum_refundable": "0.00",
      "sum_no_refundable": "9829.98",
      "total": "9829.98",
      "department_position": null
    }
  ]
}
```

### Como podemos usar
- **Ranking de gastos**: Top 5 usuários por período no dashboard
- **Tendências**: Comparar períodos quinzenais
- **Filtro por centro de custo**: Análise por regional

---

## 8. Smart Reports (Relatórios Personalizados)

### Endpoints confirmados
```
GET https://api.vexpenses.com/web/smart-reports?page=1&per_page=10&order_by=name
GET https://api.vexpenses.com/web/smart-reports/favorites?page=1&per_page=10
```
**Retorna**: Lista de relatórios personalizados salvos (atualmente vazio para EQS)

### Como podemos usar
- Potencial para criar relatórios pré-configurados se a API permitir POST

---

## 9. Metabase Embedded Analytics

### Endpoint confirmado
```
POST https://api.vexpenses.com/web/metabase/embed
Content-Type: application/json
```

**Request body**:
```json
{
  "dashboard_id": 5,
  "params": { "company_uuid": ["44fc5c1d-5796-4725-80c4-40a947285543"] },
  "scope": "expenses"
}
```

**Resposta**:
```json
{
  "data": {
    "iframe_url": "https://expenses-metabase.vexpenses.com/embed/dashboard/eyJ0eXAi..."
  }
}
```

### Como podemos usar
- **Descoberta**: VExpenses usa Metabase internamente para analytics
- O `iframe_url` é um JWT com expiry — pode ser embedded em nossa dashboard
- Parâmetros: `centro_de_custos`, `data`, `moeda`, `projetos`, `status`
- **Limitação**: O JWT expira, precisaríamos renovar via POST

---

## 10. Permissões de Terceirização (Outsourcing)

### Endpoint confirmado
```
GET https://api.vexpenses.com/web/outsourcing-permissions/list-by-user
```

**Retorna**: Lista de diretores com permissões:
```json
{
  "director_id": 1073268,
  "director_name": "VANDERLEI DOS SANTOS",
  "permissions": ["EXPENSES", "REPORTS", "SEND_REPORT_FOR_APPROVAL", "CONCILIATION", "WITHDRAWALS_ADVANCE", "CARDS"]
}
```

### Permissões disponíveis
- `EXPENSES`: Gerenciar despesas
- `REPORTS`: Gerenciar relatórios
- `SEND_REPORT_FOR_APPROVAL`: Enviar para aprovação
- `CONCILIATION`: Acessar conciliações
- `WITHDRAWALS_ADVANCE`: Gerenciar saques/adiantamentos
- `CARDS`: Gerenciar cartões

### Como podemos usar
- **Mapear gestores**: Saber quem pode aprovar, conciliar, gerenciar cartões
- **Validar permissões**: Verificar se um usuário tem permissão antes de executar ação

---

## 11. Notificações

### Endpoint confirmado
```
GET https://notification.vexpenses.com/notifications/{user_uuid}?page=1&sort=desc
```
**Autenticação**: Cookie Laravel token

**Retorna**: Lista de notificações do usuário (page, sort)

### Como podemos usar
- **Polling de notificações**: Verificar se há novas notificações de aprovação/reprovação
- **Integração com alertas**: Mostrar notificações não lidas no dashboard

---

## 12. Adiantamentos (Advances)

### Endpoint confirmado
```
GET https://api.vexpenses.com/web/advances/list-by-user
```
**Retorna**: `{ "data": [] }` (vazio — EQS não usa adiantamentos via VExpenses)

### Relatório de Saques (admin)
- URL: `app.vexpenses.com/admin/conta-corrente/relatorio-saque`
- Server-side rendered, com filtros e Excel export

### Extrato de conta-corrente (admin)
- URL: `app.vexpenses.com/admin/conta-corrente/extrato-conta-corrente`
- Server-side rendered

### Página de Saques/Adiantamentos (usuário)
- URL: `app.vexpenses.com/saques`
- Mostra estornos de relatórios reprovados com valor e data
- Saldo do dia calculado automaticamente

---

## 13. Relatórios — Detalhe via API web

### Endpoint confirmado
```
GET https://api.vexpenses.com/web/reports/{report_id}
```

**Retorna**:
```json
{
  "data": {
    "id": 11107695,
    "uuid": "fc3efe21-...",
    "status": "ENVIADO",
    "description": "FATURA 08/2026",
    "date": "2026-07-29",
    "can_delete": false,
    "can_edit": false,
    "can_reopen": false,
    "can_submit_to_approval": false,
    "has_fuel_alert": false,
    "has_refund": false,
    "is_advance_required": false,
    "approval_flow": { "linked": true, "type": "user" },
    "currency": { "id": 20, "symbol": "R$", "iso_code": "BRL" },
    "costs_center": { "id": 1861298, "nome": "CLARO INFRA NORDESTE" }
  }
}
```

### Campos úteis
- **`can_delete` / `can_edit` / `can_reopen`**: Permissões do usuário atual
- **`has_fuel_alert`**: Alerta de combustível
- **`has_refund`**: Tem reembolso vinculado
- **`approval_flow.linked`**: Se tem fluxo de aprovação configurado

---

## 14. Estrutura Completa do Menu Gestão

### Mapeamento completo (confirmado via UI)

**Painel de controle**:
- Alertas (`/admin/dashboard-alertas`)
- Gráficos (`/admin/dashboard-graficos`) — usa Metabase embed

**Cartões VExpenses**:
- Relatório Cartão VExpenses (`/admin/cartoes/relatorio-despesas-cartoes`)
- Relatório de Valores Disponibilizados (`/admin/cartoes/relatorio-valores`)

**Relatórios**:
- Despesas por Usuário (`/admin/relatorio-usuarios`)
- Despesas por Projetos (`/admin/relatorio-projetos`)
- Despesas por Tipo (`/admin/relatorio-tipos`)
- Despesas por Centros de Custo (`/admin/relatorio-centros-custo`)
- Despesas por Forma de Pagamento (`/admin/relatorio-formas-pagamento`)
- Acompanhamento de Aprovações (`/admin/relatorio-acompanhamento-aprovacao`)
- **Relatório Horus** (`/admin/relatorio-horus`)

**Pagamentos**:
- Confirmar pagamento dos reembolsos (`/admin/pagamentos`)
- Extrato de Pagamentos (`/admin/pagamentos/extrato`)

**Conciliações**:
- Gestão de Faturas (`/admin/conciliacoes/encerrar-fatura`)
- Relatório de Conciliações (`/admin/conciliacoes/relatorio`)

**Conta Corrente**:
- Relatório de Saques (`/admin/conta-corrente/relatorio-saque`)
- Extrato de conta-corrente (`/admin/conta-corrente/extrato-conta-corrente`)
- Gestão de contas-correntes (`/admin/conta-corrente`)

**Outros**:
- Reprovar Relatórios (`/admin/reprovar-relatorios`)
- Importação de Arquivos (`/admin/importacao`)

---

## 15. Conciliação de Faturas

### O que é
A VExpenses tem conciliação de faturas de cartão corporativo:
- Importa faturas do banco
- Faz matching automático: despesa lançada ↔ transação da fatura
- Status: Importado → Parcialmente Conciliado → Conciliado → Não Necessário
- Filtros: Data Inicial, Data Final, Status

### Página do usuário
- URL: `app.vexpenses.com/conciliacoes`
- Mostra faturas com filtros de data e status
- Atualmente: "Não há faturas para as condições aplicadas aos filtros"

### Páginas admin
- Gestão de Faturas: `app.vexpenses.com/admin/conciliacoes/encerrar-fatura`
- Relatório de Conciliações: `app.vexpenses.com/admin/conciliacoes/relatorio`

### Como podemos usar
- **Detecção de despesas não conciliadas**: Cross-check entre valor lançado e valor da fatura
- **Não está na API v2** — é feature da plataforma web (server-side rendered)
- Acessível via scraping com Laravel token

---

## 16. Outros Endpoints Confirmados

### Moedas
```
GET https://api.vexpenses.com/web/currencies/list-by-company
```

### Notícias/Anúncios
```
GET https://api.vexpenses.com/web/news
```
**Retorna**: `{ id, image_url, link }` (ex: workshop da VExpenses)

### OAuth user (v3)
```
GET https://api.vexpenses.com/v3/oauth/user
```
**Retorna**: Dados da sessão OAuth atual

---

## 17. Acompanhamento de Aprovação (Excel admin)

### Como já usamos
- `app/api/aprovacao-dinamica/pending/route.ts` já faz scraping de `app.vexpenses.com/admin/relatorio-acompanhamento-aprovacao/excel`
- Extrai o `waitingStep` (em qual etapa o relatório está parado)

### Melhorias possíveis com novos endpoints
- **Substituir scraping pela API web**: Usar `GET /web/approvals/list-by-user` em vez de scraping Excel
- **`approval_details.approval_flow_steps`**: Já traz total/completed — mostra etapa atual
- **`days_awaiting`**: Calcular SLA sem precisar do Excel
- **`summary`**: Breakdown por tipo e forma de pagamento sem processar expenses

---

## Resumo: Features que podemos integrar

### Prioridade Alta (impacto direto, baixo esforço)
| Feature | Endpoint | Esforço | Impacto |
|---------|----------|---------|---------|
| **Hórus por relatório** | `GET /web/approvals/{id}/inconsistencies` | Baixo | Alto — detecta fraudes antes de aprovar |
| **KPIs de aprovação** | `GET /web/approvals/quantity-per-status` + `value-resume` | Baixo | Alto — métricas em tempo real |
| **Lista de aprovações** | `GET /web/approvals/list-by-user` | Baixo | Alto — substitui scraping Excel |
| **Sumário por relatório** | `GET /web/approvals/{id}/summary` | Baixo | Médio — breakdown antes de aprovar |
| **Alertas de gestão** | `GET /web/alerts/*` | Baixo | Médio — alertas proativos |

### Prioridade Média (impacto direto, esforço médio)
| Feature | Endpoint | Esforço | Impacto |
|---------|----------|---------|---------|
| **Relatório Hórus Excel** | POST `/admin/relatorio-horus` (scraping) | Médio | Alto — auditoria completa de duplicidades |
| **Análise de despesas** | `POST /web/analysis/users/header` | Médio | Médio — ranking e tendências |
| **Saldos de cartões** | `GET /v3/pay/v2/app/accounts` + `card-groups` | Médio | Médio — monitoramento de cartões |
| **Parâmetros da empresa** | `GET /web/parameters/expenses` | Baixo | Médio — configuração de validações |
| **Permissões de gestores** | `GET /web/outsourcing-permissions/list-by-user` | Baixo | Médio — mapear quem pode o quê |

### Prioridade Baixa (exploração futura)
| Feature | Endpoint | Esforço | Impacto |
|---------|----------|---------|---------|
| **Metabase embed** | `POST /web/metabase/embed` | Alto | Médio — analytics visual |
| **Notificações** | `GET notification.vexpenses.com/notifications/{uuid}` | Médio | Baixo — polling de notificações |
| **Conciliação de faturas** | Scraping admin | Alto | Médio — valida cartão corporativo |
| **Smart Reports** | `GET /web/smart-reports` | Baixo | Baixo — relatórios personalizados |

---

## Próximos passos recomendados

1. **Integrar Hórus na aprovação** — Chamar `GET /web/approvals/{id}/inconsistencies?include_horus_details=true&include_expenses=true` para cada relatório pendente e mostrar duplicidades no dashboard
2. **Substituir scraping por API web** — Usar `GET /web/approvals/list-by-user` em vez do scraping Excel admin para listar aprovações pendentes
3. **Adicionar KPIs no dashboard** — `quantity-per-status` + `value-resume` para métricas em tempo real
4. **Mapear alertas de gestão** — Integrar `GET /web/alerts/*` para mostrar alertas proativos
5. **Scraping do Excel Hórus** — Acessar `app.vexpenses.com/admin/relatorio-horus` com Laravel token, exportar Excel quinzenal
6. **Integrar análise de despesas** — `POST /web/analysis/users/header` para ranking de gastos por período
7. **Monitorar cartões** — `GET /v3/pay/v2/app/accounts` para status e saldos de cartões
