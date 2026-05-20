# Análise Completa das Planilhas e Integração com API VExpenses

## Visão Geral

Este documento apresenta uma análise detalhada das planilhas disponíveis no diretório `data/` e sua relação com os dados disponíveis através da API VExpenses utilizada no dashboard.

---

## Planilha 1: 1QZ ABRIL 2026 - VEXPENSES (1).xlsx

**Tamanho:** 800 KB  
**Formato:** .xlsx (Excel)  
**Objetivo:** Controle de 1ª Quinzena (1QZ) de cartões corporativos VExpenses para Abril 2026

### Abas Disponíveis

#### 1.1. ABA: 1 QZ VEXPENSES 04_2026
- **Linhas totais:** 336
- **Objetivo:** Controle de saldos e cargas da 1ª quinzena de Abril 2026
- **Colunas principais:**
  - PORTADOR (Nome do colaborador)
  - CPF
  - STATUS COLAB (Status do colaborador: ATIVO)
  - CENTRO CUSTO (Centro de custo do colaborador)
  - COD CENTRO CUSTO (Código do centro de custo)
  - GESTOR (Nome do gestor)
  - DIREÇÃO (Nome do diretor)
  - SALDO REEMBOLSAR (Saldo a reembolsar)
  - SALDO FINAL (Saldo final do cartão)
  - 1QZ DE ABRIL 26 (Valor da 1ª quinzena de Abril 2026)
  - SALDO CARTAO (Saldo atual do cartão)
  - ADIANTAMENTO (Valor de adiantamento)
  - CARGA PARCIAL (Carga parcial realizada)
  - REEMBOLSO (Valor reembolsado)
  - CARGA FINAL (Carga final)
  - STATUS DO CARTAO (Status: Cartão ativo)
  - OBS (Observações)

**Relação com API VExpenses:**
- ✅ **PORTADOR** ↔ `TeamMember.name`
- ✅ **CPF** ↔ `TeamMember.cpf`
- ✅ **CENTRO CUSTO** ↔ `CostCenter.name`
- ✅ **GESTOR** ↔ Não disponível diretamente na API
- ✅ **DIREÇÃO** ↔ Não disponível diretamente na API
- ❌ **Saldos (SALDO REEMBOLSAR, SALDO FINAL, etc.)** ↔ Não disponíveis na API (são dados de controle financeiro interno)
- ❌ **1QZ DE ABRIL 26** ↔ Dados de carga específicos não disponíveis na API
- ❌ **STATUS DO CARTAO** ↔ Status do cartão corporativo não disponível na API

#### 1.2. ABA: Planilha3
- **Linhas totais:** 599
- **Objetivo:** Cadastro de usuários/portadores de cartão
- **Colunas principais:**
  - Cobrança
  - Nome
  - E-mail
  - Tipo de usuário (Normal, Intermediário)
  - Status do Cartão (Cartão ativo, Cadastro pendente, Cartão não vinculado)
  - Permissão de Uso (Portador de Cartão)
  - Permissão de Gestão (Sem permissão)
  - Ações

**Relação com API VExpenses:**
- ✅ **Nome** ↔ `TeamMember.name`
- ✅ **E-mail** ↔ `TeamMember.email`
- ✅ **Tipo de usuário** ↔ `TeamMember.user_type`
- ❌ **Status do Cartão** ↔ Não disponível na API
- ❌ **Permissões** ↔ Não disponíveis na API
- ❌ **Cobrança** ↔ Não disponível na API

#### 1.3. ABA: Planilha2
- **Linhas totais:** 542
- **Objetivo:** Similar à Planilha3 - cadastro de usuários
- **Estrutura:** Idêntica à Planilha3

**Relação com API VExpenses:** Mesma que Planilha3

#### 1.4. ABA: Planilha1
- **Linhas totais:** 531
- **Objetivo:** Cadastro de usuários/portadores de cartão (versão mais organizada)
- **Colunas principais:**
  - Cobrança
  - Nome
  - E-mail
  - Tipo de usuário
  - Status do Cartão
  - Permissão de Uso
  - Permissão de Gestão
  - Ações

