# Documentação da API VExpenses - Controle API

## Visão Geral

Esta documentação completa descreve todas as formas de acessar e utilizar a API VExpenses v2 através da aplicação dashboard-test, incluindo endpoints, filtros, estratégias de cache e limitações.

## Estrutura da Documentação

### 📚 Documentos Disponíveis

1. **[00-README.md](./00-README.md)** - Este documento
   - Visão geral e índice da documentação

2. **[01-api-endpoints-completos.md](./01-api-endpoints-completos.md)** - Endpoints da API VExpenses
   - Configuração base e autenticação
   - Todos os endpoints GET e POST
   - Parâmetros, respostas e exemplos
   - Endpoints não disponíveis
   - Estratégias de cache
   - Métodos de pagamento
   - Cálculos financeiros
   - Tratamento de erros
   - Boas práticas

3. **[02-endpoints-internos-proxy.md](./02-endpoints-internos-proxy.md)** - Endpoints Internos da Aplicação
   - Endpoints proxy para API VExpenses
   - Sistema de cache (debug, metadata, status, refresh)
   - Endpoints de planilha (quinzena, spreadsheet-data)
   - Endpoints de cálculos financeiros
   - Estratégias de stale-while-revalidate
   - TTLs e cache keys
   - Tratamento de erros

4. **[03-filtros-e-acesso-dados.md](./03-filtros-e-acesso-dados.md)** - Filtros e Acesso aos Dados
   - Sistema de filtros da API VExpenses
   - Operadores disponíveis (between, =, >=, <=, >, <)
   - Campos filtráveis em expenses
   - Combinação de filtros
   - Parâmetro `include`
   - Paginação
   - Estratégias de busca comuns
   - Otimização de requisições
   - Exemplos práticos


6. **[05-investigacao-sheets-automation.md](./05-investigacao-sheets-automation.md)** - Investigação Sheets Automation
   - Descobertas críticas sobre fonte de dados
   - Arquivo CONTROLE e 1QZ ABRIL 2026
   - Investigação de 200+ endpoints não documentados
   - Descobertas sobre gestores e direção
   - Método de extração de dados da API
   - Estratégias para quinzenas futuras
   - Scripts de automação disponíveis
   - Planos de ação imediato

## Configuração Base

### API VExpenses
- **Base URL:** `https://api.vexpenses.com/v2`
- **Autenticação:** Header `Authorization` com API key
- **Variáveis de Ambiente:**
  - `NEXT_PUBLIC_API_URL`: URL base da API
  - `VEXPENSES_API_KEY`: Chave de autenticação

### Aplicação Proxy
- **Base URL:** `http://localhost:3000` (ou URL de produção)
- **Prefixo:** `/api`
- **Benefícios:** Cache, tratamento de erros, lógica de negócio

## Resumo dos Principais Endpoints

### API VExpenses Direta

| Endpoint | Método | Descrição | Cache |
|----------|--------|-----------|-------|
| `/v2/team-members` | GET | Lista de membros da equipe | 10 min |
| `/v2/expenses` | GET/POST | Despesas com filtros avançados | Auto |
| `/v2/reports` | GET/POST | Relatórios de despesas | Auto |
| `/v2/costs-centers` | GET | Centros de custo | 6 horas |
| `/v2/expenses-type` | GET | Tipos de despesas | 15 min |
| `/v2/projects` | GET | Projetos | - |
| `/v2/approval-flows` | GET | Fluxos de aprovação | - |

