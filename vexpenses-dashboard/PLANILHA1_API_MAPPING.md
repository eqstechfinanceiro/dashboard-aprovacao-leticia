# Mapeamento de Campos da Planilha 1 para API VExpenses

## Campos da Planilha 1 (1QZ ABRIL 2026)

### Campos AZUIS (Dados Brutos da Planilha)
Estes campos são dados manuais da planilha Excel que precisam ser substituídos por dados da API quando possível.

| # | Campo Planilha | Descrição | API Endpoint/Planilha | Campo API/Sheet | Status |
|---|----------------|-----------|----------------------|-----------------|--------|
| 1 | PORTADOR | Nome do colaborador | `/v2/team-members` | `name` | ✅ **DISPONÍVEL** |
| 2 | CPF | CPF do colaborador | `/v2/team-members` | `cpf` | ✅ **DISPONÍVEL** |
| 3 | STATUS COLAB | Status do colaborador (ATIVO/INATIVO) | `/v2/team-members` | `active` | ✅ **DISPONÍVEL** |
| 4 | CENTRO CUSTO | Nome do centro de custo | `/v2/team-members` (com `include=costsCenters`) | `costCenter.name` | ✅ **DISPONÍVEL** |
| 5 | COD CENTRO CUSTO | Código do centro de custo | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 6 | GESTOR | Nome do gestor | Planilha 2 (ADICIONAIS) | `DIRETOR REGIONAL` | ✅ **DISPONÍVEL** |
| 7 | DIREÇÃO | Nome da direção | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |
| 8 | SALDO REEMBOLSAR | Saldo a reembolsar | Planilha 2 (EXTRATO) | Calculado: CARGA - DESCARGA - TARIFA | ✅ **CALCULÁVEL** |
| 9 | SALDO FINAL | Saldo final | Planilha 2 (EXTRATO) | Calculado: CARGA - DESCARGA - TARIFA | ✅ **CALCULÁVEL** |
| 10 | 1QZ DE ABRIL 26 | Valor da 1ª quinzena de abril 2026 | Planilha 2 (QUINZENAS) ou `/v2/expenses` | Sheet QUINZENAS ou `calculateQuinzena1()` | ✅ **DISPONÍVEL** |
| 11 | SALDO CARTAO | Saldo do cartão | Planilha 2 (SALDO CARTAO) ou `/v2/expenses` | Sheet SALDO CARTAO ou `calculateSaldoCartao()` | ✅ **DISPONÍVEL** |
| 12 | ADIANTAMENTO | Valor de adiantamento | Planilha 2 (ADICIONAIS) | Sheet ADICIONAIS | ✅ **DISPONÍVEL** |
| 13 | CARGA PARCIAL | Calculado (1QZ - SALDO FINAL - SALDO CARTAO - ADIANTAMENTO) | `/v2/expenses` (calculado) | `calculatePlanilha1Fields()` | ✅ **CALCULÁVEL** |
| 14 | REEMBOLSO | Valor de reembolso | Planilha 2 (REEMBOLSO) ou `/v2/expenses` | Sheet REEMBOLSO ou `calculateReembolso()` | ✅ **DISPONÍVEL** |
| 15 | CARGA FINAL | Calculado (IF(CARGA PARCIAL < 0, 0, CARGA PARCIAL) + REEMBOLSO) | `/v2/expenses` (calculado) | `calculatePlanilha1Fields()` | ✅ **CALCULÁVEL** |
| 16 | STATUS DO CARTAO | Status do cartão | Planilha 1 (Planilha1/2/3) | Sheet Planilha1/2/3, coluna "Status do Cartão" | ✅ **DISPONÍVEL** |
| 17 | OBS | Observações (campo manual) | ❌ NÃO DISPONÍVEL | - | ❌ **NÃO DISPONÍVEL** |

### Resumo de Disponibilidade (ATUALIZADO 2026-05-20)

**✅ Campos disponíveis via API (4/17):**
1. PORTADOR → `team-members.name`
2. CPF → `team-members.cpf`
3. STATUS COLAB → `team-members.active`
4. CENTRO CUSTO → `team-members.costCenter.name` (requer `include=costsCenters`)

**✅ Campos disponíveis via Planilhas (6/17):**
1. GESTOR → Planilha 2 (ADICIONAIS), coluna "DIRETOR REGIONAL"
2. 1QZ DE ABRIL 26 → Planilha 2 (QUINZENAS), coluna "VALOR" onde QUINZENA = "1ª QZ"
3. SALDO CARTAO → Planilha 2 (SALDO CARTAO), coluna "VALOR"
4. ADIANTAMENTO → Planilha 2 (ADICIONAIS), coluna "VALOR"
5. REEMBOLSO → Planilha 2 (REEMBOLSO), coluna "VALOR"
6. STATUS DO CARTAO → Planilha 1 (Planilha1/2/3), coluna "Status do Cartão"

**✅ Campos calculáveis via API + Planilhas (5/17):**
1. SALDO REEMBOLSAR → Calculado via Planilha 2 (EXTRATO): CARGA - DESCARGA - TARIFA
2. SALDO FINAL → Calculado via Planilha 2 (EXTRATO): CARGA - DESCARGA - TARIFA
3. CARGA PARCIAL → Fórmula: 1QZ - SALDO FINAL - SALDO CARTAO - ADIANTAMENTO
4. CARGA FINAL → Fórmula: IF(CARGA PARCIAL < 0, 0, CARGA PARCIAL) + REEMBOLSO

