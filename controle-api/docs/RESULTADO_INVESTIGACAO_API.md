# Resultado da Investigação da API VExpenses

## Conclusão: DADOS FINANCEIROS NÃO ESTÃO DISPONÍVEIS VIA API

Após investigação exaustiva testando 50+ endpoints e combinações, **não é possível obter os dados de SALDO CARTÃO, CARGA, TRANSFERÊNCIA e TARIFA via API pública VExpenses**.

## Endpoints que Funcionam

### Dados Cadastrais
- `GET /v2/team-members` - Lista todos os usuários (nome, CPF, active)
- `GET /v2/team-members/{id}` - Dados de um usuário específico
- `GET /v2/team-members?search=cpf:{cpf}` - Busca por CPF

### Relatórios de Despesas
- `GET /v2/reports` - Lista todos os relatórios
- `GET /v2/reports?search=status:3` - Relatórios aprovados (status=3)
- `GET /v2/reports?search=user_id:{id}` - Relatórios de um usuário
- `GET /v2/reports/{id}` - Detalhes de um relatório
- `GET /v2/reports/{id}?include=expenses` - Relatório com despesas
- `GET /v2/reports/{id}?include=expenses,team_member,payment_method` - Relatório com includes

### Autenticação
- Header: `Authorization: {API_KEY}` (SEM "Bearer")
- Header: `Content-Type: application/json`

## Endpoints BLOQUEADOS (Erro 405 - Método Não Suportado)

Todos os endpoints que poderiam conter dados financeiros retornam erro 405:

### Saldo e Cartões
- `/v2/cards` - Apenas OPTIONS
- `/v2/wallets` - Apenas OPTIONS
- `/v2/balances` - Apenas OPTIONS
- `/v2/balance` - Apenas OPTIONS
- `/v2/card-balance` - Apenas OPTIONS
- `/v2/accounts` - Apenas OPTIONS

### Transações Financeiras
- `/v2/transactions` - Apenas OPTIONS
- `/v2/statements` - Apenas OPTIONS
- `/v2/movements` - Apenas OPTIONS
- `/v2/card-transactions` - Apenas OPTIONS
- `/v2/extracts` - Apenas OPTIONS
- `/v2/financial` - Apenas OPTIONS
- `/v2/recharges` - Apenas OPTIONS
- `/v2/payments` - Apenas OPTIONS
- `/v2/transfers` - Apenas OPTIONS
- `/v2/fees` - Apenas OPTIONS

### Analytics e Resumos
- `/v2/dashboard` - Apenas OPTIONS
- `/v2/summary` - Apenas OPTIONS
- `/v2/statistics` - Apenas OPTIONS
- `/v2/analytics` - Apenas OPTIONS
- `/v2/wallet` - Apenas OPTIONS

### Outros
- `/v2/companies` - Apenas OPTIONS
- `/v2/payment-methods` - Apenas OPTIONS
- `/v2/reimbursements` - Apenas OPTIONS
- `/v2/adjustments` - Apenas OPTIONS
- `/v2/advances` - Apenas POST (não aceita GET)

## Endpoints que Retornam 404 (Não Encontrado)

- `/v2/team-members/{id}/balance`
- `/v2/team-members/{id}/cards`
- `/v2/team-members/{id}/transactions`
- `/v2/companies/{id}`
- `/v2/companies/{id}/balance`
- `/v2/companies/{id}/wallet`
- `/v2/companies/{id}/transactions`
- `/v2/payment-methods/{id}`
- `/v2/analytics/{id}`

## Testes com Usuários de Referência

### JORGE ANTONIO VARGAS DA SILVA (user_id: 896184, CPF: 01063690080)
- **Dados esperados**: CARGA R$ 6.288,62, TRANSFERÊNCIA R$ -550,00, TARIFA R$ -77,00, SALDO CARTÃO R$ 64,00
- **Resultado**: Nenhum relatório encontrado na API
- **Conclusão**: Usuário não tem registros de prestação de contas na API

### JOSE MARCOS PEREIRA VAZ (user_id: 896191, CPF: 69071934004)
- **Dados esperados**: CARGA R$ 3.723,95, TRANSFERÊNCIA R$ -639,78, TARIFA R$ -42,00, SALDO CARTÃO R$ 300,00
- **Resultado**: Nenhum relatório encontrado na API
- **Conclusão**: Usuário não tem registros de prestação de contas na API

## Possíveis Soluções Alternativas

### 1. Exportação Manual via Interface Web
- Acessar o painel VExpenses
- Exportar extrato/balance via interface
- Importar arquivo exportado para processamento

### 2. Integração Direta com Banco de Dados
- Solicitar acesso direto ao banco de dados da VExpenses
- Consultar tabelas de transações, saldos e movimentações
- Requer autorização e acesso de infraestrutura

### 3. Contato com Suporte VExpenses
- Solicitar documentação de API completa
- Verificar se existe endpoint diferente para dados financeiros
- Verificar se é necessário upgrade de plano/contrato

### 4. Webhook ou Integração Personalizada
- Solicitar integração personalizada com VExpenses
- Configurar webhook para receber atualizações de saldo
- Requer negociação com a VExpenses

## Comandos CURL Testados

### Autenticação Funcionando
```bash
curl.exe -X GET "https://api.vexpenses.com/v2/team-members" \
  -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  -H "Content-Type: application/json"
```

### Busca de Usuário por CPF
```bash
curl.exe -X GET "https://api.vexpenses.com/v2/team-members?search=cpf:01063690080" \
  -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  -H "Content-Type: application/json"
```

### Relatórios Aprovados
```bash
curl.exe -X GET "https://api.vexpenses.com/v2/reports?search=status:3" \
  -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  -H "Content-Type: application/json"
```

### Relatório com Despesas
```bash
curl.exe -X GET "https://api.vexpenses.com/v2/reports/{id}?include=expenses" \
  -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  -H "Content-Type: application/json"
```

## Recomendação

**A API pública VExpenses NÃO fornece acesso aos dados financeiros necessários** (SALDO CARTÃO, CARGA, TRANSFERÊNCIA, TARIFA). 

Para obter esses dados, é necessário:
1. Contatar o suporte VExpenses para verificar se existe endpoint não documentado
2. Solicitar acesso a integração personalizada
3. Ou utilizar exportação manual via interface web

Os dados cadastrais (nome, CPF, situação) e de prestação de contas (reports/expenses) estão disponíveis via API, mas não são suficientes para calcular a carga quinzenal conforme especificado no busca-api.md.