### Endpoints Proxy Internos

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/vexpenses/expenses` | GET/POST | Proxy expenses com cache |
| `/api/vexpenses/reports` | GET/POST | Proxy reports com cache |
| `/api/vexpenses/team-members` | GET | Proxy team-members com cache |
| `/api/vexpenses/costs-centers` | GET | Proxy costs-centers com cache |
| `/api/vexpenses/expenses-type` | GET | Proxy expenses-type com cache |
| `/api/vexpenses/financial-calculations` | GET | Cálculos financeiros |
| `/api/vexpenses/planilha-completa` | GET | Planilha completa |
| `/api/vexpenses/saldo-complete` | GET | Saldos completos |
| `/api/cache/debug` | GET | Debug do cache |
| `/api/cache/refresh` | POST | Refresh do cache |
| `/api/planilha-quinzena` | GET | Dados da quinzena |
| `/api/spreadsheet-data` | GET | Dados de planilhas locais |

## Descobertas da Investigação Sheets Automation

### Fonte Real dos Dados Financeiros

**Arquivo CONTROLE:** `CONTROLE - VEXPENSES - ABRIL- 2026.xlsb`
- Contém dados de saldo do cartão, quinzenas, adicionais
- Mantido manualmente (atualizado por processo externo)
- Não é gerado pela API VExpenses

**Arquivo Alternativo:** `1QZ ABRIL 2026 - VEXPENSES.xlsx`
- Contém todos os dados necessários com 100% de precisão
- Campos: SALDO FINAL, 1QZ, SALDO CARTÃO, CARGA PARCIAL, REEMBOLSO, CARGA FINAL
- 336 linhas, 329 usuários

### Endpoints Não Documentados Testados

**Total testado:** 200+ endpoints
**Funcionais:** 5 endpoints
**Bloqueados (405):** 195+ endpoints

**Endpoints funcionais:**
- `/v2/team-members?include=manager`
- `/v2/approval-flows`
- `/v2/costs-centers`
- `/v2/reports` (4.14MB de dados)
- `/v2/team-members/{id}`

### Gestores e Direção Mapeados

**Gestor Principal:**
- ID: 896113
- Nome: FERNANDA ARAGÃO LOPES
- Função: Aprovadora final em TODOS os fluxos de aprovação
- Nível: DIRETORIA

**Gestores Intermediários:**
- ADILSON RODRIGUES FERREIRA (ID: 895948)
- THIAGO NEVES DE FREITAS (ID: 896397)

### Estratégias para Quinzenas Futuras

**Recomendada:** Integração com fonte do CONTROLE
- Identificar sistema que gera o arquivo (banco/ERP)
- Implementar integração automatizada
- Eliminar dependência de arquivo manual

**Alternativa:** Automação do arquivo CONTROLE
- Script que roda a cada quinzena
- Baixa arquivo CONTROLE do período
- Extrai dados e gera JSON para dashboard

## Principais Funcionalidades

### ✅ Disponível via API

- Dados cadastrais (usuários, centros de custo, tipos de despesa)
- Despesas individuais com filtros avançados
- Relatórios e seus metadados
- Fluxos de aprovação
- Projetos
- Cache inteligente com stale-while-revalidate
- Cálculos financeiros básicos

### ❌ Não Disponível via API

- Saldos de cartão
- Limites de cartão
- Cargas/transferências
- Status do cartão
- Dados financeiros completos (saldos, cargas, descargas)
- Adiantamentos
- Gestores e diretores

### 🔧 Workarounds Disponíveis

- Padrões matemáticos para estimar saldos
- Combinação de API + planilhas locais
- Índice local de dados históricos
- Cálculos baseados em expenses

## Estratégias de Cache

### TTLs (Time To Live)

- **Costs Centers:** 6 horas
- **Expenses Type:** 15 minutos
- **Team Members:** 10 minutos
- **Reports:** Automático
- **Expenses:** Automático

### Stale-While-Revalidate

- Dados stale são retornados imediatamente
- Refresh acontece em background
- Melhora experiência do usuário

### Cache Keys

- `expenses:{include}:{search}:{page}:{perPage}`
- `reports:{include}`
- `team-members:{include}`
- `costs-centers`
- `expenses-type`

## Filtros Principais

### Expenses

- **Por data:** `date:YYYY-MM-DD,YYYY-MM-DD` com `date:between`
- **Por usuário:** `user_id:XXX` com `user_id:=`
- **Por reembolsável:** `reimbursable:true/false` com `reimbursable:=`
- **Por centro de custo:** `costs_center_id:XXX` com `costs_center_id:=`
- **Por método de pagamento:** `payment_method_id:XXX` com `payment_method_id:=`

### Combinação de Filtros

```typescript
search: 'date:2026-04-01,2026-04-30;user_id:895945;reimbursable:true'
searchFields: 'date:between;user_id:=;reimbursable:='
searchJoin: 'and'
```

### Includes

- `user` - Dados do usuário
- `costs_center` - Centro de custo
- `payment_method` - Método de pagamento
- `expense_type` - Tipo de despesa
- `report` - Relatório
- `apportionment` - Rateio
- `gps` - Dados GPS
- `fueling` - Dados de abastecimento

## Exemplos Rápidos

### Buscar Despesas de uma Quinzena

```typescript
const params = new URLSearchParams();
params.append('search', 'date:2026-04-01,2026-04-30');
params.append('searchFields', 'date:between');
params.append('include', 'user,costs_center,payment_method');
params.append('paginate', 'true');
params.append('page', '1');
params.append('per_page', '200');

