# Gap Analysis: Planilhas vs API VExpenses

## Objetivo

Este documento analisa o gap entre os dados das planilhas e o que está disponível na API VExpenses, identificando:
- Dados que podem ser obtidos diretamente da API
- Dados que precisam ser calculados a partir da API
- Dados que não estão disponíveis na API
- Estratégias para substituir a aba "1 QZ VEXPENSES 04_2026" da planilha 1

---

## Aba Alvo: "1 QZ VEXPENSES 04_2026" (Planilha 1)

### Campo a Campo: Gap Analysis

| Campo Planilha | Disponível na API? | Fonte API | Complexidade | Observações |
|----------------|-------------------|-----------|--------------|-------------|
| PORTADOR | ✅ SIM | TeamMember.name | Baixa | Correspondência direta |
| CPF | ✅ SIM | TeamMember.cpf | Baixa | Correspondência direta |
| STATUS COLAB | ⚠️ PARCIAL | TeamMember.active + TeamMember.confirmed | Média | Fórmula atual usa XLOOKUP em aba externa |
| CENTRO CUSTO | ✅ SIM | CostCenter.name | Baixa | Correspondência direta |
| COD CENTRO CUSTO | ⚠️ PARCIAL | CostCenter.integration_id | Baixa | Se disponível na API |
| GESTOR | ⚠️ PARCIAL | ApprovalFlows.approvers | Média | Precisa mapeamento de IDs para nomes |
| DIREÇÃO | ⚠️ PARCIAL | ApprovalFlows.approvers | Média | Precisa mapeamento de IDs para nomes |
| SALDO REEMBOLSAR | ❌ NÃO | - | Alta | Dado financeiro do cartão corporativo |
| SALDO FINAL | ❌ NÃO | - | Alta | Dado financeiro do cartão corporativo |
| 1QZ DE ABRIL 26 | ⚠️ CÁLCULO | Expenses | Média | Precisa soma de despesas do período |
| SALDO CARTAO | ❌ NÃO | - | Alta | Dado financeiro do cartão corporativo |
| ADIANTAMENTO | ⚠️ PARCIAL | Advances | Média | Se houver adiantamento na API |
| CARGA PARCIAL | ❌ DEPENDE | - | Alta | Fórmula depende de dados não disponíveis |
| REEMBOLSO | ❌ NÃO | - | Alta | Dado financeiro de reembolso |
| CARGA FINAL | ❌ DEPENDE | - | Alta | Fórmula depende de dados não disponíveis |
| STATUS DO CARTAO | ⚠️ PARCIAL | TeamMember.active | Baixa | Status do usuário, não do cartão físico |
| OBS | - | - | - | Campo livre, não tem correspondência |

---

## Cálculos Complexos Necessários

### 1. Cálculo de 1QZ DE ABRIL 26

**Fórmula Planilha:** Valor estático inserido manualmente  
**Necessário via API:** Soma de despesas do período

```python
def calcular_1qz(cpf, mes, ano):
    """
    Calcula o valor total da 1ª quinzena para um colaborador
    
    Args:
        cpf: CPF do colaborador
        mes: Mês (ex: 4 para abril)
        ano: Ano (ex: 2026)
    
    Returns:
        float: Valor total da 1ª quinzena
    """
    # Obter user_id a partir do CPF
    user = api.get_team_member(cpf=cpf)
    user_id = user.id
    
    # Obter despesas do período (1ª quinzena)
    despesas = api.get_expenses(
        user_id=user_id,
        date_from=f"{ano}-{mes:02d}-01",
        date_to=f"{ano}-{mes:02d}-15",
        on=True  # Apenas despesas ativas
    )
    
    # Somar valores
    total = sum(despesa.value for despesa in despesas)
    
    return total
```

**Endpoint API:** `/v2/expenses`  
**Filtros necessários:**
- `user_id` (obtido via `/v2/team-members?cpf={cpf}`)
- `date` (range: 01/04/2026 a 15/04/2026)
- `on=true` (apenas despesas ativas)

**Complexidade:** Média  
**Observações:** 
- Precisa obter user_id primeiro via CPF
- Precisa filtrar por data
- Precisa somar valores

---

### 2. Cálculo de STATUS COLAB

**Fórmula Planilha:** `=_xlfn.XLOOKUP(Tabela1[[#This Row],[CPF]],[1]Funcionário!$B:$B,[1]Funcionário!$H:$H)`  
**Necessário via API:** Combinação de campos do TeamMember

```python
def calcular_status_colab(cpf):
    """
    Calcula o status do colaborador baseado em campos da API
    
    Args:
        cpf: CPF do colaborador
    
    Returns:
        str: "ATIVO" ou "INATIVO"
    """
    user = api.get_team_member(cpf=cpf)
    
    # Lógica baseada em campos disponíveis
    if user.active and user.confirmed:
        return "ATIVO"
    else:
        return "INATIVO"
```

