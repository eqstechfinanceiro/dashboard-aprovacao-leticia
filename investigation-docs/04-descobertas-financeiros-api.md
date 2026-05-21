# Descobertas sobre Dados Financeiros na API VExpenses

## Resumo da Investigação

Após análise extensiva da API VExpenses, descobrimos informações cruciais sobre a disponibilidade dos dados financeiros necessários para a planilha "1 QZ VEXPENSES 04_2026".

---

## 🚫 Descobertas Principais: Limitações da API

### 1. Endpoint `/expenses` - BLOQUEADO

**Status:** Erro 422 - "Filter fields are required"  
**Problema:** A API exige campos de filtro específicos, mas não documentados  
**Impacto:** **CRÍTICO** - Não conseguimos acessar despesas individuais

**Tentativas realizadas (34 combinações):**
- `user_id`, `report_id`, `date_from`, `date_to`, `status`, `on`, `reimbursable`
- Combinações múltiplas: `user_id + date_from`, `report_id + limit`, etc.
- Variações de nomes: `userId`, `reportId`, `startDate`, `endDate`
- Paginação: `page`, `limit`, `per_page`, `offset`

**Resultado:** **TODAS retornaram erro 422**

---

### 2. Endpoint `/advances` - MÉTODO NÃO SUPORTADO

**Status:** Erro 405 - "The GET method is not supported"  
**Problema:** Endpoint só aceita POST, não GET  
**Impacto:** **ALTO** - Não conseguimos acessar adiantamentos

---

### 3. Endpoints de Cartão/Saldo - INEXISTENTES

**Endpoints testados (todos retornaram 404 ou 405):**
- `/cards` - 405 (Método não suportado)
- `/balances` - 405 (Método não suportado)
- `/team-members/{id}/cards` - 404 (Não encontrado)
- `/team-members/{id}/balance` - 404 (Não encontrado)
- `/team-members/{id}/limits` - 404 (Não encontrado)

**Impacto:** **CRÍTICO** - Dados de cartão corporativo não disponíveis

---

### 4. Arquivos Excel dos Relatórios - CORROMPIDOS

**Status:** Erro de corrupção ao tentar ler  
**Problema:** Arquivos `.xls` baixados estão corrompidos  
**Impacto:** **ALTO** - Não conseguimos extrair dados financeiros dos relatórios

---

## ✅ Dados que CONSEGUIMOS Obter

### 1. Reports (`/reports`)

**Disponibilidade:** ✅ TOTAL  
**Campos disponíveis:**
```json
{
  "id": 7603397,
  "user_id": 895944,
  "description": "CAIXA 06/2025",
  "status": "APROVADO",
  "approval_stage_id": 15492965,
  "payment_date": null,
  "payment_method_id": 627721,
  "paying_company_id": 1861279,
  "on": true,
  "created_at": "2025-06-06 17:26:33"
}
```

**Limitação:** **NÃO CONTÉM DADOS FINANCEIROS DIRETOS**

---

### 2. Team Members (`/team-members`)

**Disponibilidade:** ✅ TOTAL  
**Campos disponíveis:**
```json
{
  "id": 890792,
  "name": "conf",
  "cpf": "01677920599",
  "email": "conf@example.com",
  "active": true,
  "confirmed": true,
  "bank": "BANCO DO BRASIL",
  "agency": "1234",
  "account": "567890",
  "expense_limit_policy_id": null
}
```

**Limitação:** **NÃO CONTÉM DADOS DE CARTÃO OU SALDO**

---

### 3. Approval Flows (`/approval-flows`)

**Disponibilidade:** ✅ TOTAL  
**Estrutura:**
```json
{
  "id": 172530,
  "description": "REGIONAL CO",
  "steps": [
    {
      "groups": [
        {
          "approvers": [891980, 891977, 946419, 891979, 891904, 896335]
        }
      ]
    }
  ]
}
```

**Utilidade:** Mapeamento de GESTOR/DIREÇÃO (via IDs de approvers)

---

## 🎯 Análise dos Campos Financeiros da Planilha

| Campo Planilha | Disponível API? | Como Obter | Complexidade |
|----------------|-----------------|------------|-------------|
| **PORTADOR** | ✅ SIM | `team-members.name` | Baixa |
| **CPF** | ✅ SIM | `team-members.cpf` | Baixa |
| **STATUS COLAB** | ⚠️ PARCIAL | `team-members.active + confirmed` | Média |
| **CENTRO CUSTO** | ⚠️ PARCIAL | Via `approval-flows` (mapeamento) | Média |
| **GESTOR** | ⚠️ PARCIAL | `approval-flows.approvers` → `team-members.name` | Alta |
| **DIREÇÃO** | ⚠️ PARCIAL | `approval-flows.approvers` → `team-members.name` | Alta |
| **1QZ DE ABRIL 26** | ❌ NÃO | Precisa expenses individuais | **IMPOSSÍVEL** |
| **ADIANTAMENTO** | ❌ NÃO | Endpoint `/advances` bloqueado | **IMPOSSÍVEL** |
| **SALDO REEMBOLSAR** | ❌ NÃO | Dado financeiro do cartão | **IMPOSSÍVEL** |
| **SALDO FINAL** | ❌ NÃO | Dado financeiro do cartão | **IMPOSSÍVEL** |
| **SALDO CARTAO** | ❌ NÃO | Dado financeiro do cartão | **IMPOSSÍVEL** |
| **REEMBOLSO** | ❌ NÃO | Dado financeiro do cartão | **IMPOSSÍVEL** |
| **CARGA PARCIAL** | ❌ NÃO | Depende dos campos acima | **IMPOSSÍVEL** |
| **CARGA FINAL** | ❌ NÃO | Depende dos campos acima | **IMPOSSÍVEL** |

