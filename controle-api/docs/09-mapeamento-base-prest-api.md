# Mapeamento: controle_base_prestacoes → VExpenses API

## Visão Geral

A tabela `controle_base_prestacoes` contém dados detalhados de despesas (expenses) da VExpenses API.

## Mapeamento de Colunas

| Coluna (Banco) | Campo API | Endpoint | Includes | Observações |
|----------------|-----------|-----------|----------|-------------|
| id_da_despesa | expense.id | /v2/expenses/{id} | - | ID único da despesa |
| id_do_relatório | report.id | /v2/reports/{id} | - | ID do relatório |
| nome_do_relatório | report.name | /v2/reports/{id} | - | Nome do relatório |
| data | expense.date | /v2/expenses | - | Data da despesa |
| nome_do_membro_de_equipe | user.name | /v2/team-members | - | Nome do usuário |
| banco | payment_method.bank | /v2/expenses | payment_method | Banco do método de pagamento |
| agência | payment_method.agency | /v2/expenses | payment_method | Agência do método de pagamento |
| conta | payment_method.account | /v2/expenses | payment_method | Conta do método de pagamento |
| pix | payment_method.pix | /v2/expenses | payment_method | PIX do método de pagamento |
| cpf_cnpj | user.cpf | /v2/team-members | - | CPF/CNPJ do usuário |
| status | expense.status | /v2/expenses | - | Status da despesa |
| data_de_pagamento | expense.payment_date | /v2/expenses | - | Data de pagamento |
| descrição_da_despesa | expense.description | /v2/expenses | - | Descrição da despesa |
| tipo_de_despesa | expense_type.name | /v2/expenses | expense_type | Tipo de despesa |
| reembolsável | expense.reimbursable | /v2/expenses | - | Se é reembolsável |
| anotação_da_despesa | expense.notes | /v2/expenses | - | Anotações da despesa |
| anotação_de_rateio | expense.apportionment_notes | /v2/expenses | apportionment | Anotações de rateio |
| centro_de_custos | costs_center.name | /v2/expenses | costs_center | Centro de custos |
| forma_de_pagamento | payment_method.name | /v2/expenses | payment_method | Forma de pagamento |
| projeto | project.name | /v2/expenses | project | Nome do projeto |
| percentual_de_projeto | project.percentage | /v2/expenses | project | Percentual do projeto |
| início_do_percurso_por_gps | expense.gps_start | /v2/expenses | - | Início do percurso GPS |
| fim_do_percurso_por_gps | expense.gps_end | /v2/expenses | - | Fim do percurso GPS |
| valor_do_km | expense.km_value | /v2/expenses | - | Valor por KM |
| kilômetros_percorridos | expense.km_traveled | /v2/expenses | - | KM percorridos |
| moeda_do_relatório | report.currency | /v2/reports/{id} | - | Moeda do relatório |
| valor | expense.value | /v2/expenses | - | Valor da despesa |
| mês | expense.month | /v2/expenses | - | Mês da despesa |
| cpf | user.cpf | /v2/team-members | - | CPF do usuário (duplicado) |
| coluna1 | - | - | - | Coluna vazia/não utilizada |
| colaborador | user.name | /v2/team-members | - | Nome do usuário (duplicado) |

## Endpoint Principal

**GET /v2/expenses**
- **Includes necessários**: `user,costs_center,payment_method,expense_type,report,apportionment,project`
- **Filtro por período**: `search=date:{start_date},{end_date}&searchFields=date:between`
- **Paginação**: `paginate=true&page={page}&per_page=200`

## Exemplo de Uso

```python
# Buscar despesas por período
expenses = api.get_expenses_by_period(
    start_date="2025-08-01",
    end_date="2025-08-31",
    includes="user,costs_center,payment_method,expense_type,report,apportionment,project"
)

# Acessar dados de uma despesa
expense = expenses[0]
expense_id = expense["id"]
report_id = expense["report"]["id"]
user_name = expense["user"]["name"]
payment_method = expense["payment_method"]["name"]
costs_center = expense["costs_center"]["name"]
```

## Limitações

- Nenhuma limitação conhecida - todos os dados estão disponíveis na API
- Algumas colunas podem estar vazias se não houver dados correspondentes (ex: GPS para despesas não relacionadas a transporte)