**Relação com API VExpenses:** Mesma que Planilha3

#### 1.5. ABA: VALIDAÇÃO AGILLITAS
- **Linhas totais:** 313
- **Objetivo:** Validação de cartões junto ao sistema Agillitas
- **Colunas principais:**
  - PORTADOR
  - CPF
  - CARTÃO (Número do cartão)
  - AGILLITAS (Número cartão Agillitas)
  - Situação cpf (ATIVO)
  - situação nome (ATIVO, INATIVO)
  - CARTAO VALIDACAO (AGILLITAS)

**Relação com API VExpenses:**
- ✅ **PORTADOR** ↔ `TeamMember.name`
- ✅ **CPF** ↔ `TeamMember.cpf`
- ❌ **CARTÃO/AGILLITAS** ↔ Dados do cartão físico não disponíveis na API
- ❌ **Situação cpf/nome** ↔ Validações externas não disponíveis na API

---

## Planilha 2: CONTROLE - VEXPENSES - ABRIL- 2026 (1).xlsb

**Tamanho:** 7.9 MB  
**Formato:** .xlsb (Excel Binário)  
**Objetivo:** Controle completo de VExpenses para Abril 2026 - sistema de gestão financeira

### Abas Disponíveis

#### 2.1. ABA: PAINEL
- **Linhas totais:** 718
- **Objetivo:** Painel geral de controle de cartões
- **Colunas principais:**
  - EMPRESA
  - COLABORADOR
  - CPF
  - CHAVE
  - SITUAÇÃO
  - STATUS DO CARTÃO
  - CARTÃO ITAU
  - TERMO
  - REGIONAL
  - CENTRO DE CUSTO
  - GESTOR
  - DIRETOR
  - CARTÃO VEXPENSES
  - CARGA
  - DESCARGA
  - (-) TARIFA
  - (-) PRESTAÇÃO DE CONTAS
  - SALDO PRESTAÇÃO
  - (-) SALDO CARTAO
  - SALDO FINAL
  - 1ª QZ
  - 2ª QZ
  - ADICIONAIS
  - REEMBOLSO
  - CARTÃO CRED. ITAU
  - ITAU
  - ADICIONAL ITAU

**Relação com API VExpenses:**
- ✅ **COLABORADOR** ↔ `TeamMember.name`
- ✅ **CPF** ↔ `TeamMember.cpf`
- ✅ **CENTRO DE CUSTO** ↔ `CostCenter.name`
- ✅ **REGIONAL** ↔ Extraído de `CostCenter.name` (sigla do estado)
- ❌ **Saldos e movimentações financeiras** ↔ Não disponíveis na API
- ❌ **CARTÃO ITAU/VEXPENSES** ↔ Dados de cartões físicos não disponíveis
- ❌ **GESTOR/DIRETOR** ↔ Não disponíveis na API

#### 2.2. ABA: SALDO CARTAO
- **Linhas totais:** 6.989
- **Objetivo:** Histórico detalhado de saldos de cartão
- **Colunas principais:**
  - PORTADOR
  - CPF
  - VALOR
  - DATA
  - MÊS
  - EMPRESA

**Relação com API VExpenses:**
- ✅ **PORTADOR** ↔ `TeamMember.name`
- ✅ **CPF** ↔ `TeamMember.cpf`
- ❌ **VALOR/DATA/MÊS** ↔ Dados de saldo não disponíveis na API

#### 2.3. ABA: ADICIONAIS
- **Linhas totais:** 538
- **Objetivo:** Controle de cargas adicionais (adiantamentos)
- **Colunas principais:**
  - COLABORADOR
  - CPF
  - VALOR
  - DATA
  - MÊS
  - ANO
  - CENTRO DE CUSTO
  - DIRETOR REGIONAL
  - MOTIVO
  - APROVADOR
  - PEDIDO
  - STATUS (APROVADO)
  - VALOR UTILIZADO