---

## 🔍 Investigação do Endpoint `/expenses`

### Possíveis Causas do Erro 422

1. **Campos obrigatórios não documentados**
   - A API pode exigir campos específicos não óbvios
   - Possíveis campos: `company_id`, `team_id`, `filter_type`

2. **Permissões insuficientes**
   - API key pode não ter permissão para acessar expenses
   - Pode requerer nível de acesso diferente

3. **Versão da API**
   - Endpoint pode ter mudado na versão atual
   - Pode existir endpoint alternativo

4. **Headers adicionais**
   - Pode requerer headers específicos além de Authorization

### Estratégias para Desbloquear `/expenses`

#### 1. Investigar Headers Adicionais
```python
headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-API-Version": "v2",
    "X-Company-ID": "1861279"  # ID da empresa
}
```

#### 2. Tentar Campos de Filtro Específicos
```python
# Possíveis campos obrigatórios
filters = {
    "company_id": 1861279,
    "team_id": 890792,
    "filter_type": "expenses",
    "user_id": 890792
}
```

#### 3. Verificar Permissões da API Key
- Testar endpoints administrativos
- Verificar se API key tem escopo completo
- Solicitar nova API key com permissões expandidas

---

## 💡 Possíveis Soluções Alternativas

### 1. **Via Frontend da Aplicação**

Se a aplicação web consegue acessar esses dados, podemos:
- Analisar as requisições do frontend
- Replicar os headers e parâmetros usados
- Usar os mesmos endpoints que o frontend usa

### 2. **Via Web Scraping**

Se os dados estão disponíveis na interface web:
- Automatizar login e navegação
- Extrair dados das páginas
- Processar os dados extraídos

### 3. **Via Exportação em Lote**

Se a aplicação permite exportação:
- Automatizar download de arquivos
- Processar múltiplos arquivos
- Extrair dados dos arquivos baixados

### 4. **Via Integração Direta**

Se houver integração disponível:
- Configurar webhook
- Usar sistema de mensageria
- Implementar sincronização

---

## 📊 Análise de Viabilidade

### Substituição Total da Aba

**Viabilidade:** ❌ **IMPOSSÍVEL** no momento atual  
**Motivos:**
- Endpoint `/expenses` bloqueado
- Dados financeiros do cartão indisponíveis
- Sem acesso a adiantamentos

### Substituição Parcial

**Viabilidade:** ⚠️ **PARCIAL**  
**Campos possíveis:**
- PORTADOR, CPF, STATUS COLAB (via team-members)
- GESTOR, DIREÇÃO (via approval-flows + team-members)
- CENTRO CUSTO (requer mapeamento adicional)

**Campos impossíveis:**
- Todos os campos financeiros críticos
- 1QZ DE ABRIL 26 (depende de expenses)
- CÁLCULOS (CARGA PARCIAL, CARGA FINAL)

---

## 🎯 Recomendações Imediatas

### 1. **Resolver Acesso ao Endpoint `/expenses`**

**Ações:**
- Contatar suporte VExpenses sobre erro 422
- Solicitar documentação completa dos filtros obrigatórios
- Verificar permissões da API key atual
- Testar com diferentes headers

**Prioridade:** **MÁXIMA**

### 2. **Investigar Frontend da Aplicação**

**Ações:**
- Analisar requisições network no navegador
- Identificar endpoints reais usados
- Replicar requisições com headers corretos
- Testar parâmetros descobertos

**Prioridade:** **ALTA**

### 3. **Implementar Solução Híbrida Temporária**

**Ações:**
- Manter dados financeiros na planilha
- Automatizar dados operacionais via API
- Criar fórmulas híbridas
- Documentar limitações

**Prioridade:** **MÉDIA**

---

## 📋 Próximos Passos Concretos

### Fase 1: Desbloquear API (1-2 semanas)
1. [ ] Contatar suporte VExpenses sobre endpoint `/expenses`
2. [ ] Analisar requisições do frontend
3. [ ] Testar com headers/parâmetros descobertos
4. [ ] Documentar filtros corretos

### Fase 2: Protótipo (2-3 semanas)
1. [ ] Implementar acesso a expenses
2. [ ] Criar cálculos de 1QZ via API
3. [ ] Mapear GESTOR/DIREÇÃO via approval-flows
4. [ ] Testar com dados reais

### Fase 3: Validação (1 semana)
1. [ ] Comparar com planilha atual
2. [ ] Identificar discrepâncias
3. [ ] Ajustar cálculos
4. [ ] Validar com usuários

---

## 🚨 Conclusão

**Situação Atual:** A API VExpenses **NÃO** fornece acesso direto aos dados financeiros necessários para substituir completamente a aba "1 QZ VEXPENSES 04_2026".

**Bloqueios Críticos:**
1. Endpoint `/expenses` retorna erro 422
2. Dados de cartão/saldo indisponíveis
3. Endpoint `/advances` bloqueado

**Solução Necessária:** Resolver acesso ao endpoint `/expenses` é **obrigatório** para qualquer progresso significativo.

**Alternativa:** Implementar solução híbrida mantendo dados financeiros na planilha enquanto automatiza dados operacionais via API.

---

**Data da investigação:** 2026-05-21  
**Status:** **BLOQUEADO** - Aguardando resolução do acesso à API  
**Próxima ação:** Contatar suporte VExpenses ou analisar frontend da aplicação
