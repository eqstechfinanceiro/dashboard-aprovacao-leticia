# 📊 API VExpenses - Documentação Completa

## 🎯 Visão Geral

**Base URL**: `https://api.vexpenses.com`  
**Versão**: v2  
**Autenticação**: Header `Authorization` com API Key

**Configuração**:
```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Authorization': API_KEY,
    'Accept': 'application/json',
  },
});
```

---

## ✅ Dados Disponíveis na API

### 1. Team Members (Membros da Equipe)

**Endpoint**: `/v2/team-members`

**Dados disponíveis**:
- ✅ `id` - ID do usuário
- ✅ `name` - Nome completo
- ✅ `cpf` - CPF
- ✅ `email` - Email
- ✅ `phone1`, `phone2` - Telefones
- ✅ `birth_date` - Data de nascimento
- ✅ `bank` - Banco
- ✅ `agency` - Agência
- ✅ `account` - Conta
- ✅ `pix_key` - Chave PIX
- ✅ `active` - Status ativo
- ✅ `confirmed` - Status confirmado
- ✅ `user_type` - Tipo de usuário
- ✅ `company_id` - ID da empresa
- ✅ `role_id` - ID do cargo
- ✅ `approval_flow_id` - ID do fluxo de aprovação
- ✅ `expense_limit_policy_id` - ID da política de limite
- ✅ `costsCenters` - Centros de custo (relacionamento)
- ✅ `projects` - Projetos (relacionamento)

**Como fazer requisição**:
```typescript
// Listar todos os membros
const response = await api.get('/v2/team-members', {
  params: {
    include: 'costsCenters,projects',
    paginate: false,
    per_page: 100
  }
});

// Obter membro por ID
const response = await api.get(`/v2/team-members/${id}`);

// Obter membro por email
const response = await api.get(`/v2/team-members/email/${email}`);

// Atualizar membro
const response = await api.put(`/v2/team-members/${id}`, data);

// Criar membro
const response = await api.post('/v2/team-members', data);

// Anexar centros de custo
const response = await api.post(`/v2/team-members/${id}/attach-cost-center`, {
  cost_center_external_code: costCenters
});

// Anexar projetos
const response = await api.post(`/v2/team-members/${id}/attach-projects`, {
  project_external_code: projects
});
```

**Limitações**:
- ❌ Não contém dados de cartão corporativo
- ❌ Não contém saldo de cartão
- ❌ Não contém dados financeiros (1QZ, saldo final, etc.)

---

### 2. Cost Centers (Centros de Custo)

**Endpoint**: `/v2/costs-centers`

**Dados disponíveis**:
- ✅ `id` - ID do centro de custo
- ✅ `integration_id` - ID de integração
- ✅ `name` - Nome
- ✅ `company_group_id` - ID do grupo de empresas
- ✅ `on` - Status ativo

**Como fazer requisição**:
```typescript
// Listar todos os centros de custo
const response = await api.get('/v2/costs-centers', {
  params: {
    paginate: false,
    per_page: 100
  }
});

// Obter centro de custo por ID
const response = await api.get(`/v2/costs-centers/${id}`);

// Criar centro de custo
const response = await api.post('/v2/costs-centers', data);

// Atualizar centro de custo
const response = await api.put(`/v2/costs-centers/${id}`, data);

// Deletar centro de custo
const response = await api.delete(`/v2/costs-centers/${id}`);
```

---

### 3. Projects (Projetos)

**Endpoint**: `/v2/projects`

**Dados disponíveis**:
- ✅ `id` - ID do projeto
- ✅ `name` - Nome
- ✅ `company_name` - Nome da empresa
- ✅ `cnpj` - CNPJ
- ✅ `address` - Endereço
- ✅ `neighborhood` - Bairro
- ✅ `city` - Cidade
- ✅ `state` - Estado
- ✅ `zip_code` - CEP
- ✅ `phone1`, `phone2` - Telefones
- ✅ `on` - Status ativo

