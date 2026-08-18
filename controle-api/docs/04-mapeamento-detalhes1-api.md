# Mapeamento de Colunas Detalhes1 → API VExpenses

## Visão Geral

Este documento mapeia todas as 29 colunas da tabela `controle_detalhes1` para os respectivos endpoints e campos da API VExpenses v2.

## Estratégia de Acesso

**Endpoint Principal:** `/v2/expenses` com includes aninhados
**Endpoint Secundário:** `/v2/reports` para dados de relatórios
**Endpoint Terciário:** `/v2/projects` para mapeamento de projetos

## Mapeamento Completo

| Coluna Detalhes1 | Endpoint API | Campo API | Include Necessário | Observações |
|------------------|---------------|-----------|-------------------|-------------|
| `id_da_despesa` | `/v2/expenses` | `expenses.id` | - | ID direto da despesa |
| `id_do_relatório` | `/v2/reports` | `reports.id` | - | ID do relatório vinculado |
| `nome_do_relatório` | `/v2/reports` | `reports.description` | - | Nome/descrição do relatório |
| `data` | `/v2/expenses` | `expenses.date` | - | Data da despesa (YYYY-MM-DD) |
| `nome_do_membro_de_equipe` | `/v2/expenses` | `user.name` | `include=user` | Nome do usuário via expenses.user |
| `banco` | `/v2/expenses` | `user.bank` | `include=user` | Banco do usuário |
| `agência` | `/v2/expenses` | `user.agency` | `include=user` | Agência bancária |
| `conta` | `/v2/expenses` | `user.account` | `include=user` | Número da conta |
| `pix` | `/v2/expenses` | `user.pix_key` | `include=user` | Chave PIX |
| `cpf_cnpj` | `/v2/expenses` | `user.cpf` | `include=user` | CPF/CNPJ do usuário |
| `status` | `/v2/expenses` | `expenses.status` | - | Status da despesa (APROVADO, REPROVADO, etc) |
| `data_de_pagamento` | `/v2/expenses` | `expenses.payment_date` | - | Data de pagamento |
| `descrição_da_despesa` | `/v2/expenses` | `expenses.title` | - | Título/descrição da despesa |
| `tipo_de_despesa` | `/v2/expenses` | `expense_type.description` | `include=expense_type` | Tipo de despesa (ALMOÇO, HOSPEDAGEM, etc) |
| `reembolsável` | `/v2/expenses` | `expenses.reimbursable` | - | Booleano (true/false) |
| `anotação_da_despesa` | `/v2/expenses` | `expenses.observation` | - | Observação da despesa |
| `anotação_de_rateio` | `/v2/expenses` | `apportionment.description` | `include=apportionment` | Descrição do rateio |
| `centro_de_custos` | `/v2/expenses` | `costs_center.description` | `include=costs_center` | Centro de custo |
| `forma_de_pagamento` | `/v2/expenses` | `payment_method.description` | `include=payment_method` | Método de pagamento (Cartão, Pix, etc) |
| `projeto` | `/v2/projects` | `projects.name` | Via `apportionment.reimbursable_company_id` | Nome do projeto (requer join) |
| `percentual_de_projeto` | `/v2/expenses` | `apportionment.percentage` | `include=apportionment` | Percentual de rateio (ex: "100.00") |
| `início_do_percurso_por_gps` | `/v2/expenses` | `gps.start_location` | `include=gps` | Localização inicial (quando disponível) |
| `fim_do_percurso_por_gps` | `/v2/expenses` | `gps.end_location` | `include=gps` | Localização final (quando disponível) |
| `valor_do_km` | `/v2/expenses` | `gps.mileage_value` | `include=gps` | Valor por km (quando disponível) |
| `kilômetros_percorridos` | `/v2/expenses` | `gps.mileage` | `include=gps` | Quilometragem (quando disponível) |
| `moeda_do_relatório` | `/v2/expenses` | `expenses.original_currency_iso` | - | Moeda da despesa (BRL, USD, etc) - padrão BRL |
| `valor` | `/v2/expenses` | `expenses.value` | - | Valor da despesa |
| `mês` | `/v2/expenses` | `expenses.date` | - | Extraído do campo date (MM/YYYY) |
| `cpf` | `/v2/expenses` | `user.cpf` | `include=user` | CPF do usuário (duplicado) |

## Endpoints e Includes

### Endpoint Principal: Expenses

```bash
GET /v2/expenses?include=user,costs_center,payment_method,expense_type,report,apportionment,gps,fueling,project
```