**Endpoint API:** `/v2/team-members`  
**Filtros necessários:**
- `cpf={cpf}`

**Complexidade:** Baixa  
**Observações:**
- A fórmula atual depende de uma aba externa `[1]Funcionário`
- Precisa investigar qual lógica exata está na aba externa
- Pode precisar de ajuste dependendo da regra de negócio

---

### 3. Cálculo de GESTOR e DIREÇÃO

**Fórmula Planilha:** Valores estáticos inseridos manualmente  
**Necessário via API:** Mapeamento via Approval Flows

```python
def obter_gestor_direcao(cpf, centro_custo):
    """
    Obtém gestor e direção via Approval Flows
    
    Args:
        cpf: CPF do colaborador
        centro_custo: Nome do centro de custo
    
    Returns:
        tuple: (gestor, direcao)
    """
    # Obter approval flows configurados
    flows = api.get_approval_flows()
    
    # Encontrar flow correspondente ao centro de custo
    flow = encontrar_flow_por_centro_custo(flows, centro_custo)
    
    if not flow:
        return (None, None)
    
    # Obter approvers do flow
    approvers = flow.steps[-1].groups[0].approvers
    
    # Mapear IDs para nomes
    gestor = api.get_team_member(approvers[0]).name
    direcao = api.get_team_member(approvers[1]).name if len(approvers) > 1 else None
    
    return (gestor, direcao)
```

**Endpoint API:** `/v2/approval-flows`  
**Complexidade:** Alta  
**Observações:**
- Precisa entender a estrutura dos approval flows
- Precisa mapear centro de custo para flow correto
- Precisa converter IDs de approvers para nomes
- A lógica exata precisa ser investigada

---

## Campos Críticos NÃO Disponíveis na API

### 1. SALDO FINAL

**Motivo:** Dado financeiro do cartão corporativo  
**Impacto:** CRÍTICO - Usado no cálculo de CARGA PARCIAL  
**Alternativas:**
- Manter na planilha (recomendado)
- Buscar em sistema financeiro externo
- Calcular via transações (se disponível)

### 2. SALDO CARTAO

**Motivo:** Dado financeiro do cartão corporativo  
**Impacto:** CRÍTICO - Usado no cálculo de CARGA PARCIAL  
**Alternativas:**
- Manter na planilha (recomendado)
- Buscar em sistema financeiro externo

### 3. REEMBOLSO

**Motivo:** Dado financeiro de reembolso  
**Impacto:** ALTO - Usado no cálculo de CARGA FINAL  
**Alternativas:**
- Manter na planilha (recomendado)
- Buscar em sistema financeiro externo

### 4. CARGA PARCIAL

**Motivo:** Fórmula depende de SALDO FINAL, SALDO CARTAO e ADIANTAMENTO  
**Fórmula:** `1QZ - SALDO FINAL - SALDO CARTAO - ADIANTAMENTO`  
**Impacto:** CRÍTICO - Campo principal da aba  
**Alternativas:**
- Calcular parcialmente (usando API para 1QZ e ADIANTAMENTO)
- Manter SALDO FINAL e SALDO CARTAO na planilha
- Usar fórmula híbrida: parte da API + parte da planilha

### 5. CARGA FINAL

**Motivo:** Fórmula depende de CARGA PARCIAL e REEMBOLSO  
**Fórmula:** `IF(CARGA PARCIAL < 0, 0, CARGA PARCIAL) + REEMBOLSO`  
**Impacto:** CRÍTICO - Campo principal da aba  
**Alternativas:**
- Calcular parcialmente (usando API para parte da fórmula)
- Manter REEMBOLSO na planilha
- Usar fórmula híbrida

---

## Estratégias de Substituição

### Estratégia 1: Substituição Parcial (Recomendada)

**O que vem da API:**
- PORTADOR (TeamMember.name)
- CPF (TeamMember.cpf)
- CENTRO CUSTO (CostCenter.name)
- COD CENTRO CUSTO (CostCenter.integration_id, se disponível)
- 1QZ DE ABRIL 26 (Calculado via Expenses)
- ADIANTAMENTO (Advances, se disponível)
- STATUS DO CARTAO (TeamMember.active - adaptado)

**O que fica na planilha:**
- SALDO REEMBOLSAR
- SALDO FINAL
- SALDO CARTAO
- REEMBOLSO
- CARGA PARCIAL (fórmula híbrida)
- CARGA FINAL (fórmula híbrida)
- GESTOR/DIREÇÃO (até investigar approval flows)
- STATUS COLAB (até investigar aba externa)

**Vantagens:**
- Reduz trabalho manual de inserção de dados
- Mantém dados financeiros críticos na planilha
- Permite transição gradual

**Desvantagens:**
- Ainda depende da planilha para campos importantes
- Fórmulas híbridas podem ser complexas

---

### Estratégia 2: Substituição Total (Ideal, mas difícil)

