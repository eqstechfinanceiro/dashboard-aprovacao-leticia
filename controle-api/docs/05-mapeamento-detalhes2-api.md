# Mapeamento de Colunas Detalhes2 → API VExpenses

## Visão Geral

Este documento mapeia todas as 29 colunas da tabela `controle_detalhes2` para os respectivos endpoints e campos da API VExpenses v2.

**Nota:** A tabela `controle_detalhes2` tem a mesma estrutura que `controle_detalhes1`. O mapeamento é idêntico.

## Estratégia de Acesso

**Endpoint Principal:** `/v2/expenses` com includes aninhados
**Endpoint Secundário:** `/v2/reports` para dados de relatórios
**Endpoint Terciário:** `/v2/projects` para mapeamento de projetos

## Mapeamento Completo

| Coluna Detalhes2 | Endpoint API | Campo API | Include Necessário | Observações |
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
| `status` | `/v2/expenses` | `report.status` | `include=report` | Status do relatório (APROVADO, REPROVADO, etc) |
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

## Resumo

- **29 de 29 colunas** têm correspondência na API (100% mapeado)
- Mapeamento idêntico ao Detalhes1
- Usa os mesmos checks de `shared.py`
