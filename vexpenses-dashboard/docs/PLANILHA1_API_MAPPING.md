# Mapeamento de Campos da Planilha 1 para API VExpenses

## Campos da Planilha 1 (1QZ ABRIL 2026)

### Campos AZUIS (Dados Brutos da Planilha)
Estes campos são dados manuais da planilha Excel que precisam ser substituídos por dados da API quando possível.

**Análise das planilhas foi realizada apenas para entender a lógica dos campos e valores.**

| # | Campo Planilha | Descrição | API Endpoint | Campo API | Status |
|---|----------------|-----------|--------------|-----------|--------|
| 1 | PORTADOR | Nome do colaborador | `/v2/team-members` | `name` | ✅ **DISPONÍVEL** |
| 2 | CPF | CPF do colaborador | `/v2/team-members` | `cpf` | ✅ **DISPONÍVEL** |
| 3 | STATUS COLAB | Status do colaborador (ATIVO/INATIVO) | `/v2/team-members` | `active` | ✅ **DISPONÍVEL** |
| 4 | CENTRO CUSTO | Nome do centro de custo | `/v2/team-members` (com `include=costsCenters`) | `costCenter.name` | ✅ **DISPONÍVEL** |
| 5 | COD CENTRO CUSTO | Código do centro de custo | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 6 | GESTOR | Nome do gestor | ❌ NÃO DISPONÍVEL (investigar) | - | ⚠️ **INVESTIGAR** |
| 7 | DIREÇÃO | Nome da direção | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 8 | SALDO REEMBOLSAR | Saldo a reembolsar | `/v2/expenses` (calculado) | Lógica: CARGA - DESCARGA - TARIFA | ⚠️ **INVESTIGAR** |
| 9 | SALDO FINAL | Saldo final | `/v2/expenses` (calculado) | Lógica: CARGA - DESCARGA - TARIFA | ⚠️ **INVESTIGAR** |
| 10 | 1QZ DE ABRIL 26 | Valor da 1ª quinzena de abril 2026 | `/v2/expenses` (calculado) | `calculateQuinzena1()` | ✅ **CALCULÁVEL** |
| 11 | SALDO CARTAO | Saldo do cartão | `/v2/expenses` (calculado) | `calculateSaldoCartao()` | ✅ **CALCULÁVEL** |
| 12 | ADIANTAMENTO | Valor de adiantamento | ❌ NÃO DISPONÍVEL (investigar) | - | ⚠️ **INVESTIGAR** |
| 13 | CARGA PARCIAL | Calculado (1QZ - SALDO FINAL - SALDO CARTAO - ADIANTAMENTO) | `/v2/expenses` (calculado) | `calculatePlanilha1Fields()` | ✅ **CALCULÁVEL** |
| 14 | REEMBOLSO | Valor de reembolso | `/v2/expenses` (calculado) | `calculateReembolso()` | ✅ **CALCULÁVEL** |
| 15 | CARGA FINAL | Calculado (IF(CARGA PARCIAL < 0, 0, CARGA PARCIAL) + REEMBOLSO) | `/v2/expenses` (calculado) | `calculatePlanilha1Fields()` | ✅ **CALCULÁVEL** |
| 16 | STATUS DO CARTAO | Status do cartão | ❌ NÃO DISPONÍVEL (investigar) | - | ⚠️ **INVESTIGAR** |
| 17 | OBS | Observações (campo manual) | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |

### Resumo de Disponibilidade (ATUALIZADO 2026-05-20)

**Análise das planilhas foi realizada apenas para entender a lógica dos campos. O objetivo é obter TUDO via API VExpenses.**

**✅ Campos disponíveis via API (4/17):**
1. PORTADOR → `team-members.name`
2. CPF → `team-members.cpf`
3. STATUS COLAB → `team-members.active`
4. CENTRO CUSTO → `team-members.costCenter.name` (requer `include=costsCenters`)

**✅ Campos calculáveis via API (7/17):**
1. 1QZ DE ABRIL 26 → `calculateQuinzena1()` usando `/v2/expenses`
2. SALDO CARTAO → `calculateSaldoCartao()` usando `/v2/expenses`
3. REEMBOLSO → `calculateReembolso()` usando `/v2/expenses`
4. CARGA PARCIAL → `calculatePlanilha1Fields()` usando `/v2/expenses`
5. CARGA FINAL → `calculatePlanilha1Fields()` usando `/v2/expenses`
6. SALDO FINAL → `calculateSaldoFinal()` usando `/v2/expenses` (CARGA - DESCARGA - TARIFA)
7. SALDO REEMBOLSAR → `calculateSaldoReembolsar()` usando `/v2/expenses` (CARGA - DESCARGA REEMBOLSÁVEL - TARIFA)