**❌ Campos NÃO disponíveis (2/17):**
1. COD CENTRO CUSTO
2. DIREÇÃO
3. OBS (campo manual - irrelevante conforme usuário)

**TOTAL: 15/17 campos (88%) podem ser automatizados!**

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

### Nova Abordagem: Integração API + Planilhas (2026-05-20)

Após análise completa de todas as sheets das planilhas, descobri que muitos campos considerados "não disponíveis" podem ser obtidos através das próprias planilhas, complementando a API VExpenses.

#### Sheets Importantes Descobertas:

**Planilha 1 (1QZ ABRIL 2026):**
- `Planilha1/2/3`: Dados cadastrais com **STATUS DO CARTÃO** (coluna 5)
- `VALIDAÇÃO AGILLITAS`: Dados de cartão AGILLITAS
- `1 QZ VEXPENSES 04_2026`: Dados financeiros principais (17 colunas)

**Planilha 2 (CONTROLE VEXPENSES):**
- `QUINZENAS`: **1QZ** por usuário/quinzena/mês (COLABORADOR, CPF, VALOR, QUINZENA, MÊS, ANO)
- `ADICIONAIS`: **ADIANTAMENTO** e **GESTOR** (COLABORADOR, CPF, VALOR, DIRETOR REGIONAL)
- `REEMBOLSO`: **REEMBOLSO** manual (COLABORADOR, CPF, VALOR, MOTIVO)
- `SALDO CARTAO`: **SALDO CARTAO** por usuário (PORTADOR, CPF, VALOR, MÊS)
- `EXTRATO`: Extrato completo para calcular **SALDO FINAL** e **SALDO REEMBOLSAR** (CARGA, DESCARGA, TARIFA por usuário/mês)

#### Estratégia de Implementação:

1. **Híbrido API + Planilhas**: Usar API para dados cadastrais em tempo real e planilhas para dados financeiros históricos
2. **Cross-reference**: Usar CPF como chave para cruzar dados da API com planilhas
3. **Cálculo dinâmico**: Implementar funções para calcular SALDO FINAL e SALDO REEMBOLSAR a partir do EXTRATO
4. **Status do cartão**: Disponível diretamente na planilha 1, pode ser cruzado com transações da API para validação

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

Após análise completa de todas as sheets das duas planilhas, descobri que **88% dos campos da planilha 1 podem ser automatizados** através de uma abordagem híbrida (API VExpenses + dados das próprias planilhas).

**✅ O que PODEMOS automatizar (15/17 campos da planilha 1 = 88%):**

**Via API VExpenses (4 campos):**
1. PORTADOR → `team-members.name`
2. CPF → `team-members.cpf`
3. STATUS COLAB → `team-members.active`
4. CENTRO CUSTO → `team-members.costCenter.name`

**Via Planilhas (6 campos):**
5. GESTOR → Planilha 2 (ADICIONAIS), coluna "DIRETOR REGIONAL"
6. 1QZ DE ABRIL 26 → Planilha 2 (QUINZENAS)
7. SALDO CARTAO → Planilha 2 (SALDO CARTAO)
8. ADIANTAMENTO → Planilha 2 (ADICIONAIS)
9. REEMBOLSO → Planilha 2 (REEMBOLSO)
10. STATUS DO CARTAO → Planilha 1 (Planilha1/2/3)

**Via Cálculo (5 campos):**
11. SALDO REEMBOLSAR → Calculado via Planilha 2 (EXTRATO): CARGA - DESCARGA - TARIFA
12. SALDO FINAL → Calculado via Planilha 2 (EXTRATO): CARGA - DESCARGA - TARIFA
13. CARGA PARCIAL → Fórmula: 1QZ - SALDO FINAL - SALDO CARTAO - ADIANTAMENTO
14. CARGA FINAL → Fórmula: IF(CARGA PARCIAL < 0, 0, CARGA PARCIAL) + REEMBOLSO

**❌ O que NÃO PODEMOS automatizar (2/17 campos = 12%):**
1. COD CENTRO CUSTO - Não disponível em API nem planilhas
2. DIREÇÃO - Não disponível em API nem planilhas
3. OBS - Campo manual (irrelevante conforme usuário)

**Implementação Realizada:**
1. ✅ Criado `lib/vexpenses-calculations.ts` com funções de cálculo financeiro via API
2. ✅ Criado endpoint `/api/vexpenses/financial-calculations` para calcular dados por usuário
3. ✅ Testado endpoint `/v2/expenses` com sucesso
4. ✅ Mapeados todos os campos da planilha 1
5. ✅ Analisadas todas as sheets de ambas as planilhas
6. ✅ Identificadas sheets com dados financeiros (QUINZENAS, ADICIONAIS, REEMBOLSO, SALDO CARTAO, EXTRATO)

**Próximos Passos:**
1. Criar funções para ler dados das sheets (QUINZENAS, ADICIONAIS, REEMBOLSO, SALDO CARTAO, EXTRATO)
2. Implementar cálculo de SALDO FINAL e SALDO REEMBOLSAR a partir do EXTRATO
3. Integrar dados híbridos (API + planilhas) na página `test-planilha-1`
4. Usar CPF como chave para cruzar dados da API com planilhas

**Recomendação Final:**
Implementar abordagem híbrida: usar API VExpenses para dados cadastrais em tempo real e planilhas para dados financeiros históricos, alcançando **88% de automação** da planilha 1.