**Includes Disponíveis:**
- `user` - Dados do usuário (nome, cpf, banco, agência, conta, pix)
- `costs_center` - Centro de custo
- `payment_method` - Método de pagamento
- `expense_type` - Tipo de despesa
- `report` - Relatório vinculado
- `apportionment` - Rateio (projeto, percentual)
- `gps` - Dados GPS (início, fim, km, valor/km)
- `fueling` - Dados de abastecimento
- `project` - Projeto (quando disponível)

### Endpoint Secundário: Reports

```bash
GET /v2/reports?include=user,expenses
```

**Campos Disponíveis:**
- `id` - ID do relatório
- `description` - Nome do relatório
- `status` - Status do relatório
- `payment_date` - Data de pagamento
- `pdf_link` - Link para PDF
- `excel_link` - Link para Excel
- `user` - Dados do usuário

### Endpoint Terciário: Projects

```bash
GET /v2/projects
```

**Campos Disponíveis:**
- `id` - ID do projeto
- `name` - Nome do projeto
- `on` - Status ativo/inativo

## Estratégia de Busca

### Por Data (Quinzena)

```bash
GET /v2/expenses?search=date:2026-02-01,2026-02-28&searchFields=date:between&include=user,costs_center,payment_method,expense_type,report,apportionment,gps&paginate=true&page=1&per_page=200
```

### Por Usuário

```bash
GET /v2/expenses?search=user_id:1117250&searchFields=user_id:=&include=user,costs_center,payment_method,expense_type,report,apportionment,gps&paginate=true&page=1&per_page=200
```

### Por Relatório

```bash
GET /v2/reports?search=id:9525233&searchFields=id:=&include=user,expenses&paginate=false&per_page=1
```

## Limitações Conhecidas

### Endpoint `/v2/expenses` por ID
- **Status:** Retorna 502 Bad Gateway ou 500 Internal Server Error
- **Workaround:** Buscar por data ou usuário em vez de ID específico

### Endpoint `/v2/reports` com include=expenses
- **Status:** Retorna erro de memória (512MB exhausted)
- **Workaround:** Buscar reports sem expenses, depois buscar expenses separadamente

### Dados GPS
- **Status:** Poucas despesas têm dados GPS
- **Observação:** Campos GPS geralmente vazios

### Dados de Projeto
- **Status:** Não disponível diretamente em expenses
- **Workaround:** Usar `apportionment.reimbursable_company_id` para buscar em `/v2/projects`

## Campos Não Mapeados

**Nenhum campo não mapeado.** Todas as 29 colunas do Detalhes1 têm correspondência na API.

## Campos com Dados Vazios na API

Os seguintes campos existem na API mas geralmente retornam vazios/nulos:

- `início_do_percurso_por_gps` - Campo existe via `include=gps` (gps.start_location), mas **0 despesas** têm dados GPS preenchidos
- `fim_do_percurso_por_gps` - Campo existe via `include=gps` (gps.end_location), mas **0 despesas** têm dados GPS preenchidos
- `valor_do_km` - Campo existe via `include=gps` (gps.mileage_value), mas **0 despesas** têm dados GPS preenchidos
- `kilômetros_percorridos` - Campo existe via `include=gps` (gps.mileage), mas **0 despesas** têm dados GPS preenchidos

**Resumo:** Os campos GPS existem na estrutura da API (via include=gps), mas os dados não são preenchidos pelas despesas. Isso é uma limitação dos dados, não da API.

## Exemplo de Requisição Completa

```bash
curl -H "Authorization: YOUR_API_KEY" \
  "https://api.vexpenses.com/v2/expenses?search=date:2026-02-01,2026-02-28&searchFields=date:between&include=user,costs_center,payment_method,expense_type,report,apportionment,gps&paginate=true&page=1&per_page=200"
```

## Resumo

- **29 de 29 colunas** têm correspondência na API (100% mapeado)
- **4 colunas existem mas dados vazios:** Campos GPS (início, fim, valor/km, km) - estrutura existe via `include=gps`, mas despesas não preenchem esses dados
- **3 endpoints** principais utilizados
- **9 includes** disponíveis em expenses
- **Limitações:** Endpoint expenses por ID instável, reports com expenses causa erro de memória

**Conclusão:** É possível obter **todas as 29 colunas** automaticamente via API. O campo `moeda_do_relatório` é mapeado para `expenses.original_currency_iso` (padrão BRL). Os campos GPS existem na estrutura da API, mas os dados não são preenchidos pelas despesas (limitação dos dados, não da API).