**❌ Campos NÃO disponíveis na API (6/17):**
1. COD CENTRO CUSTO
2. GESTOR - Não encontrado em team-members/costs-centers
3. DIREÇÃO
4. ADIANTAMENTO - Endpoint `/v2/advances` existe mas apenas para criar (POST), não para listar
5. STATUS DO CARTAO - Não encontrado na API
6. OBS (campo manual - irrelevante)

**TOTAL: 11/17 campos (65%) podem ser automatizados via API**

---

## Campos da Planilha 2 (CONTROLE VEXPENSES)

### Campos AZUIS (Dados Brutos da Planilha)

| # | Campo Planilha | Descrição | API Endpoint | Campo API | Status |
|---|----------------|-----------|--------------|-----------|--------|
| 1 | EMPRESA | Nome da empresa | `/v2/team-members` | `company_id` (apenas ID) | ⚠️ **PARCIAL** |
| 2 | COLABORADOR | Nome do colaborador | `/v2/team-members` | `name` | ✅ **DISPONÍVEL** |
| 3 | CPF | CPF do colaborador | `/v2/team-members` | `cpf` | ✅ **DISPONÍVEL** |
| 4 | CHAVE | Chave de identificação | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 5 | SITUAÇÃO | Situação do colaborador | `/v2/team-members` | `active` | ✅ **DISPONÍVEL** |
| 6 | STATUS DO CARTÃO | Status do cartão | ❌ NÃO DISPONÍVEL (endpoint `/v2/cards` não suporta GET) | - | ❌ **NÃO DISPONÍVEL** |
| 7 | CARTÃO ITAU | Número do cartão Itaú | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 8 | TERMO | Termo aceito | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 9 | REGIONAL | Regional | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 10 | CENTRO DE CUSTO | Centro de custo | `/v2/team-members` (com `include=costsCenters`) | `costCenter.name` | ✅ **DISPONÍVEL** |
| 11 | GESTOR | Nome do gestor | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 12 | DIRETOR | Nome do diretor | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 13 | CARTÃO VEXPENSES | Número do cartão VExpenses | ❌ NÃO DISPONÍVEL (endpoint `/v2/cards` não suporta GET) | - | ❌ **NÃO DISPONÍVEL** |
| 14 | CARGA | Valor de carga | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 15 | DESCARGA | Valor de descarga | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 16 | TARIFA | Valor da tarifa | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 17 | PRESTAÇÃO DE CONTAS | Valor da prestação de contas | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 18 | SALDO PRESTAÇÃO | Saldo da prestação de contas | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 19 | SALDO CARTAO | Saldo do cartão | ❌ NÃO DISPONÍVEL (endpoint `/v2/cards` não suporta GET) | - | ❌ **NÃO DISPONÍVEL** |
| 20 | SALDO FINAL | Saldo final | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 21 | 1ª QZ | Valor da 1ª quinzena | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 22 | 2ª QZ | Valor da 2ª quinzena | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 23 | ADICIONAIS | Valores adicionais | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 24 | REEMBOLSO | Valor de reembolso | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 25 | CARGA FINAL | Carga final | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 26 | OBS | Observações | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 27 | STATUS | Status geral | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |

### Resumo de Disponibilidade - Planilha 2

**✅ Campos disponíveis na API (3/27):**
1. COLABORADOR → `team-members.name`
2. CPF → `team-members.cpf`
3. SITUAÇÃO → `team-members.active`
4. CENTRO DE CUSTO → `team-members.costCenter.name` (requer `include=costsCenters`)

**⚠️ Campos parcialmente disponíveis (1/27):**
1. EMPRESA → `team-members.company_id` (apenas ID, não nome)

**❌ Campos NÃO disponíveis na API (23/27):**
Todos os campos financeiros (saldos, cargas, descargas, tarifas, reembolsos, etc.) e campos organizacionais (gestor, diretor, regional, etc.)

---

## Limitações da API VExpenses

### Endpoints NÃO Funcionais (405 Method Not Allowed)
- `/v2/cost-centers` - Não suporta GET
- `/v2/expense-limit-policies` - Não suporta GET
- `/v2/cards` - Não suporta GET
- `/v2/card-limits` - Não suporta GET

### Endpoints NÃO Encontrados (404)
- `/v2/team-members/{id}/cards`
- `/v2/team-members/{id}/parameters`

### Endpoints Funcionais
- `/v2/team-members` ✅
- `/v2/reports` ✅
- `/v2/expenses` ⚠️ (requer filtros específicos não documentados)

---

## ATUALIZAÇÃO IMPORTANTE - Descoberta do Endpoint `/v2/expenses`

### Nova Descoberta (2026-05-20)

Após investigação mais profunda, descobri que o endpoint `/v2/expenses` **PODE fornecer dados financeiros por usuário** quando usado com os filtros corretos!

