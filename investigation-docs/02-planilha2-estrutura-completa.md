# Análise Detalhada: Planilha 2 - CONTROLE - VEXPENSES - ABRIL- 2026

## Visão Geral

**Arquivo:** `CONTROLE - VEXPENSES - ABRIL- 2026 (1).xlsb`  
**Formato:** XLSB (Excel Binário)  
**Tamanho:** 7.9 MB  
**Objetivo:** Controle completo de VExpenses para Abril 2026 - sistema de gestão financeira  
**Total de abas:** 15  

---

## Abas Disponíveis

| # | Nome da Aba | Linhas | Objetivo Principal |
|---|-------------|--------|-------------------|
| 1 | PAINEL | 718 | Painel geral de controle de cartões |
| 2 | SALDO CARTAO | 6.989 | Histórico detalhado de saldos de cartão |
| 3 | ADICIONAIS | 538 | Controle de cargas adicionais (adiantamentos) |
| 4 | ADICIONAL ITAÚ | 18 | Controle de adicionais para cartões Itaú |
| 5 | QUINZENAS | 10.148 | Controle de quinzenas (1ª QZ e 2ª QZ) |
| 6 | SALDOS ADM EQS | 15 | Controle de saldos da administração EQS |
| 7 | EXTRATO | 15.785 | Extrato detalhado de movimentações |
| 8 | PAINEL PRESTAÇÕES | 517 | Painel de prestações de contas |
| 9 | BASE PREST | 54.518 | Base de dados completa de prestações de contas |
| 10 | REEMBOLSO | 283 | Controle de reembolsos |
| 11 | ESTORNO - SAQUE | 3 | Registro de estornos de saques |
| 12 | Detalhes1 | 14 | Detalhes específicos de relatórios |
| 13 | Detalhes2 | 14 | Detalhes específicos de relatórios |
| 14 | Detalhes3 | 14 | Detalhes específicos de relatórios |
| 15 | AUX | - | Tabela auxiliar |

---

## Aba 1: PAINEL

**Linhas:** 718  
**Objetivo:** Painel geral de controle de cartões

### Colunas Principais

| Campo | Descrição | API Correspondente |
|-------|-----------|-------------------|
| EMPRESA | Nome da empresa | - |
| COLABORADOR | Nome do colaborador | TeamMember.name |
| CPF | CPF do colaborador | TeamMember.cpf |
| CHAVE | Chave de identificação | - |
| SITUAÇÃO | Situação do cartão | - |
| STATUS DO CARTÃO | Status do cartão | ❌ Não disponível |
| CARTÃO ITAU | Número cartão Itaú | ❌ Não disponível |
| TERMO | Termo de uso | - |
| REGIONAL | Regional/Estado | CostCenter.name (extraído) |
| CENTRO DE CUSTO | Centro de custo | CostCenter.name |
| GESTOR | Nome do gestor | ApprovalFlows.approvers |
| DIRETOR | Nome do diretor | ApprovalFlows.approvers |
| CARTÃO VEXPENSES | Número cartão VExpenses | ❌ Não disponível |
| CARGA | Valor da carga | ❌ Não disponível |
| DESCARGA | Valor da descarga | ❌ Não disponível |
| (-) TARIFA | Valor da tarifa | ❌ Não disponível |
| (-) PRESTAÇÃO DE CONTAS | Valor da prestação | ❌ Não disponível |
| SALDO PRESTAÇÃO | Saldo da prestação | ❌ Não disponível |
| (-) SALDO CARTAO | Saldo do cartão | ❌ Não disponível |
| SALDO FINAL | Saldo final | ❌ Não disponível |
| 1ª QZ | Valor 1ª quinzena | Calculável via API |
| 2ª QZ | Valor 2ª quinzena | Calculável via API |
| ADICIONAIS | Valor adicionais | ❌ Não disponível |
| REEMBOLSO | Valor reembolso | ❌ Não disponível |
| CARTÃO CRED. ITAU | Cartão crédito Itaú | ❌ Não disponível |
| ITAU | Valor Itaú | ❌ Não disponível |
| ADICIONAL ITAU | Adicional Itaú | ❌ Não disponível |