const response = await fetch(`${API_URL}/v2/expenses?${params.toString()}`);
```

### Buscar Team Members

```typescript
const response = await fetch(`${API_URL}/v2/team-members?include=costsCenters&paginate=false&per_page=1000`, {
  headers: {
    'Authorization': API_KEY,
    'Accept': 'application/json',
  },
});
```

### Buscar Relatórios Aprovados

```typescript
const params = new URLSearchParams();
params.append('status', 'APPROVED');
params.append('include', 'user');

const response = await fetch(`${API_URL}/v2/reports?${params.toString()}`);
```

### Usar Endpoint Proxy com Cache

```typescript
const response = await fetch('/api/vexpenses/expenses?include=user,costs_center&search=date:2026-04-01,2026-04-30&searchFields=date:between&page=1&per_page=200');
const data = await response.json();
```

## Limitações Conhecidas

### Endpoints Não Funcionais (405)

### Endpoints Não Funcionais (405)

- `/v2/cards` - GET method not supported
- `/v2/wallets` - GET method not supported
- `/v2/balances` - GET method not supported
- `/v2/transfers` - GET method not supported
- `/v2/payments` - GET method not supported
- `/v2/expense-limit-policies` - GET method not supported

### Endpoints Não Encontrados (404)

- `/v2/team-members/{id}/cards`
- `/v2/team-members/{id}/parameters`
- `/v2/reports/{id}/expenses` (use `include=expenses`)

### Dados Não Disponíveis

- Saldo atual do cartão
- Limite disponível do cartão
- Status do cartão
- Cargas e transferências
- Adiantamentos
- Gestores e diretores
- Dados financeiros completos

## Boas Práticas

1. **Usar endpoints proxy** ao invés de chamadas diretas à API
2. **Fornecer filtros obrigatórios** em `/v2/expenses`
3. **Usar paginação** para grandes volumes (per_page=200)
4. **Cache agressivo** para dados estáticos
5. **Stale-while-revalidate** para performance
6. **Tratamento graceful** de erros
7. **Otimizar filtros** para evitar timeouts
8. **Monitorar performance** e ajustar timeouts

## Próximos Passos

1. **Ler a documentação completa:**
   - Comece com [01-api-endpoints-completos.md](./01-api-endpoints-completos.md)
   - Continue com [02-endpoints-internos-proxy.md](./02-endpoints-internos-proxy.md)
   - Veja [03-filtros-e-acesso-dados.md](./03-filtros-e-acesso-dados.md)
   - Consulte [04-limitacoes-e-workarounds.md](./04-limitacoes-e-workarounds.md)

2. **Testar os endpoints:**
   - Use os exemplos fornecidos
   - Verifique as respostas
   - Ajuste conforme necessário

3. **Implementar na aplicação:**
   - Use endpoints proxy para cache
   - Implemente filtros conforme necessário
   - Adicione tratamento de erros

4. **Monitorar e otimizar:**
   - Acompanhe performance
   - Ajuste TTLs do cache
   - Otimize filtros e requisições

## Suporte

Para dúvidas ou problemas:

1. Consulte a documentação específica de cada endpoint
2. Verifique os exemplos práticos
3. Revise as limitações conhecidas
4. Consulte os workarounds disponíveis

## Conclusão

Esta documentação fornece um guia completo para utilizar a API VExpenses através da aplicação dashboard-test, incluindo:

- **Configuração e autenticação**
- **Todos os endpoints disponíveis**
- **Sistema de filtros avançado**
- **Estratégias de cache**
- **Limitações e workarounds**
- **Exemplos práticos**
- **Boas práticas**

A combinação de API VExpenses + endpoints proxy + cache inteligente + dados locais permite criar uma solução robusta para controle financeiro, mesmo com as limitações da API.