**Relação com API VExpenses:**
- ✅ **COLABORADOR** ↔ `TeamMember.name`
- ✅ **CPF** ↔ `TeamMember.cpf`
- ✅ **CENTRO DE CUSTO** ↔ `CostCenter.name`
- ❌ **VALOR/DATA/MÊS** ↔ Dados de cargas adicionais não disponíveis na API
- ❌ **APROVADOR/STATUS** ↔ Fluxo de aprovação interno não disponível
- ❌ **MOTIVO** ↔ Não disponível na API

#### 2.4. ABA: ADICIONAL ITAÚ
- **Linhas totais:** 18
- **Objetivo:** Controle de adicionais para cartões Itaú
- **Colunas principais:**
  - COLABORADOR
  - CPF
  - LIMITE ANTES
  - LIMITE DEPOIS
  - ADICIONADO
  - DATA
  - MÊS
  - CENTRO DE CUSTO
  - DIRETOR REGIONAL
  - MOTIVO
  - APROVADOR

**Relação com API VExpenses:**
- ✅ **COLABORADOR** ↔ `TeamMember.name`
- ✅ **CPF** ↔ `TeamMember.cpf`
- ✅ **CENTRO DE CUSTO** ↔ `CostCenter.name`
- ❌ **Limites e adicionais** ↔ Dados de cartão Itaú não disponíveis

#### 2.5. ABA: QUINZENAS
- **Linhas totais:** 10.148
- **Objetivo:** Controle de quinzenas (1ª QZ e 2ª QZ)
- **Colunas principais:**
  - COLABORADOR
  - CPF
  - VALOR
  - QUINZENA (1ª QZ, 2ª QZ)
  - DATA
  - MÊS
  - ANO
  - REGIONAL
  - OBSERVAÇÃO

**Relação com API VExpenses:**
- ✅ **COLABORADOR** ↔ `TeamMember.name`
- ✅ **CPF** ↔ `TeamMember.cpf`
- ✅ **REGIONAL** ↔ Extraído de `CostCenter.name`
- ❌ **VALOR/QUINZENA/DATA** ↔ Dados de quinzenas não disponíveis na API

#### 2.6. ABA: SALDOS ADM EQS
- **Linhas totais:** 15
- **Objetivo:** Controle de saldos da administração EQS
- **Colunas principais:**
  - COLABORADOR
  - CPF
  - SITUAÇÃO
  - STATUS VEX
  - CENTRO DE CUSTO
  - GESTOR
  - 1QZ_DIRETORIA
  - 2QZ_DIRETORIA
  - TOTAL QZ_2025
  - OBSERVAÇÃO
  - CARGA REALIZADA

**Relação com API VExpenses:**
- ✅ **COLABORADOR** ↔ `TeamMember.name`
- ✅ **CPF** ↔ `TeamMember.cpf`
- ✅ **CENTRO DE CUSTO** ↔ `CostCenter.name`
- ❌ **Saldos e cargas** ↔ Não disponíveis na API

#### 2.7. ABA: EXTRATO
- **Linhas totais:** 15.785
- **Objetivo:** Extrato detalhado de movimentações
- **Colunas principais:**
  - CARGA
  - DESCARGA
  - VALOR
  - DATA

**Relação com API VExpenses:**
- ❌ **CARGA/DESCARGA/VALOR** ↔ Extrato financeiro não disponível na API

#### 2.8. ABA: PAINEL PRESTAÇÕES
- **Linhas totais:** 517
- **Objetivo:** Painel de prestações de contas
- **Colunas principais:**
  - COLABORADOR
  - VALOR

**Relação com API VExpenses:**
- ✅ **COLABORADOR** ↔ `TeamMember.name`
- ✅ **VALOR** ↔ `Expense.value` (parcialmente - soma de despesas)
- ✅ **Prestações de contas** ↔ `Report.status` (APROVADO, REPROVADO, ENVIADO)

