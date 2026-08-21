# Investigação API VExpenses - Resultados Completos

**Data:** 12/06/2026  
**Objetivo:** Encontrar endpoints para CARGA, TRANSFERÊNCIA, TARIFA e SALDO CARTÃO por colaborador  
**Status:** ❌ **DADOS NÃO DISPONÍVEIS VIA API**

---

## Resumo Executivo

Após investigação exaustiva da API VExpenses v2, **os dados financeiros de cartão (CARGA, TRANSFERÊNCIA, TARIFA, SALDO CARTÃO) NÃO estão disponíveis via API**.

A API VExpenses fornece apenas:
- Dados cadastrais de colaboradores (`/v2/team-members`)
- Despesas individuais (`/v2/expenses`)
- Relatórios de prestação de contas (`/v2/reports`)

Os dados de saldo e movimentação do cartão são mantidos em arquivos Excel externos (`CONTROLE - VEXPENSES - MAIO - 2026.xlsb`) e atualizados manualmente.

---

## Endpoints Testados (Todos via CURL)

### 1. Endpoints de Cartão/Balance - TODOS FALHARAM (405)

```bash
# Testados em 12/06/2026
curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/cards"
# Resultado: 405 - GET method not supported

curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/wallets"
# Resultado: 405 - GET method not supported

curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/balance"
# Resultado: 405 - GET method not supported

curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/balances"
# Resultado: 405 - GET method not supported
```

### 2. Endpoints de Transações - TODOS FALHARAM (405)

```bash
curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/transactions"
# Resultado: 405 - GET method not supported

curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/statements"
# Resultado: 405 - GET method not supported

curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/extracts"
# Resultado: 405 - GET method not supported

curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/card-transactions"
# Resultado: 405 - GET method not supported

curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/transfers"
# Resultado: 405 - GET method not supported
```

### 3. Endpoints de Pagamentos/Reembolsos - TODOS FALHARAM (405)

```bash
curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/payments"
# Resultado: 405 - GET method not supported

curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/reimbursements"
# Resultado: 405 - GET method not supported

curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/loads"
# Resultado: 405 - GET method not supported

curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/recharges"
# Resultado: 405 - GET method not supported

curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/financial"
# Resultado: 405 - GET method not supported

curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/financials"
# Resultado: 405 - GET method not supported
```

### 4. Endpoints de Tipos - FALHARAM (405)

```bash
curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/expense-types"
# Resultado: 405 - GET method not supported

curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/payment-methods"
# Resultado: 405 - GET method not supported
```

### 5. Team-Members com Includes - SEM DADOS DE CARTÃO

```bash
# Testado com user_id 896184 (JORGE ANTONIO VARGAS DA SILVA)
curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/team-members/896184?include=card,wallet,balance"
# Resultado: Retorna dados básicos do usuário, sem campos de cartão/wallet/balance

curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/team-members/896184?include=cards,wallets,balances"
# Resultado: Mesmo resultado - sem dados de cartão

curl -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  "https://api.vexpenses.com/v2/team-members/896184?include=payments,reimbursements"
# Resultado: Mesmo resultado - sem dados de pagamentos/reembolsos
```

**Resposta da API (todos os includes):**
```json
{
  "id": 896184,
  "integration_id": "011587",
  "external_id": null,
  "company_id": 1825947,
  "role_id": null,
  "approval_flow_id": 172532,
  "expense_limit_policy_id": 16805,
  "user_type": "USUARIO",
  "name": "JORGE ANTONIO VARGAS DA SILVA",
  "email": "jorge.vargas@eqsengenharia.com.br",
  "cpf": "01063690080",
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
  "created_at": "2025-04-16 17:40:45",
  "updated_at": "2025-05-19 11:32:10"
}
```

**Nota:** Não há campos como `card`, `wallet`, `balance`, `cards`, `wallets`, `balances`, `payments`, `reimbursements` na resposta.

---

## Análise de Expenses (Única Fonte Disponível)

