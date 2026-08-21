# Análise de Capacidades da API VExpenses

## Resumo Executivo

Após investigação completa da API VExpenses v2, descobrimos que **a API NÃO fornece dados de saldo, limite ou cargas/transferências de quinzena**. Apenas despesas individuais estão disponíveis.

## Endpoints Disponíveis e Funcionais

### ✅ `/v2/team-members`
- **Dados disponíveis:** id, name, email, cpf, active, user_type, costsCenters, projects, approval_flow_id, expense_limit_policy_id
- **Limitações:** 
  - `expense_limit_policy_id` existe mas endpoint `/v2/expense-limit-policies` não suporta GET
  - `parameters` é sempre null
  - Não há campos de saldo/limite

### ✅ `/v2/expenses`
- **Dados disponíveis:** id, user_id, value, date, title, reimbursable, payment_method, costs_center, user
- **Filtros funcionais:**
  - `search: date:YYYY-MM-DD,YYYY-MM-DD` com `searchFields: date:between`
  - `search: user_id:XXX` com `searchFields: user_id:=`
  - `search: reimbursable:true/false` com `searchFields: reimbursable:=`
  - Combinação de filtros com `searchJoin: and` e separador `;`
- **Limitações:**
  - Contém apenas despesas, não cargas/transferências
  - Campo `reimbursable` parece não ser usado (0 despesas reembolsáveis em abril/2026)
  - Não há indicação de tipo de transação (carga vs descarga)

### ✅ `/v2/costs-centers`
- **Dados disponíveis:** id, name, integration_id, approval_flow_id
- **Status:** Funciona (diferente do documentado anteriormente)

### ✅ `/v2/reports`
- **Dados disponíveis:** id, user_id, description, status, approval_date, payment_date, pdf_link, excel_link
- **Limitações:**
  - Não inclui as despesas individuais do relatório
  - Endpoint `/v2/reports/{id}/expenses` não existe (404)

### ✅ `/v2/projects`
- **Dados disponíveis:** id, name, company_name, cnpj, etc.

### ✅ `/v2/approval-flows`
- **Dados disponíveis:** id, description, steps, approvers

## Endpoints NÃO Disponíveis

### ❌ `/v2/cards`
- **Erro:** 405 - GET method not supported

### ❌ `/v2/wallets`
- **Erro:** 405 - GET method not supported

### ❌ `/v2/balances`
- **Erro:** 405 - GET method not supported

### ❌ `/v2/transfers`
- **Erro:** 405 - GET method not supported

### ❌ `/v2/payments`
- **Erro:** 405 - GET method not supported

### ❌ `/v2/expense-limit-policies`
- **Erro:** 405 - GET method not supported

### ❌ `/v2/team-members/{id}/cards`
- **Erro:** 404 - URL not found

### ❌ `/v2/team-members/{id}/parameters`
- **Erro:** 404 - URL not found

## Payment Methods Disponíveis

Baseado em 8.269 despesas de abril/2026:
- **Saque VExpenses:** 4.003 despesas (R$ 386.105,22)
- **Cartão Corporativo Itaú:** 2.577 despesas (R$ 447.412,67)
- **Cartão VExpenses:** 1.489 despesas (R$ 138.582,39)
- **Pix VExpenses:** 158 despesas (R$ 56.592,54)
- **Recurso Próprio:** 40 despesas (R$ 5.233,00)
- **Tarifa de Saque:** 2 despesas (R$ 371,00)

## Mapeamento: Planilha vs API

### Campos da Planilha que PODEM ser obtidos via API

| Campo Planilha | Fonte API | Status | Observações |
|----------------|------------|--------|-------------|
| PORTADOR | `/v2/team-members` | ✅ 100% | Campo `name` |
| CPF | `/v2/team-members` | ✅ 100% | Campo `cpf` |
| STATUS COLAB | `/v2/team-members` | ✅ 100% | Campo `active` |
| CENTRO CUSTO | `/v2/team-members` + `/v2/costs-centers` | ⚠️ Parcial | API retorna array de centros, planilha mostra principal |
| REEMBOLSO | `/v2/expenses` | ⚠️ Parcial | Campo `reimbursable` parece não ser usado |

### Campos da Planilha que NÃO PODEM ser obtidos via API

| Campo Planilha | Motivo |
|----------------|--------|
| 1QZ (Quinzena) | Cargas/transferências não estão em `/v2/expenses` |
| SALDO CARTAO | Não há endpoint de saldo do cartão |
| STATUS DO CARTAO | Endpoint `/v2/cards` não suporta GET |
| ADIANTAMENTO | Não disponível na API |
| SALDO FINAL | Requer dados de carga não disponíveis |
| CARGA PARCIAL | Requer 1QZ não disponível |
| CARGA FINAL | Requer 1QZ não disponível |
| COD CENTRO CUSTO | Código interno não exposto |
| GESTOR / DIREÇÃO | Não disponível na API |
| OBS | Campo manual, sem equivalente |

### Campos que Podem ser CALCULADOS via API (com limitações)

| Campo | Cálculo Possível | Limitação |
|-------|-----------------|-----------|
| Total de despesas por período | Soma de `/v2/expenses` filtrado por data | ✅ Funciona |
| Despesas por payment_method | Filtro em `/v2/expenses` | ✅ Funciona |
| Despesas por quinzena | Filtro de data em `/v2/expenses` | ⚠️ São despesas, não cargas |
| REEMBOLSO (se funcionasse) | Filtro `reimbursable:true` em `/v2/expenses` | ❌ Campo não é usado |

## Conclusão

A API VExpenses v2 **NÃO é suficiente** para replicar completamente a planilha de controle financeiro. Os principais problemas são:

1. **Falta de dados de saldo/limite:** Não há endpoint para obter saldo atual do cartão ou limite disponível
2. **Falta de cargas/transferências:** As quinzenas não são registradas como despesas, não dá para calcular 1QZ
3. **Campo reembursável não usado:** Todas as 8.269 despesas de abril/2026 têm `reimbursable: false`
4. **Sem dados de cartão:** Não é possível obter status do cartão via API

## Recomendações

### Opção 1: API Parcial + Dados Manuais
- Usar API para: PORTADOR, CPF, STATUS COLAB, CENTRO CUSTO, despesas individuais
- Inserir manualmente ou via planilha: 1QZ, SALDO CARTAO, ADIANTAMENTO, STATUS DO CARTAO

### Opção 2: Investigar API v3 ou Outros Endpoints
- Verificar se existe versão v3 da API com mais recursos
- Entrar em contato com suporte VExpenses para documentação completa
- Verificar se há endpoints não documentados

### Opção 3: Integração Direta com Banco
- Para dados de saldo/limite, pode ser necessário integração direta com banco emissor do cartão
- Isso estaria fora do escopo da API VExpenses

## Próximos Passos Sugeridos

1. **Validar com usuário:** Confirmar se a empresa tem acesso a outros endpoints ou APIs
2. **Contatar VExpenses:** Solicitar documentação completa de endpoints financeiros
3. **Avaliar viabilidade:** Decidir se API parcial é suficiente ou se precisa de outra solução