#### 2.9. ABA: BASE PREST
- **Linhas totais:** 54.518
- **Objetivo:** Base de dados completa de prestações de contas
- **Colunas principais:**
  - ID da Despesa
  - ID do Relatório
  - Nome do relatório
  - Data
  - Nome do membro de equipe
  - Banco
  - Agência
  - Conta
  - Pix
  - CPF/CNPJ
  - Status
  - Data de Pagamento
  - Descrição da despesa
  - Tipo de Despesa
  - Reembolsável
  - Anotação da Despesa
  - Anotação de Rateio
  - Centro de Custos
  - Forma de pagamento
  - Projeto
  - Percentual de projeto
  - Início do Percurso por GPS
  - Fim do Percurso por GPS
  - Valor do KM
  - Kilômetros Percorridos
  - Moeda do Relatório
  - Valor
  - MÊS
  - CPF
  - colaborador

**Relação com API VExpenses:**
- ✅ **ID da Despesa** ↔ `Expense.id`
- ✅ **ID do Relatório** ↔ `Report.id`
- ✅ **Nome do relatório** ↔ `Report.description`
- ✅ **Data** ↔ `Expense.date`
- ✅ **Nome do membro de equipe** ↔ `TeamMember.name`
- ✅ **Banco/Agência/Conta/Pix** ↔ `TeamMember.bank`, `TeamMember.agency`, `TeamMember.account`, `TeamMember.pix_key`
- ✅ **CPF/CNPJ** ↔ `TeamMember.cpf`
- ✅ **Status** ↔ `Report.status` ou `Expense.on`
- ✅ **Descrição da despesa** ↔ `Expense.title`
- ✅ **Tipo de Despesa** ↔ `ExpenseType.description`
- ✅ **Reembolsável** ↔ `Expense.reimbursable`
- ✅ **Centro de Custos** ↔ `CostCenter.name`
- ✅ **Forma de pagamento** ↔ `PaymentMethod.description`
- ✅ **Projeto** ↔ `Project.name`
- ✅ **Percentual de projeto** ↔ `Apportionment.percentage`
- ✅ **Início/Fim do Percurso por GPS** ↔ `Expense.route_id` (parcial)
- ✅ **Valor do KM/Kilômetros** ↔ `Expense.mileage`, `Expense.mileage_value`
- ✅ **Moeda do Relatório** ↔ `Expense.original_currency_iso`
- ✅ **Valor** ↔ `Expense.value`
- ❌ **MÊS** ↔ Campo derivado (não existe nativamente na API)
- ❌ **Anotações** ↔ `Expense.observation` (parcial)

**IMPORTANTE:** Esta é a aba mais completa e tem **ALTA CORRESPONDÊNCIA** com a API VExpenses. A maioria dos dados aqui pode ser obtida através dos endpoints de Expenses e Reports.

#### 2.10. ABA: REEMBOLSO
- **Linhas totais:** 283
- **Objetivo:** Controle de reembolsos
- **Colunas principais:**
  - COLABORADOR
  - CPF
  - VALOR
  - DATA
  - MÊS
  - CENTRO DE CUSTO
  - DIRETOR REGIONAL
  - MOTIVO

**Relação com API VExpenses:**
- ✅ **COLABORADOR** ↔ `TeamMember.name`
- ✅ **CPF** ↔ `TeamMember.cpf`
- ✅ **CENTRO DE CUSTO** ↔ `CostCenter.name`
- ❌ **VALOR/DATA/MÊS** ↔ Dados de reembolso não disponíveis na API

#### 2.11. ABA: ESTORNO - SAQUE
- **Linhas totais:** 3
- **Objetivo:** Registro de estornos de saques
- **Colunas principais:**
  - COLABORADOR
  - CPF
  - VALOR
  - DATA
  - MÊS
  - CENTRO DE CUSTO
  - DIRETOR REGIONAL
  - MOTIVO (ESTORNO SAQUE VEXPENSES)