**Como fazer requisição**:
```typescript
// Listar todos os projetos
const response = await api.get('/v2/projects', {
  params: {
    paginate: false,
    per_page: 100
  }
});

// Obter projeto por ID
const response = await api.get(`/v2/projects/${id}`);

// Criar projeto
const response = await api.post('/v2/projects', data);

// Atualizar projeto
const response = await api.put(`/v2/projects/${id}`, data);

// Deletar projeto
const response = await api.delete(`/v2/projects/${id}`);
```

---

### 4. Approval Flows (Fluxos de Aprovação)

**Endpoint**: `/v2/approval-flows`

**Dados disponíveis**:
- ✅ `id` - ID do fluxo
- ✅ `company_id` - ID da empresa
- ✅ `description` - Descrição
- ✅ `external_id` - ID externo
- ✅ `steps` - Etapas do fluxo
  - `operator` - Operador (AND/OR)
  - `entrance_value` - Valor de entrada
  - `order` - Ordem
  - `groups` - Grupos de aprovadores
    - `operator` - Operador
    - `approvers` - Lista de aprovadores

**Como fazer requisição**:
```typescript
// Listar todos os fluxos de aprovação
const response = await api.get('/v2/approval-flows');

// Obter fluxo por ID
const response = await api.get(`/v2/approval-flows/${id}`);

// Criar fluxo de aprovação
const response = await api.post('/v2/approval-flows', data);

// Atualizar fluxo de aprovação
const response = await api.put(`/v2/approval-flows/${id}`, data);

// Anexar centros de custo ao fluxo
const response = await api.post(`/v2/approval-flows/${id}/attach-cost-centers`, {
  cost_centers_ids: costCenterIds
});

// Deletar fluxo de aprovação
const response = await api.delete(`/v2/approval-flows/${id}`);
```

---

### 5. Expenses (Despesas)

**Endpoint**: `/v2/expenses`

**Dados disponíveis**:
- ✅ `id` - ID da despesa
- ✅ `user_id` - ID do usuário
- ✅ `expense_id` - ID da despesa
- ✅ `report_id` - ID do relatório
- ✅ `device_id` - ID do dispositivo
- ✅ `integration_id` - ID de integração
- ✅ `external_id` - ID externo
- ✅ `expense_type_id` - ID do tipo de despesa
- ✅ `payment_method_id` - ID do método de pagamento
- ✅ `paying_company_id` - ID da empresa pagadora
- ✅ `route_id` - ID da rota
- ✅ `receipt_url` - URL do recibo
- ✅ `date` - Data
- ✅ `value` - Valor
- ✅ `title` - Título
- ✅ `validate` - Validação
- ✅ `observation` - Observação
- ✅ `rejected` - Rejeitado
- ✅ `on` - Status ativo
- ✅ `reimbursable` - Reembolsável
- ✅ `mileage` - Quilometragem
- ✅ `mileage_value` - Valor por km
- ✅ `original_currency_iso` - Moeda original
- ✅ `exchange_rate` - Taxa de câmbio
- ✅ `converted_value` - Valor convertido
- ✅ `converted_currency_iso` - Moeda convertida
- ✅ `apportionment` - Rateios
- ✅ `user` - Dados do usuário (relacionamento)
- ✅ `expense_type` - Tipo de despesa (relacionamento)
- ✅ `costs_center` - Centro de custo (relacionamento)
- ✅ `payment_method` - Método de pagamento (relacionamento)
- ✅ `report` - Relatório (relacionamento)

**Como fazer requisição**:
```typescript
// Listar despesas (OBRIGATÓRIO: search e searchFields)
const response = await api.get('/v2/expenses', {
  params: {
    search: 'date:2020-01-01,2030-12-31',
    searchFields: 'date:between',
    include: 'apportionment,user,expense_type,costs_center,payment_method,report'
  }
});

// Obter despesa por ID
const response = await api.get(`/v2/expenses/${id}`, {
  params: {
    include: 'apportionment'
  }
});

// Criar despesa
const response = await api.post('/v2/expenses', data, {
  params: {
    include: 'apportionment'
  }
});

// Atualizar despesa
const response = await api.put(`/v2/expenses/${id}`, data, {
  params: {
    include: 'apportionment'
  }
});

// Deletar despesa
const response = await api.delete(`/v2/expenses/${id}`);
```