### Como o Endpoint `/v2/expenses` Funciona

O endpoint `/v2/expenses` aceita os seguintes parâmetros:
- `search`: Critérios de busca (ex: `date:2026-04-01,2026-04-30`)
- `searchFields`: Operadores de busca (ex: `date:between`)
- `searchJoin`: Operador lógico (and/or)
- `include`: Campos relacionados (user, costs_center, payment_method, expense_type, report)
- `paginate`: Paginação
- `page`, `per_page`: Controle de paginação

### Campos Financeiros Disponíveis em `/v2/expenses`

Cada expense (despesa) contém:
- `value`: Valor da despesa
- `date`: Data da despesa
- `user_id`: ID do usuário
- `report_id`: ID do relatório
- `reimbursable`: Se é reembolsável (boolean)
- `payment_method`: Método de pagamento
- `costs_center`: Centro de custo
- `expense_type`: Tipo de despesa

### Como Calcular Campos da Planilha 1 Usando `/v2/expenses`

**1QZ DE ABRIL 26** → Somar `value` de expenses onde:
- `date` entre 2026-04-01 e 2026-04-15 (primeira quinzena)
- Agrupar por `user_id`

**SALDO CARTAO** → Somar `value` de expenses onde:
- `payment_method.description` contém "cartão" ou "card"
- Agrupar por `user_id`

**REEMBOLSO** → Somar `value` de expenses onde:
- `reimbursable = true`
- Agrupar por `user_id`

**ADIANTAMENTO** → Endpoint `/v2/advances` (precisa testar)

### Campos Ainda NÃO Disponíveis

**Dados Organizacionais:**
- GESTOR
- DIREÇÃO
- REGIONAL
- COD CENTRO CUSTO

**Dados de Cartão:**
- STATUS DO CARTAO
- CARTÃO ITAU
- CARTÃO VEXPENSES
- Limites específicos de cartão

**Outros:**
- OBS (campo manual)

### Nova Abordagem: Investigação API Baseada em Análise de Planilhas (2026-05-20)

A análise completa das planilhas foi realizada apenas para **entender a lógica dos campos e valores**. O objetivo é replicar **TUDO via API VExpenses**.

#### Descobertas da Análise de Planilhas (Referência para API):

**Planilha 1 (1QZ ABRIL 2026):**
- `Planilha1/2/3`: STATUS DO CARTÃO tem valores: "Cartão ativo", "Cadastro pendente", "Cartão não vinculado", "Cartão não habilitado", "Cartão bloqueado", "Cadastro reprovado"
- `1 QZ VEXPENSES 04_2026`: 17 colunas com dados financeiros

**Planilha 2 (CONTROLE VEXPENSES):**
- `QUINZENAS`: 1QZ por usuário/quinzena/mês - indica que precisamos filtrar `/v2/expenses` por período
- `ADICIONAIS`: ADIANTAMENTO e DIRETOR REGIONAL - indica que pode haver endpoint específico
- `REEMBOLSO`: REEMBOLSO manual - indica que `/v2/reimbursements` pode ter dados
- `SALDO CARTAO`: SALDO CARTAO por usuário - confirma que podemos calcular via `/v2/expenses`
- `EXTRATO`: CARGA, DESCARGA, TARIFA por usuário/mês - indica lógica para SALDO FINAL

#### Estratégia de Investigação API:

1. **STATUS DO CARTAO**: Investigar se há endpoint específico ou se pode ser inferido via transações
2. **GESTOR/DIRETOR REGIONAL**: Investigar campos em team-members ou costs-centers
3. **ADIANTAMENTO**: Investigar endpoint `/v2/advances` (existe mas não suporta GET)
4. **SALDO FINAL/SALDO REEMBOLSAR**: Implementar lógica via `/v2/expenses` (CARGA - DESCARGA - TARIFA)
5. **Filtros avançados**: Usar filtros do relatório "Despesas por Usuário" na API

### Resultados dos Testes (2026-05-20)

**✅ Endpoint `/v2/expenses`: FUNCIONANDO**
- Retorna dados de despesas com todos os campos necessários
- Aceita filtros por período, usuário, tipo de pagamento, reembolsável
- Pode ser usado para calcular todos os campos financeiros por usuário

**❌ Endpoint `/v2/advances`: NÃO FUNCIONA**
- Retorna erro 405: "The GET method is not supported"
- Apenas POST é suportado

**❌ Endpoint `/v2/reimbursements`: NÃO FUNCIONA**
- Retorna erro 405: "The GET method is not supported"
- Apenas OPTIONS é suportado

**❌ Dados Organizacionais em team-members/costs-centers: NÃO DISPONÍVEIS**
- Campos disponíveis: id, name, integration_id, company_group_id, approval_flow_id
- Não há campos para gestor, diretor, regional