**Relação com API VExpenses:**
- ✅ **COLABORADOR** ↔ `TeamMember.name`
- ✅ **CPF** ↔ `TeamMember.cpf`
- ✅ **CENTRO DE CUSTO** ↔ `CostCenter.name`
- ❌ **Estornos** ↔ Não disponíveis na API

#### 2.12-2.14. ABAS: Detalhes1, Detalhes2, Detalhes3
- **Linhas totais:** 14, 14, 14 (respectivamente)
- **Objetivo:** Detalhes específicos de relatórios
- **Estrutura:** Dados detalhados por relatório/colaborador

**Relação com API VExpenses:**
- ✅ **Dados de relatórios** ↔ `Report` com include `expenses`

#### 2.15. ABA: AUX
- **Objetivo:** Tabela auxiliar (dados não especificados na análise)

---

## Dados Disponíveis na API VExpenses

### Entidades Principais

#### 1. TeamMembers (Membros da Equipe)
- `id`, `name`, `email`, `cpf`
- `phone1`, `phone2`, `birth_date`
- `bank`, `agency`, `account`, `pix_key`
- `user_type`, `active`, `confirmed`
- `costsCenters[]` (centros de custo associados)
- `projects[]` (projetos associados)

#### 2. CostCenters (Centros de Custo)
- `id`, `name`, `integration_id`
- `on` (ativo/inativo)

#### 3. Projects (Projetos)
- `id`, `name`, `company_name`, `cnpj`
- `address`, `city`, `state`, `zip_code`
- `phone1`, `phone2`

#### 4. Expenses (Despesas)
- `id`, `user_id`, `expense_id`, `report_id`
- `date`, `value`, `title`
- `expense_type_id`, `payment_method_id`
- `receipt_url`, `observation`
- `reimbursable`, `on` (ativo)
- `mileage`, `mileage_value` (para km)
- `original_currency_iso`, `exchange_rate`, `converted_value`
- `apportionment[]` (rateios)
- Relacionamentos: `user`, `expense_type`, `costs_center`, `payment_method`, `report`

#### 5. Reports (Relatórios)
- `id`, `description`, `user_id`
- `status` (ABERTO, APROVADO, REPROVADO, REABERTO, PAGO, ENVIADO)
- `approval_user_id`, `approval_date`
- `payment_date`, `observation`
- `pdf_link`, `excel_link`
- Relacionamentos: `user`, `expenses`, `payment_method`, `advance`

#### 6. ExpenseTypes (Tipos de Despesa)
- `id`, `description`, `on`

#### 7. PaymentMethods (Formas de Pagamento)
- `id`, `name`, `description`
- `reimbursable`, `affects_advance`

#### 8. ApprovalFlows (Fluxos de Aprovação)
- `id`, `description`, `steps[]`
- Cada step tem: `operator`, `entrance_value`, `order`, `groups[]`

#### 9. Advances (Adiantamentos)
- `id`, `description`, `advance_user_id`
- `release_date`, `value`
- `advance_number`, `advance_report_id`

---

## Mapeamento: Planilhas ↔ API VExpenses

### Dados que PODEM ser obtidos da API ✅