**Limitações CRÍTICAS**:
- ❌ **Endpoint BLOQUEADO** - Erro 422 "Filter fields are required"
- ❌ Exige campos de filtro específicos não documentados
- ❌ 34 combinações de filtros testadas, todas retornaram erro 422
- ❌ Não é possível acessar despesas individuais sem filtros específicos

---

### 6. Expense Types (Tipos de Despesas)

**Endpoint**: `/v2/expenses-type`

**Dados disponíveis**:
- ✅ `id` - ID do tipo
- ✅ `integration_id` - ID de integração
- ✅ `description` - Descrição
- ✅ `on` - Status ativo

**Como fazer requisição**:
```typescript
// Listar todos os tipos de despesas
const response = await api.get('/v2/expenses-type');

// Obter tipo por ID
const response = await api.get(`/v2/expenses-type/${id}`);

// Criar tipo de despesa
const response = await api.post('/v2/expenses-type', data);

// Atualizar tipo de despesa
const response = await api.put(`/v2/expenses-type/${id}`, data);

// Deletar tipo de despesa
const response = await api.delete(`/v2/expenses-type/${id}`);
```

---

### 7. Currencies (Moedas)

**Endpoint**: `/v2/currencies`

**Dados disponíveis**:
- ✅ `priority` - Prioridade
- ✅ `iso_code` - Código ISO
- ✅ `name` - Nome
- ✅ `symbol` - Símbolo
- ✅ `subunit` - Subunidade
- ✅ `subunit_to_unit` - Subunidade para unidade
- ✅ `symbol_first` - Símbolo primeiro
- ✅ `html_entity` - Entidade HTML
- ✅ `decimal_mark` - Marcador decimal
- ✅ `thousands_separator` - Separador de milhares
- ✅ `iso_numeric` - Código numérico ISO

**Como fazer requisição**:
```typescript
// Listar todas as moedas
const response = await api.get('/v2/currencies');
```

---

### 8. Advances (Adiantamentos)

**Endpoint**: `/v2/advances`

**Dados disponíveis**:
- ✅ `id` - ID do adiantamento
- ✅ `description` - Descrição
- ✅ `advance_user_id` - ID do usuário do adiantamento
- ✅ `registration_user_id` - ID do usuário de registro
- ✅ `release_date` - Data de liberação
- ✅ `value` - Valor
- ✅ `original_currency_iso` - Moeda original
- ✅ `advance_number` - Número do adiantamento
- ✅ `advance_report_id` - ID do relatório do adiantamento

**Como fazer requisição**:
```typescript
// Criar adiantamento
const response = await api.post('/v2/advances', data);
```

**Limitações**:
- ❌ **MÉTODO NÃO SUPORTADO** - Erro 405 "The GET method is not supported"
- ❌ Endpoint só aceita POST, não GET
- ❌ Não é possível listar adiantamentos existentes

---

### 9. Reports (Relatórios)

**Endpoint**: `/v2/reports`

**Dados disponíveis**:
- ✅ `id` - ID do relatório
- ✅ `external_id` - ID externo
- ✅ `user_id` - ID do usuário
- ✅ `device_id` - ID do dispositivo
- ✅ `description` - Descrição
- ✅ `status` - Status (ABERTO, APROVADO, REPROVADO, REABERTO, PAGO, ENVIADO)
- ✅ `approval_stage_id` - ID da etapa de aprovação
- ✅ `approval_user_id` - ID do usuário aprovador
- ✅ `approval_date` - Data de aprovação
- ✅ `paying_company_id` - ID da empresa pagadora
- ✅ `payment_date` - Data de pagamento
- ✅ `payment_method_id` - ID do método de pagamento
- ✅ `observation` - Observação
- ✅ `on` - Status ativo
- ✅ `justification` - Justificativa
- ✅ `pdf_link` - Link do PDF
- ✅ `excel_link` - Link do Excel
- ✅ `created_at` - Data de criação
- ✅ `updated_at` - Data de atualização
- ✅ `user` - Dados do usuário (relacionamento)
- ✅ `expenses` - Despesas do relatório (relacionamento)
- ✅ `expense` - Despesa do relatório (relacionamento)
- ✅ `payment_method` - Método de pagamento (relacionamento)
- ✅ `advance` - Adiantamento (relacionamento)