**Pré-requisitos:**
- Ter acesso a sistema financeiro externo para saldos
- Ter acesso a sistema de aprovações para gestor/direção
- Investigar completamente a aba `[1]Funcionário`

**O que viria da API:**
- Todos os campos operacionais
- 1QZ calculado via Expenses
- Saldos via sistema financeiro externo
- Gestor/Direção via Approval Flows

**Vantagens:**
- Elimina dependência da planilha
- Automação completa

**Desvantagens:**
- Complexidade muito alta
- Requer integrações adicionais
- Risco de perda de dados

---

### Estratégia 3: Enriquecimento (Adicionar dados da API)

**Manter a planilha como está, mas adicionar:**
- Dados adicionais da API que não existem na planilha
- Métricas calculadas via API
- Histórico de despesas detalhado

**Vantagens:**
- Baixo risco
- Enriquece a planilha sem quebrar nada

**Desvantagens:**
- Não resolve o problema original
- Aumenta complexidade

---

## Próximos Passos Recomendados

### Fase 1: Investigação Adicional

1. **Investigar aba `[1]Funcionário`**
   - Entender a lógica de STATUS COLAB
   - Verificar se esses dados podem vir da API
   - Documentar a estrutura completa

2. **Investigar Approval Flows**
   - Entender como mapear centro de custo para flow
   - Entender como obter gestor/direção
   - Testar o mapeamento completo

3. **Investigar Advances**
   - Verificar se há adiantamentos na API
   - Entender a estrutura de dados
   - Verificar correspondência com ADIANTAMENTO da planilha

### Fase 2: Protótipo de Substituição Parcial

1. **Implementar cálculo de 1QZ via API**
   - Criar script para calcular 1QZ para todos os colaboradores
   - Testar com alguns CPFs
   - Comparar com valores da planilha

2. **Implementar STATUS COLAB via API**
   - Criar lógica baseada em TeamMember
   - Testar com alguns CPFs
   - Comparar com valores da planilha

3. **Implementar fórmulas híbridas**
   - CARGA PARCIAL: API (1QZ, ADIANTAMENTO) + Planilha (SALDO FINAL, SALDO CARTAO)
   - CARGA FINAL: API (CARGA PARCIAL calculado) + Planilha (REEMBOLSO)

### Fase 3: Validação

1. **Comparar resultados**
   - Gerar versão da aba via API
   - Comparar com versão atual da planilha
   - Identificar discrepâncias

2. **Ajustar lógicas**
   - Corrigir erros de cálculo
   - Ajustar regras de negócio
   - Validar com usuários

### Fase 4: Implementação

1. **Criar endpoint para gerar aba**
   - API que retorna dados no formato da planilha
   - Integração com sistema existente
   - Documentação completa

2. **Automatizar atualização**
   - Job periódico para atualizar dados
   - Notificação de mudanças
   - Backup de versões anteriores

---

## Conclusão

### Viabilidade de Substituição

| Campo | Viabilidade | Complexidade | Prioridade |
|-------|-------------|--------------|------------|
| PORTADOR | ✅ Alta | Baixa | Alta |
| CPF | ✅ Alta | Baixa | Alta |
| CENTRO CUSTO | ✅ Alta | Baixa | Alta |
| 1QZ DE ABRIL 26 | ✅ Alta | Média | Alta |
| STATUS COLAB | ⚠️ Média | Média | Média |
| ADIANTAMENTO | ⚠️ Média | Média | Média |
| GESTOR/DIREÇÃO | ⚠️ Média | Alta | Média |
| SALDO FINAL | ❌ Baixa | Alta | Baixa |
| SALDO CARTAO | ❌ Baixa | Alta | Baixa |
| CARGA PARCIAL | ❌ Baixa | Alta | Baixa |
| REEMBOLSO | ❌ Baixa | Alta | Baixa |
| CARGA FINAL | ❌ Baixa | Alta | Baixa |

### Recomendação Final

**Adotar Estratégia 1 (Substituição Parcial)** como ponto de partida:

1. Substituir campos operacionais via API (PORTADOR, CPF, CENTRO CUSTO)
2. Calcular 1QZ via API
3. Manter campos financeiros na planilha (SALDO FINAL, SALDO CARTAO, REEMBOLSO)
4. Implementar fórmulas híbridas para CARGA PARCIAL e CARGA FINAL
5. Investigar adicionalmente STATUS COLAB, GESTOR/DIREÇÃO
6. Evoluir gradualmente para substituição total se viável

### Riscos

- **Risco Alto:** Perda de dados financeiros críticos
- **Risco Médio:** Erros em cálculos complexos
- **Risco Baixo:** Discrepâncias em dados operacionais

### Mitigação

- Backup completo antes de qualquer mudança
- Validação extensiva em ambiente de teste
- Rollback planificado
- Documentação completa de todas as mudanças

---

**Data da análise:** 2026-05-21  
**Status:** Aguardando investigação adicional da aba `[1]Funcionário` e Approval Flows