| Dado da Planilha | Fonte API | Campo API | Observações |
|-----------------|-----------|-----------|-------------|
| Nome do colaborador | TeamMembers | `name` | Correspondência direta |
| CPF | TeamMembers | `cpf` | Correspondência direta |
| E-mail | TeamMembers | `email` | Correspondência direta |
| Centro de Custo | CostCenters | `name` | Correspondência direta |
| Regional | CostCenters | `name` (extraído) | Sigla do estado (RS, SC, etc.) |
| Banco/Agência/Conta | TeamMembers | `bank`, `agency`, `account` | Correspondência direta |
| Pix | TeamMembers | `pix_key` | Correspondência direta |
| Descrição da despesa | Expenses | `title` | Correspondência direta |
| Tipo de despesa | ExpenseTypes | `description` | Correspondência direta |
| Valor da despesa | Expenses | `value` | Correspondência direta |
| Data da despesa | Expenses | `date` | Correspondência direta |
| Forma de pagamento | PaymentMethods | `description` | Correspondência direta |
| Status do relatório | Reports | `status` | Correspondência direta |
| Data de aprovação | Reports | `approval_date` | Correspondência direta |
| Nome do relatório | Reports | `description` | Correspondência direta |
| Projeto | Projects | `name` | Correspondência direta |
| Percentual de rateio | Apportionment | `percentage` | Correspondência direta |
| KM/Kilometragem | Expenses | `mileage`, `mileage_value` | Correspondência direta |
| Moeda | Expenses | `original_currency_iso` | Correspondência direta |
| Reembolsável | Expenses | `reimbursable` | Correspondência direta |

### Dados que NÃO PODEM ser obtidos da API ❌

| Dado da Planilha | Motivo |
|-----------------|--------|
| Saldos de cartão (SALDO CARTAO, SALDO FINAL, etc.) | Dados financeiros do cartão corporativo não expostos pela API |
| Cargas e descargas (CARGA, DESCARGA, 1QZ, 2QZ) | Controle interno de recarga de cartões |
| Status do cartão físico (Cartão ativo/inativo) | Status do plástico não disponível na API |
| Número do cartão (CARTÃO, AGILLITAS) | Dados sensíveis do cartão não expostos |
| Gestor/Diretor | Hierarquia organizacional não disponível na API |
| Aprovações internas (APROVADOR, STATUS de adicional) | Fluxo de aprovação interno diferente da API |
| Motivos de cargas adicionais | Metadados internos não disponíveis |
| Validações externas (Agillitas) | Integrações externas não disponíveis na API |
| Estornos | Operações financeiras não disponíveis na API |
| Extrato bancário | Movimentação financeira não disponível |

---

## Recomendações de Integração

### 1. Dados que DEVEM vir da API (fonte única da verdade)
- **Colaboradores:** Usar API VExpenses como fonte única
- **Centros de Custo:** Usar API VExpenses como fonte única
- **Despesas e Relatórios:** Usar API VExpenses como fonte única
- **Projetos:** Usar API VExpenses como fonte única

### 2. Dados que DEVEM ficar nas planilhas (controle interno)
- **Saldos financeiros:** Manter em planilhas ou sistema financeiro separado
- **Cargas/Descargas:** Manter em planilhas ou sistema de gestão de cartões
- **Aprovações internas de adicionais:** Manter em planilhas ou sistema de workflow interno
- **Validações externas (Agillitas):** Manter em planilhas ou sistema específico

### 3. Dados que podem ser ENRIQUECIDOS
- **Regional:** Pode ser extraída automaticamente do Centro de Custo da API
- **Mês/Ano:** Pode ser calculado automaticamente a partir das datas da API
- **Hierarquia (Gestor/Diretor):** Pode ser mapeada manualmente e mantida em configuração separada

---

## Conclusão

A planilha **BASE PREST** (54.518 linhas) é a que tem maior correspondência com a API VExpenses, contendo dados de despesas e relatórios que podem ser obtidos diretamente através dos endpoints `/v2/expenses` e `/v2/reports`.

As planilhas de controle financeiro (SALDO CARTAO, QUINZENAS, ADICIONAIS, etc.) contêm dados que **NÃO estão disponíveis na API VExpenses**, pois se referem ao controle financeiro dos cartões corporativos (saldos, cargas, descargas) que é gerenciado separadamente.

**Recomendação:** Utilizar a API VExpenses para dados operacionais (despesas, relatórios, colaboradores, centros de custo) e manter as planilhas ou sistema separado para controle financeiro dos cartões corporativos.