**Como fazer requisição**:
```typescript
// Listar todos os relatórios
const response = await api.get('/v2/reports', {
  params: {
    include: 'user,expenses,payment_method,advance'
  }
});

// Obter relatório por ID
const response = await api.get(`/v2/reports/${id}`, {
  params: {
    include: 'user,expenses,payment_method,advance'
  }
});

// Listar relatórios por status
const response = await api.get(`/v2/reports/status/${status}`, {
  params: {
    include: 'user,expenses,payment_method,advance',
    search: 'date:2020-01-01,2030-12-31',
    searchFields: 'date:between'
  }
});

// Criar relatório
const response = await api.post('/v2/reports', data);

// Pagar relatório
const response = await api.put(`/v2/reports/${id}/pay`, data);

// Aprovar relatório
const response = await api.post(`/v2/reports/${id}/approve`, data);
```

**Limitações**:
- ❌ **NÃO CONTÉM DADOS FINANCEIROS DIRETOS** (1QZ, saldo cartão, etc.)
- ❌ Arquivos Excel baixados via `excel_link` estão corrompidos
- ❌ Dados financeiros não estão nos campos de texto (observation, justification, description)

---

## ❌ Dados NÃO Disponíveis na API

### Dados Financeiros Críticos
- ❌ **1QZ (quinzena)** - Valor da primeira quinzena
- ❌ **Saldo Cartão** - Saldo do cartão corporativo
- ❌ **Saldo Final** - Saldo final do período
- ❌ **Saldo Reembolsar** - Valor a reembolsar
- ❌ **Adicionais** - Valores adicionais
- ❌ **Carga Parcial** - Carga parcial do cartão
- ❌ **Reembolso** - Valor de reembolso
- ❌ **Carga Final** - Carga final do cartão

### Endpoints Inexistentes/Bloqueados
- ❌ `/cards` - 405 (Método não suportado)
- ❌ `/balances` - 405 (Método não suportado)
- ❌ `/team-members/{id}/cards` - 404 (Não encontrado)
- ❌ `/team-members/{id}/balance` - 404 (Não encontrado)
- ❌ `/team-members/{id}/limits` - 404 (Não encontrado)

---

## 📱 Páginas Implementadas no Dashboard

### 1. Aprovações (`/aprovacoes`)

**Endpoint usado**: `/v2/reports`

**Funcionalidades**:
- Listar relatórios por status (ABERTO, APROVADO, REPROVADO, etc.)
- Filtrar por data, cartão, ano, regional
- Aprovar/rejeitar relatórios
- Ver detalhes do relatório
- Baixar PDF/Excel do relatório

**Hooks usados**:
- `useReports()` - Lista relatórios
- `useReportDetails()` - Detalhes do relatório
- `useApproveReport()` - Aprovar relatório
- `useExpenses()` - Despesas (para filtros)
- `useCostCenters()` - Centros de custo (para filtros)
- `useTeamMembers()` - Membros (para filtros)

---

### 2. Analytics (`/analytics`)

**Endpoint usado**: `/v2/reports`, `/v2/expenses`

**Funcionalidades**:
- Dashboard analítico
- Gráficos de despesas por período
- Análise de aprovações
- Métricas financeiras

---

### 3. Configurações (`/configuracoes`)

**Endpoint usado**: `/v2/team-members`, `/v2/costs-centers`, `/v2/projects`

**Funcionalidades**:
- Gerenciar membros da equipe
- Gerenciar centros de custo
- Gerenciar projetos
- Configurar fluxos de aprovação

---

### 4. Despesas (`/despesas`)

**Endpoint usado**: `/v2/expenses`

**Funcionalidades**:
- Listar despesas
- Filtrar por período, usuário, tipo
- Criar/editar despesas
- Anexar recibos

**Limitação**: Endpoint `/v2/expenses` está bloqueado (erro 422)

---

### 5. Gestão Caixa (`/gestao-caixa`)

**Endpoint usado**: `/v2/reports` (CAIXA)

**Funcionalidades**:
- Gerenciar relatórios de caixa
- Aprovar reembolsos
- Controlar saques

---

### 6. Planilha Quinzenal (`/planilha-quinzenal`)