### Observações

- Esta aba contém dados financeiros do cartão corporativo que **NÃO** estão disponíveis na API
- Os dados de colaborador e centro de custo podem ser obtidos da API
- Gestor/Diretor podem ser mapeados via Approval Flows
- Quinzenas podem ser calculadas a partir das despesas da API

---

## Aba 2: SALDO CARTAO

**Linhas:** 6.989  
**Objetivo:** Histórico detalhado de saldos de cartão

### Colunas Principais

| Campo | Descrição | API Correspondente |
|-------|-----------|-------------------|
| PORTADOR | Nome do colaborador | TeamMember.name |
| CPF | CPF do colaborador | TeamMember.cpf |
| VALOR | Valor do saldo | ❌ Não disponível |
| DATA | Data do saldo | ❌ Não disponível |
| MÊS | Mês do saldo | Calculável |
| EMPRESA | Nome da empresa | - |

### Observações

- **100% dos dados desta aba são financeiros e NÃO estão disponíveis na API**
- Esta aba deve continuar sendo mantida na planilha ou em sistema financeiro separado

---

## Aba 3: ADICIONAIS

**Linhas:** 538  
**Objetivo:** Controle de cargas adicionais (adiantamentos)

### Colunas Principais

| Campo | Descrição | API Correspondente |
|-------|-----------|-------------------|
| COLABORADOR | Nome do colaborador | TeamMember.name |
| CPF | CPF do colaborador | TeamMember.cpf |
| VALOR | Valor do adicional | ❌ Não disponível |
| DATA | Data do adicional | ❌ Não disponível |
| MÊS | Mês do adicional | Calculável |
| ANO | Ano do adicional | Calculável |
| CENTRO DE CUSTO | Centro de custo | CostCenter.name |
| DIRETOR REGIONAL | Nome do diretor regional | ApprovalFlows.approvers |
| MOTIVO | Motivo do adicional | ❌ Não disponível |
| APROVADOR | Nome do aprovador | ApprovalFlows.approvers |
| PEDIDO | Número do pedido | ❌ Não disponível |
| STATUS | Status (APROVADO) | ❌ Não disponível |
| VALOR UTILIZADO | Valor utilizado | ❌ Não disponível |

### Observações

- Dados de colaborador e centro de custo podem vir da API
- Valores financeiros e aprovações internas **NÃO** estão disponíveis na API
- Pode haver correspondência parcial com `Advance` da API, mas não completa

---

## Aba 4: ADICIONAL ITAÚ

**Linhas:** 18  
**Objetivo:** Controle de adicionais para cartões Itaú

### Colunas Principais

| Campo | Descrição | API Correspondente |
|-------|-----------|-------------------|
| COLABORADOR | Nome do colaborador | TeamMember.name |
| CPF | CPF do colaborador | TeamMember.cpf |
| LIMITE ANTES | Limite antes | ❌ Não disponível |
| LIMITE DEPOIS | Limite depois | ❌ Não disponível |
| ADICIONADO | Valor adicionado | ❌ Não disponível |
| DATA | Data da alteração | ❌ Não disponível |
| MÊS | Mês da alteração | Calculável |
| CENTRO DE CUSTO | Centro de custo | CostCenter.name |
| DIRETOR REGIONAL | Nome do diretor regional | ApprovalFlows.approvers |
| MOTIVO | Motivo da alteração | ❌ Não disponível |
| APROVADOR | Nome do aprovador | ApprovalFlows.approvers |

### Observações

- Dados de cartão Itaú **NÃO** estão disponíveis na API VExpenses
- Esta aba é específica para integração com sistema bancário Itaú

---

## Aba 5: QUINZENAS

**Linhas:** 10.148  
**Objetivo:** Controle de quinzenas (1ª QZ e 2ª QZ)