### Endpoint /v2/expenses

A API retorna despesas individuais com os seguintes campos:
- `id`, `user_id`, `date`, `value`, `title`
- `expense_type_id`, `payment_method_id`
- `expense_type` (quando incluído)
- `payment_method` (quando incluído)

**Problema:** As despesas são transações de GASTO, não de CARGA/RECARGA.

### Payment Method ID 627401

Análise de expenses mostra:
```json
"payment_method_id": 627401,
"payment_method": {
  "data": {
    "id": 627401,
    "description": "Cartão Corporativo Itaú",
    "reimbursable": false,
    "affects_advance": true
  }
}
```

**Descoberta:** O payment_method_id 627401 é "Cartão Corporativo Itaú", NÃO "Cartão VExpenses".

Isso significa que:
- As despesas registradas na API são feitas com cartão Itaú corporativo
- O cartão VExpenses (pré-pago) é um sistema separado
- A API VExpenses não controla o saldo do cartão VExpenses

---

## Conclusão Baseada em Documentação Existente

### Documentação Interna Confirma Limitação

Arquivo `docs/05-investigacao-sheets-automation.md` (linhas 421-423):
> "Os dados de **SALDO FINAL, SALDO CARTÃO e SALDO REEMBOLSAR** **NÃO** estão disponíveis na API VExpenses. Eles são mantidos em arquivos Excel externos (`CONTROLE - VEXPENSES - ABRIL- 2026.xlsb` e `1QZ ABRIL 2026 - VEXPENSES.xlsx`) que são atualizados manualmente."

Arquivo `docs/01-api-endpoints-completos.md` (linhas 687-698):
> ### ❌ `/v2/cards`
> - **Erro:** 405 - GET method not supported
> - **Status:** Não é possível obter dados de cartões via API
> 
> ### ❌ `/v2/wallets`
> - **Erro:** 405 - GET method not supported
> - **Status:** Não é possível obter dados de carteiras via API
> 
> ### ❌ `/v2/balances`
> - **Erro:** 405 - GET method not supported
> - **Status:** Não é possível obter saldos via API

Arquivo `docs/10-mapeamento-carga-quinzenal.md` (linhas 122-126):
> - `carga` = total carregado no cartão VExpenses (`/v2/expenses` tipo CARGA)
> - `transferencia` = transferências realizadas (`/v2/expenses` tipo TRANSFERÊNCIA)
> - `tarifa` = tarifas bancárias
> - `prestação_de_contas` = despesas aprovadas nos relatórios (`/v2/reports`)
> - `saldo_cartao` = saldo atual do cartão

**Nota:** O documento menciona `/v2/expenses tipo CARGA`, mas na prática não existe um tipo de despesa "CARGA" na API. As despesas são apenas gastos.

---

## Valores de Referência (NÃO Encontrados na API)

### JORGE ANTONIO VARGAS DA SILVA (user_id: 896184, CPF: 01063690080)

Valores esperados (MAIO 2026):
- **CARGA:** R$ 6.288,62
- **TRANSFERENCIA:** R$ -550,00
- **TARIFA:** R$ -77,00
- **PRESTAÇÃO DE CONTAS:** R$ 5.463,92
- **SALDO PRESTAÇÃO:** R$ 197,70
- **SALDO CARTÃO:** R$ 64,00
- **SALDO FINAL:** R$ 133,70

**Resultado da API:** Nenhum destes valores está disponível via endpoints testados.

### JOSE MARCOS PEREIRA VAZ (user_id: 896191, CPF: 69071934004)

Valores esperados (MAIO 2026):
- **CARGA:** R$ 3.723,95
- **TRANSFERENCIA:** R$ -639,78
- **TARIFA:** R$ -42,00
- **PRESTAÇÃO DE CONTAS:** R$ 2.631,78
- **SALDO PRESTAÇÃO:** R$ 410,39
- **SALDO CARTÃO:** R$ 300,00
- **SALDO FINAL:** R$ 110,39