**Endpoint usado**: `/v2/team-members`, `/v2/reports`

**Funcionalidades**:
- Visualizar dados da quinzena
- Comparar com planilha Excel
- Exportar dados

**Limitação**: Dados financeiros (1QZ, saldo cartão) não disponíveis na API

---

### 7. Quinzena Dinâmica (`/quinzena-dinamica`)

**Endpoint usado**: `/v2/reports`

**Funcionalidades**:
- Visualizar quinzena dinâmica
- Filtrar por período
- Comparar dados

---

### 8. Saldo Automação (`/saldo-automacao`)

**Endpoint usado**: `/v2/reports`

**Funcionalidades**:
- Automação de cálculo de saldos
- Cálculo baseado em padrões matemáticos

**Limitação**: API não fornece saldos exatos, usa padrões aproximados

---

### 9. Status Caixa (`/status-caixa`)

**Endpoint usado**: `/v2/reports`

**Funcionalidades**:
- Status do cartão corporativo
- Controle de ativação/desativação

**Limitação**: Status do cartão físico não disponível na API

---

## 🚨 Limitações Críticas da API

### 1. Endpoint `/v2/expenses` - BLOQUEADO
- **Erro**: 422 "Filter fields are required"
- **Impacto**: CRÍTICO - Não é possível acessar despesas individuais
- **Tentativas**: 34 combinações de filtros testadas
- **Resultado**: Todas retornaram erro 422

### 2. Endpoint `/v2/advances` - MÉTODO NÃO SUPORTADO
- **Erro**: 405 "The GET method is not supported"
- **Impacto**: ALTO - Não é possível listar adiantamentos
- **Solução**: Apenas POST é suportado

### 3. Endpoints de Cartão/Saldo - INEXISTENTES
- **Endpoints testados**: `/cards`, `/balances`, `/team-members/{id}/cards`, `/team-members/{id}/balance`
- **Resultado**: 404 ou 405
- **Impacto**: CRÍTICO - Dados de cartão corporativo não disponíveis

### 4. Arquivos Excel dos Relatórios - CORROMPIDOS
- **Problema**: Arquivos `.xls` baixados via `excel_link` estão corrompidos
- **Impacto**: ALTO - Não é possível extrair dados financeiros dos relatórios
- **Causa**: Magic bytes não correspondem a arquivos Excel válidos

---

## 💡 Solução Atual

### Para Dados Cadastrais
- ✅ Usar API VExpenses diretamente
- ✅ Endpoints funcionam perfeitamente
- ✅ Dados completos e atualizados

### Para Dados Financeiros
- ❌ API VExpenses NÃO fornece dados financeiros
- ✅ Usar arquivo Excel (planilha ou CONTROLE)
- ✅ Script `read_controle_automated.py` para extração
- ✅ Integrar JSON gerado no dashboard

### Estratégia Híbrida
1. **Curto prazo**: Usar arquivo Excel para dados financeiros
2. **Médio prazo**: Investigar endpoint específico da API
3. **Longo prazo**: Integrar com fonte real dos dados (banco/financeiro)

---

## 📋 Resumo Final

| Dado | API VExpenses | Status | Solução |
|------|---------------|--------|---------|
| Nome | ✅ Disponível | Funciona | Usar API |
| CPF | ✅ Disponível | Funciona | Usar API |
| Email | ✅ Disponível | Funciona | Usar API |
| Cargo | ✅ Disponível | Funciona | Usar API |
| Regional | ✅ Disponível | Funciona | Usar API |
| Centro de Custo | ✅ Disponível | Funciona | Usar API |
| 1QZ | ❌ Não disponível | Bloqueado | Usar Excel |
| Saldo Cartão | ❌ Não disponível | Inexistente | Usar Excel |
| Saldo Final | ❌ Não disponível | Inexistente | Usar Excel |
| Saldo Reembolsar | ❌ Não disponível | Inexistente | Usar Excel |
| Adicionais | ❌ Não disponível | Inexistente | Usar Excel |

---

**Conclusão**: API VExpenses é excelente para dados cadastrais, mas NÃO fornece dados financeiros. Solução escalável requer integração com fonte real dos dados financeiros (banco/financeiro) ou uso automatizado de arquivos Excel.