### Implementação Realizada

Criamos funções para calcular campos financeiros usando `/v2/expenses`:

**Arquivo:** `lib/vexpenses-calculations.ts`
- `calculateUserFinancialData()` - Calcula todos os dados financeiros por usuário
- `calculateQuinzena1()` - Calcula 1QZ (primeira quinzena)
- `calculateSaldoCartao()` - Calcula saldo do cartão
- `calculateReembolso()` - Calcula reembolso
- `calculatePlanilha1Fields()` - Calcula todos os campos da planilha 1

**Endpoint API:** `app/api/vexpenses/financial-calculations/route.ts`
- Endpoint: `/api/vexpenses/financial-calculations`
- Parâmetros: `year`, `month`, `userId` (opcional)
- Retorna dados financeiros calculados para um ou todos os usuários

### Exemplo de Uso

```bash
# Calcular dados para abril 2026 para todos os usuários
curl "http://localhost:3000/api/vexpenses/financial-calculations?year=2026&month=4"

# Calcular dados para um usuário específico
curl "http://localhost:3000/api/vexpenses/financial-calculations?year=2026&month=4&userId=896020"
```

---

## Conclusão Final (2026-05-20 - ATUALIZADO)

A análise completa das planilhas foi realizada apenas para **entender a lógica dos campos e valores**. O objetivo é replicar **TUDO via API VExpenses**, sem ler dados das planilhas.

**✅ O que já PODEMOS obter via API (11/17 campos = 65%):**

**Dados Cadastrais (4 campos):**
1. PORTADOR → `team-members.name`
2. CPF → `team-members.cpf`
3. STATUS COLAB → `team-members.active`
4. CENTRO CUSTO → `team-members.costCenter.name`

**Dados Financeiros Calculáveis (7 campos):**
5. 1QZ DE ABRIL 26 → `calculateQuinzena1()` usando `/v2/expenses`
6. SALDO CARTAO → `calculateSaldoCartao()` usando `/v2/expenses`
7. REEMBOLSO → `calculateReembolso()` usando `/v2/expenses`
8. CARGA PARCIAL → `calculatePlanilha1Fields()` usando `/v2/expenses`
9. CARGA FINAL → `calculatePlanilha1Fields()` usando `/v2/expenses`
10. SALDO FINAL → `calculateSaldoFinal()` usando `/v2/expenses` (CARGA - DESCARGA - TARIFA)
11. SALDO REEMBOLSAR → `calculateSaldoReembolsar()` usando `/v2/expenses` (CARGA - DESCARGA REEMBOLSÁVEL - TARIFA)

**❌ O que NÃO está disponível na API (6/17 campos = 35%):**
12. COD CENTRO CUSTO - Não disponível na API
13. GESTOR - Não encontrado em team-members/costs-centers
14. DIREÇÃO - Não disponível na API
15. ADIANTAMENTO - Endpoint `/v2/advances` existe mas apenas para criar (POST), não para listar
16. STATUS DO CARTAO - Não encontrado na API
17. OBS - Campo manual (irrelevante)

**TOTAL ATUAL: 11/17 campos (65%) podem ser automatizados via API**

**Implementação Realizada:**
1. ✅ Criado `lib/vexpenses-calculations.ts` com funções de cálculo financeiro via API
2. ✅ Implementado `calculateSaldoFinal()` e `calculateSaldoReembolsar()` baseados na lógica CARGA - DESCARGA - TARIFA
3. ✅ Criado endpoint `/api/vexpenses/financial-calculations` para calcular dados por usuário
4. ✅ Testado endpoint `/v2/expenses` com sucesso
5. ✅ Analisadas todas as sheets das planilhas para entender a lógica dos campos
6. ✅ Investigado endpoint `/v2/advances` (apenas para criar, não para listar)
7. ✅ Investigados campos em team-members/costs-centers (não encontrado GESTOR)

**Campos Calculados Implementados:**
- `calculateCargaDescargaTarifa()` - Calcula CARGA, DESCARGA e TARIFA por usuário/mês
- `calculateSaldoFinal()` - Calcula SALDO FINAL = CARGA - DESCARGA - TARIFA
- `calculateSaldoReembolsar()` - Calcula SALDO REEMBOLSAR considerando apenas despesas reembolsáveis

**Limitações da API VExpenses:**
- Endpoint `/v2/advances` não suporta GET (apenas POST para criar)
- Não há campos para GESTOR/DIRETOR REGIONAL em team-members/costs-centers
- Não há endpoint para STATUS DO CARTAO
- Não há campo para COD CENTRO CUSTO

**Recomendação Final:**
Implementar os 11 campos (65%) disponíveis via API na página `test-planilha-1`, mantendo os 6 campos restantes (35%) como manuais ou buscando alternativas futuras na API VExpenses.