**Resultado da API:** Nenhum destes valores está disponível via endpoints testados.

---

## Estratégia Alternativa Sugerida

### Opção 1: Continuar com Planilha Manual (Status Quo)

Manter o processo atual:
- Dados de CARGA, TRANSFERÊNCIA, TARIFA, SALDO CARTÃO vêm do Excel `CONTROLE - VEXPENSES`
- Dados cadastrais (colaborador, CPF, situação, centro de custo) podem vir da API
- PRESTAÇÃO DE CONTAS pode vir da API (`/v2/reports?include=expenses`)

**Vantagens:**
- Processo já estabelecido
- Dados financeiros confiáveis (mantidos manualmente)

**Desvantagens:**
- Dependência de atualização manual
- Possibilidade de erros humanos

### Opção 2: Calcular a Partir de Expenses (Limitado)

Tentar derivar valores a partir de `/v2/expenses`:
- Filtrar por `payment_method_id` correspondente a cartão VExpenses (se existir)
- Somar valores por período para estimar "gastos"
- **Problema:** Não existe registro de CARGA/RECARGA em expenses

**Vantagens:**
- Dados automatizados

**Desvantagens:**
- Impossível obter CARGA, TRANSFERÊNCIA, TARIFA
- Impossível obter SALDO CARTÃO atual
- Dados incompletos

### Opção 3: Integração Direta com Sistema VExpenses (Requer Acesso)

Solicitar à VExpenses:
- Acesso a endpoint interno de cartões (se existir)
- Exportação programática de extrato de cartão
- Webhook para atualizações de saldo

**Vantagens:**
- Dados completos e automatizados
- Atualização em tempo real

**Desvantagens:**
- Requer negociação com VExpenses
- Pode não estar disponível
- Pode ter custo adicional

---

## Recomendação

**Recomendação imediata:** Manter processo atual (Opção 1) com automação parcial:

1. **Automatizar via API:**
   - Dados cadastrais: `/v2/team-members`
   - Centro de custo: `/v2/team-members?include=costsCenters`
   - PRESTAÇÃO DE CONTAS: `/v2/reports?include=expenses`

2. **Manter manual:**
   - CARGA, TRANSFERÊNCIA, TARIFA (do Excel CONTROLE)
   - SALDO CARTÃO (do Excel CONTROLE)
   - 1ª QZ (valor definido operacionalmente)

3. **Melhorias de processo:**
   - Automatizar importação do Excel CONTROLE para SQLite
   - Criar validações cruzadas entre API e Excel
   - Implementar alertas quando dados estiverem desatualizados

---

## Comandos CURL Úteis (Para Referência Futura)

### Dados Cadastrais (Funciona)
```bash
curl -s -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  -H "Accept: application/json" \
  "https://api.vexpenses.com/v2/team-members?paginate=false&per_page=1000&include=costsCenters"
```

### Reports com Expenses (Funciona)
```bash
curl -s -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  -H "Accept: application/json" \
  "https://api.vexpenses.com/v2/reports?search=status:3&include=user,expenses"
```

### Expenses por Período (Funciona, mas limitado)
```bash
curl -s -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  -H "Accept: application/json" \
  "https://api.vexpenses.com/v2/expenses?search=date:2026-05-01,2026-05-31&searchFields=date:between&paginate=true&page=1&per_page=200&include=user,expense_type,payment_method"
```

---

## Conclusão Final

**A API VExpenses NÃO fornece os dados necessários para calcular CARGA, TRANSFERÊNCIA, TARIFA e SALDO CARTÃO.**

Estes dados são mantidos exclusivamente em arquivos Excel externos e atualizados manualmente. A única automação possível via API é para dados cadastrais e prestação de contas (despesas aprovadas).

Para uma solução completa automatizada, seria necessário:
1. Acesso a endpoint interno da VExpenses (se existir)
2. Ou integração direta com o sistema bancário/operador do cartão VExpenses
3. Ou mudança para um sistema que exponha estes dados via API
