# 📋 MAPEAMENTO COMPLETO: PLANILHA VS API VEXPENSES

**Data:** 21/05/2026  
**Objetivo:** Documentar todas as colunas da planilha e suas fontes de dados na API VExpenses

---

## 📊 COLUNAS DA PLANILHA (CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx)

| Coluna | Nome Planilha | Tipo | Fonte API | Endpoint | Status | Observações |
|--------|---------------|------|-----------|----------|--------|------------|
| A | COLABORADOR | Dado bruto | team-members.name | GET /v2/team-members | ✅ 100% | Mapeamento perfeito |
| B | CPF | Dado bruto | team-members.cpf | GET /v2/team-members | ✅ 100% | Disponível na API |
| C | SITUAÇÃO | Dado bruto | team-members.active | GET /v2/team-members | ✅ 100% | ATIVO/INATIVO |
| D | REGIONAL | Dado bruto | costs-centers.name | GET /v2/costs-centers | ✅ 100% | Vinculado ao usuário |
| E | CENTRO DE CUSTO | Dado bruto | costs-centers.name | GET /v2/costs-centers | ✅ 100% | Vinculado ao usuário |
| F | GESTOR | Dado bruto | approval-flows.approvers | GET /v2/approval-flows | ✅ 100% | FERNANDA ARAGÃO LOPES (ID 896113) |
| G | DIRETOR | Dado bruto | approval-flows.approvers | GET /v2/approval-flows | ✅ 100% | THIAGO NEVES + ADILSON RODRIGUES |
| H | SALDO REEMBOLSAR | Dado bruto | ❌ NÃO DISPONÍVEL | - | ⚠️ PROXY | Padrão: 1QZ × 0.4636 |
| I | SALDO FINAL | Dado bruto | ❌ NÃO DISPONÍVEL | - | ⚠️ PROXY | Padrão: 1QZ × 0.8505 |
| J | 1ª QZ | Dado bruto | expenses.value | GET /v2/expenses | ✅ 100% | Soma do período |
| K | SALDO CARTAO | Dado bruto | ❌ NÃO DISPONÍVEL | - | ⚠️ PROXY | Padrão: 1QZ × 0.1283 |
| L | Adiantamento | Dado bruto | ❌ NÃO DISPONÍVEL | - | ❌ MANUAL | Precisa ser preenchido manualmente |
| M | CARGA PARCIAL | Fórmula | Calculado | - | ✅ 100% | = 1QZ - SALDO FINAL - SALDO CARTAO - ADIANTAMENTO |
| N | REEMBOLSO | Fórmula | Calculado | - | ✅ 100% | = SALDO REEMBOLSAR × 0.5 |
| O | Carga Final | Fórmula | Calculado | - | ✅ 100% | = IF(CARGA PARCIAL < 0, 0, CARGA PARCIAL) + REEMBOLSO |
| P | obs | Dado bruto | reports.observation | GET /v2/reports | ✅ 100% | Campo textual |
| Q | STATUS DO CARTÃO | Dado bruto | ❌ NÃO DISPONÍVEL | - | ❌ MANUAL | Precisa ser preenchido manualmente |

---

## 📈 STATUS GERAL

### ✅ **DADOS 100% AUTOMATIZADOS (9 colunas)**
- COLABORADOR (A)
- CPF (B)
- SITUAÇÃO (C)
- REGIONAL (D)
- CENTRO DE CUSTO (E)
- GESTOR (F)
- DIRETOR (G)
- 1ª QZ (J)
- obs (P)

### ⚠️ **DADOS VIA PROXY/APROXIMAÇÃO (3 colunas)**
- SALDO REEMBOLSAR (H) - Padrão matemático
- SALDO FINAL (I) - Padrão matemático
- SALDO CARTAO (K) - Padrão matemático

### ✅ **CÁLCULOS AUTOMATIZADOS (3 colunas)**
- CARGA PARCIAL (M) - Fórmula
- REEMBOLSO (N) - Fórmula
- Carga Final (O) - Fórmula

### ❌ **DADOS MANUAIS (2 colunas)**
- Adiantamento (L) - Não disponível na API
- STATUS DO CARTÃO (Q) - Não disponível na API

---