### Colunas Principais

| Campo | Descrição | API Correspondente |
|-------|-----------|-------------------|
| COLABORADOR | Nome do colaborador | TeamMember.name |
| CPF | CPF do colaborador | TeamMember.cpf |
| VALOR | Valor da quinzena | Calculável via API |
| QUINZENA | 1ª QZ ou 2ª QZ | Calculável via API |
| DATA | Data da quinzena | Calculável via API |
| MÊS | Mês da quinzena | Calculável via API |
| ANO | Ano da quinzena | Calculável via API |
| REGIONAL | Regional/Estado | CostCenter.name (extraído) |
| OBSERVAÇÃO | Observações | - |

### Observações

- **Esta aba pode ser 100% substituída por dados da API**
- Lógica de cálculo de quinzena: `day <= 15 ? 1ª QZ : 2ª QZ`
- Valor = soma de `Expense.value` filtrado por período
- É a aba com maior potencial de substituição via API

---

## Aba 6: SALDOS ADM EQS

**Linhas:** 15  
**Objetivo:** Controle de saldos da administração EQS

### Colunas Principais

| Campo | Descrição | API Correspondente |
|-------|-----------|-------------------|
| COLABORADOR | Nome do colaborador | TeamMember.name |
| CPF | CPF do colaborador | TeamMember.cpf |
| SITUAÇÃO | Situação | - |
| STATUS VEX | Status VExpenses | TeamMember.active |
| CENTRO DE CUSTO | Centro de custo | CostCenter.name |
| GESTOR | Nome do gestor | ApprovalFlows.approvers |
| 1QZ_DIRETORIA | Valor 1QZ diretoria | Calculável via API |
| 2QZ_DIRETORIA | Valor 2QZ diretoria | Calculável via API |
| TOTAL QZ_2025 | Total quinzenas 2025 | Calculável via API |
| OBSERVAÇÃO | Observações | - |
| CARGA REALIZADA | Carga realizada | ❌ Não disponível |

### Observações

- Dados básicos podem vir da API
- Valores de quinzenas podem ser calculados
- Carga realizada é dado financeiro não disponível na API

---

## Aba 7: EXTRATO

**Linhas:** 15.785  
**Objetivo:** Extrato detalhado de movimentações

### Colunas Principais

| Campo | Descrição | API Correspondente |
|-------|-----------|-------------------|
| CARGA | Valor da carga | ❌ Não disponível |
| DESCARGA | Valor da descarga | ❌ Não disponível |
| VALOR | Valor da movimentação | ❌ Não disponível |
| DATA | Data da movimentação | ❌ Não disponível |

### Observações

- **100% dos dados desta aba são financeiros e NÃO estão disponíveis na API**
- Extrato bancário não é exposto pela API VExpenses

---

## Aba 8: PAINEL PRESTAÇÕES

**Linhas:** 517  
**Objetivo:** Painel de prestações de contas

### Colunas Principais

| Campo | Descrição | API Correspondente |
|-------|-----------|-------------------|
| COLABORADOR | Nome do colaborador | TeamMember.name |
| VALOR | Valor total | Expense.value (soma) |
| Status | Status da prestação | Report.status |

### Observações

- Dados podem ser obtidos da API
- Valor = soma de `Expense.value` por `Report`
- Status = `Report.status` (APROVADO, REPROVADO, ENVIADO)

---

## Aba 9: BASE PREST ⭐

**Linhas:** 54.518  
**Objetivo:** Base de dados completa de prestações de contas  
**IMPORTANTE:** Esta é a aba mais completa e tem **ALTA CORRESPONDÊNCIA** com a API VExpenses

### Colunas Principais

| Campo Planilha | API Correspondente | Campo API | Observações |
|----------------|-------------------|-----------|-------------|
| ID da Despesa | Expenses | `id` | Correspondência direta |
| ID do Relatório | Reports | `id` | Correspondência direta |
| Nome do relatório | Reports | `description` | Correspondência direta |
| Data | Expenses | `date` | Correspondência direta |
| Nome do membro de equipe | TeamMembers | `name` | Correspondência direta |
| Banco | TeamMembers | `bank` | Correspondência direta |
| Agência | TeamMembers | `agency` | Correspondência direta |
| Conta | TeamMembers | `account` | Correspondência direta |
| Pix | TeamMembers | `pix_key` | Correspondência direta |
| CPF/CNPJ | TeamMembers | `cpf` | Correspondência direta |
| Status | Reports/Expenses | `status` / `on` | Correspondência direta |
| Data de Pagamento | Reports | `payment_date` | Correspondência direta |
| Descrição da despesa | Expenses | `title` | Correspondência direta |
| Tipo de Despesa | ExpenseTypes | `description` | Correspondência direta |
| Reembolsável | Expenses | `reimbursable` | Correspondência direta |
| Anotação da Despesa | Expenses | `observation` | Correspondência parcial |
| Anotação de Rateio | Apportionment | - | Correspondência parcial |
| Centro de Custos | CostCenters | `name` | Correspondência direta |
| Forma de pagamento | PaymentMethods | `description` | Correspondência direta |
| Projeto | Projects | `name` | Correspondência direta |
| Percentual de projeto | Apportionment | `percentage` | Correspondência direta |
| Início do Percurso por GPS | Expenses | `route_id` | Correspondência parcial |
| Fim do Percurso por GPS | Expenses | `route_id` | Correspondência parcial |
| Valor do KM | Expenses | `mileage_value` | Correspondência direta |
| Kilômetros Percorridos | Expenses | `mileage` | Correspondência direta |
| Moeda do Relatório | Expenses | `original_currency_iso` | Correspondência direta |
| Valor | Expenses | `value` | Correspondência direta |
| MÊS | - | Campo derivado | Calculável via API |
| CPF | TeamMembers | `cpf` | Correspondência direta |
| colaborador | TeamMembers | `name` | Correspondência direta |

### Observações

- **Esta é a aba com maior correspondência com a API VExpenses**
- A maioria dos dados pode ser obtida através dos endpoints de Expenses e Reports
- Campos derivados (MÊS) podem ser calculados via código
- **Recomendação:** Esta aba pode ser 100% substituída por dados da API

---

## Aba 10: REEMBOLSO

**Linhas:** 283  
**Objetivo:** Controle de reembolsos

### Colunas Principais

| Campo | Descrição | API Correspondente |
|-------|-----------|-------------------|
| COLABORADOR | Nome do colaborador | TeamMember.name |
| CPF | CPF do colaborador | TeamMember.cpf |
| VALOR | Valor do reembolso | ❌ Não disponível |
| DATA | Data do reembolso | ❌ Não disponível |
| MÊS | Mês do reembolso | Calculável |
| CENTRO DE CUSTO | Centro de custo | CostCenter.name |
| DIRETOR REGIONAL | Nome do diretor regional | ApprovalFlows.approvers |
| MOTIVO | Motivo do reembolso | ❌ Não disponível |

### Observações

- Dados de colaborador e centro de custo podem vir da API
- Valores financeiros de reembolso **NÃO** estão disponíveis na API

---

## Aba 11: ESTORNO - SAQUE

**Linhas:** 3  
**Objetivo:** Registro de estornos de saques

### Colunas Principais

| Campo | Descrição | API Correspondente |
|-------|-----------|-------------------|
| COLABORADOR | Nome do colaborador | TeamMember.name |
| CPF | CPF do colaborador | TeamMember.cpf |
| VALOR | Valor do estorno | ❌ Não disponível |
| DATA | Data do estorno | ❌ Não disponível |
| MÊS | Mês do estorno | Calculável |
| CENTRO DE CUSTO | Centro de custo | CostCenter.name |
| DIRETOR REGIONAL | Nome do diretor regional | ApprovalFlows.approvers |
| MOTIVO | Motivo (ESTORNO SAQUE VEXPENSES) | ❌ Não disponível |