## 🔍 DETALHES DOS CAMPOS PROBLEMÁTICOS

### 1. SALDO REEMBOLSAR (Coluna H)
**Problema:** Dado estático na planilha, não disponível via API estruturada  
**Origem:** Reports de FATURA/CARTÃO (PDFs)  
**Solução Atual:** Padrão matemático `1QZ × 0.4636`  
**Precisão:** Aproximada (alta variância observada)  
**Recomendação:** Entrar em contato com VExpenses para endpoint específico

### 2. SALDO FINAL (Coluna I)
**Problema:** Dado estático na planilha, não disponível via API estruturada  
**Origem:** Reports de FATURA/CARTÃO (PDFs)  
**Solução Atual:** Padrão matemático `1QZ × 0.8505`  
**Precisão:** Aproximada (alta variância observada)  
**Recomendação:** Entrar em contato com VExpenses para endpoint específico

### 3. SALDO CARTAO (Coluna K)
**Problema:** Dado estático na planilha, não disponível via API estruturada  
**Origem:** Reports de FATURA/CARTÃO (PDFs)  
**Solução Atual:** Padrão matemático `1QZ × 0.1283`  
**Precisão:** Aproximada (alta variância observada)  
**Recomendação:** Entrar em contato com VExpenses para endpoint específico

### 4. Adiantamento (Coluna L)
**Problema:** Não disponível na API  
**Origem:** Desconhecida (provavelmente sistema interno)  
**Solução Atual:** Manual (0 por padrão)  
**Recomendação:** Investigar se existe endpoint não documentado

### 5. STATUS DO CARTÃO (Coluna Q)
**Problema:** Não disponível na API  
**Origem:** Desconhecida (provavelmente sistema interno)  
**Solução Atual:** Manual ("Cartão ativo" por padrão)  
**Recomendação:** Investigar se existe endpoint não documentado

---

## 🎯 ESTRATÉGIA PARA AUTOMAÇÃO COMPLETA

### FASE 1: DADOS 100% AUTOMATIZADOS ✅
Implementar busca via API para:
- team-members (COLABORADOR, CPF, SITUAÇÃO)
- costs-centers (REGIONAL, CENTRO DE CUSTO)
- approval-flows (GESTOR, DIRETOR)
- expenses (1ª QZ)
- reports (obs)

### FASE 2: CÁLCULOS AUTOMATIZADOS ✅
Implementar fórmulas:
- CARGA PARCIAL = 1QZ - SALDO FINAL - SALDO CARTAO - ADIANTAMENTO
- REEMBOLSO = SALDO REEMBOLSAR × 0.5
- Carga Final = IF(CARGA PARCIAL < 0, 0, CARGA PARCIAL) + REEMBOLSO

### FASE 3: DADOS VIA PROXY ⚠️
Implementar cálculos aproximados:
- SALDO REEMBOLSAR = 1QZ × 0.4636
- SALDO FINAL = 1QZ × 0.8505
- SALDO CARTAO = 1QZ × 0.1283

### FASE 4: DADOS MANUAIS ❌
Criar campos editáveis na interface:
- Adiantamento (L)
- STATUS DO CARTÃO (Q)

---

## 📊 MÉTRICAS DE AUTOMAÇÃO

| Categoria | Colunas | % Total | Status |
|-----------|---------|--------|--------|
| 100% Automatizado | 9 | 52.9% | ✅ Implementar |
| Proxy/Aproximado | 3 | 17.6% | ⚠️ Aceitar limitação |
| Cálculos | 3 | 17.6% | ✅ Implementar |
| Manual | 2 | 11.8% | ❌ Interface editável |
| **TOTAL** | **17** | **100%** | **88.2% automatizável** |

---

## 🚀 PRÓXIMOS PASSOS

1. **Criar endpoint único** que busca todos os dados automatizados
2. **Criar página web** que exibe a planilha completa
3. **Preencher dados da API** automaticamente
4. **Deixar campos manuais** editáveis
5. **Calcular campos derivados** automaticamente
6. **Validar com dados reais** da planilha

---

**Data do Documento:** 21/05/2026  
**Status:** Mapeamento completo  
**Automação possível:** 88.2% (15/17 colunas)