### Observações

- Operações de estorno **NÃO** estão disponíveis na API
- Esta aba deve continuar sendo mantida na planilha

---

## Abas 12-14: Detalhes1, Detalhes2, Detalhes3

**Linhas:** 14 cada  
**Objetivo:** Detalhes específicos de relatórios

### Observações

- Dados detalhados por relatório/colaborador
- Podem ser obtidos via `Report` com include `expenses`
- Correspondência direta com a API

---

## Aba 15: AUX

**Objetivo:** Tabela auxiliar (dados não especificados)

---

## Resumo de Correspondência com API

### ✅ Dados que PODEM ser obtidos da API

| Aba | Campos Correspondentes | % de Correspondência |
|-----|----------------------|---------------------|
| PAINEL | COLABORADOR, CPF, REGIONAL, CENTRO CUSTO, GESTOR, DIRETOR | ~30% |
| SALDO CARTAO | PORTADOR, CPF | ~20% |
| ADICIONAIS | COLABORADOR, CPF, CENTRO CUSTO | ~25% |
| ADICIONAL ITAÚ | COLABORADOR, CPF, CENTRO CUSTO | ~25% |
| QUINZENAS | COLABORADOR, CPF, VALOR, QUINZENA, DATA, MÊS, ANO, REGIONAL | **100%** |
| SALDOS ADM EQS | COLABORADOR, CPF, STATUS VEX, CENTRO CUSTO, GESTOR, QUINZENAS | ~60% |
| EXTRATO | - | 0% |
| PAINEL PRESTAÇÕES | COLABORADOR, VALOR, STATUS | **100%** |
| BASE PREST | **Quase todos os campos** | **~95%** |
| REEMBOLSO | COLABORADOR, CPF, CENTRO CUSTO | ~30% |
| ESTORNO - SAQUE | COLABORADOR, CPF, CENTRO CUSTO | ~30% |
| Detalhes1-3 | Dados de relatórios | **100%** |

### ❌ Dados que NÃO Podem ser obtidos da API

| Tipo de Dado | Abas Afetadas |
|--------------|---------------|
| Saldos financeiros do cartão | PAINEL, SALDO CARTAO, EXTRATO |
| Cargas e descargas | PAINEL, EXTRATO |
| Status físico do cartão | PAINEL |
| Número do cartão | PAINEL, ADICIONAL ITAÚ |
| Aprovações internas | ADICIONAIS, ADICIONAL ITAÚ |
| Motivos de cargas | ADICIONAIS, ADICIONAL ITAÚ, REEMBOLSO, ESTORNO |
| Reembolsos | PAINEL, REEMBOLSO |
| Estornos | ESTORNO - SAQUE |
| Limites de cartão | ADICIONAL ITAÚ |

---

## Conclusão

### Abas com Maior Potencial de Substituição via API

1. **BASE PREST** (54.518 linhas) - ~95% de correspondência
2. **QUINZENAS** (10.148 linhas) - 100% de correspondência
3. **PAINEL PRESTAÇÕES** (517 linhas) - 100% de correspondência
4. **Detalhes1-3** (14 linhas cada) - 100% de correspondência

### Abas que Devem Permanecer na Planilha

1. **SALDO CARTAO** (6.989 linhas) - 100% financeiro, não disponível na API
2. **EXTRATO** (15.785 linhas) - 100% financeiro, não disponível na API
3. **ADICIONAL ITAÚ** (18 linhas) - Específico de banco externo

### Abas com Potencial Híbrido

1. **PAINEL** (718 linhas) - Dados operacionais da API + financeiros da planilha
2. **ADICIONAIS** (538 linhas) - Dados básicos da API + valores financeiros da planilha
3. **REEMBOLSO** (283 linhas) - Dados básicos da API + valores financeiros da planilha

---

**Data da análise:** 2026-05-21  
**Arquivos gerados:**
- `planilha2_complete_analysis.json` - Análise completa de todas as abas
