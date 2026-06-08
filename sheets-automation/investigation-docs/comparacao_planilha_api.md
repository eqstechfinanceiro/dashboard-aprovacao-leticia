# 🔍 RELATÓRIO DE COMPARAÇÃO: PLANILHA VS API

**Data:** 2026-05-21T22:52:39.248095
**Período:** MAIO 2026 (1ª quinzena)

## 📊 RESUMO GERAL
- **Total na planilha:** 340
- **Total mapeados na API:** 340
- **Taxa de mapeamento:** 100.0%
- **Com dados completos da API:** 290
- **Sem dados na API:** 50

## 📋 ANÁLISE POR CAMPO

### COLABORADOR
- **Planilha:** ✅ 340/340
- **API:** ✅ 340/340
- **Status:** ❌ NÃO CALCULÁVEL
- **Método:** N/A

### CPF
- **Planilha:** ✅ 340/340
- **API:** ✅ 340/340
- **Status:** ❌ NÃO CALCULÁVEL
- **Método:** N/A

### SITUAÇÃO
- **Planilha:** ✅ 340/340
- **API:** ✅ 340/340
- **Status:** ❌ NÃO CALCULÁVEL
- **Método:** N/A

### REGIONAL
- **Planilha:** ✅ 340/340
- **API:** ✅ 340/340
- **Status:** ❌ NÃO CALCULÁVEL
- **Método:** N/A

### CENTRO DE CUSTO
- **Planilha:** ✅ 340/340
- **API:** ✅ 340/340
- **Status:** ❌ NÃO CALCULÁVEL
- **Método:** N/A

### GESTOR
- **Planilha:** ✅ 340/340
- **API:** ❌ 0
- **Status:** ❌ NÃO CALCULÁVEL
- **Método:** NÃO DISPONÍVEL - requer investigação de approval flows

### DIRETOR
- **Planilha:** ✅ 340/340
- **API:** ❌ 0
- **Status:** ❌ NÃO CALCULÁVEL
- **Método:** NÃO DISPONÍVEL - requer investigação de approval flows

### SALDO REEMBOLSAR
- **Planilha:** ✅ 340/340
- **API:** ❌ 0
- **Status:** 🧮 CALCULÁVEL
- **Método:** Calculado: valor_base * 0.4636 (padrão matemático)

### SALDO FINAL
- **Planilha:** ✅ 340/340
- **API:** ❌ 0
- **Status:** 🧮 CALCULÁVEL
- **Método:** Calculado: valor_base * 0.8505 (padrão matemático)

### 1ª QZ
- **Planilha:** ✅ 340/340
- **API:** ❌ 0
- **Status:** 🧮 CALCULÁVEL
- **Método:** Valor base extraído de reports (observation/justification)

### SALDO CARTAO
- **Planilha:** ✅ 340/340
- **API:** ❌ 0
- **Status:** 🧮 CALCULÁVEL
- **Método:** Calculado: valor_base * 0.1283 (padrão matemático)

### Adiantamento
- **Planilha:** ✅ 5/340
- **API:** ❌ 0
- **Status:** ❌ NÃO CALCULÁVEL
- **Método:** NÃO DISPONÍVEL - campo manual na planilha

### CARGA PARCIAL
- **Planilha:** ✅ 340/340
- **API:** ❌ 0
- **Status:** 🧮 CALCULÁVEL
- **Método:** Fórmula: 1ª QZ - SALDO FINAL - SALDO CARTAO - ADIANTAMENTO

### REEMBOLSO
- **Planilha:** ✅ 340/340
- **API:** ❌ 0
- **Status:** 🧮 CALCULÁVEL
- **Método:** Fórmula: SALDO REEMBOLSAR * 0.5 (taxa multiplicadora)

### Carga Final
- **Planilha:** ✅ 340/340
- **API:** ❌ 0
- **Status:** 🧮 CALCULÁVEL
- **Método:** Fórmula: IF(CARGA PARCIAL < 0, 0, CARGA PARCIAL) + REEMBOLSO

### STATUS DO CARTÃO
- **Planilha:** ✅ 340/340
- **API:** ❌ 0
- **Status:** ❌ NÃO CALCULÁVEL
- **Método:** NÃO DISPONÍVEL - requer endpoint específico

## 🚨 USUÁRIOS SEM DADOS NA API
Total: 50
- **ADSON SANTOS DA SILVA** (CPF: 83058133553) - Status: SEM_VALORES
- **CLERITON BACILA DOS SANTOS** (CPF: 05456615959) - Status: SEM_VALORES
- **DHIEGO RIBEIRO DINIZ** (CPF: 00049250256) - Status: SEM_RELATORIOS
- **MICHAEL RODRIGUES SANTOS** (CPF: 37425574837) - Status: SEM_RELATORIOS
- **DOUGLAS WESLEN CARDOSO DOS SANTOS** (CPF: 08784554932) - Status: SEM_VALORES
- **RAFAEL ALMEIDA LOPES** (CPF: 46850229800) - Status: SEM_RELATORIOS
- **FLAVIO HENRIQUE ALVES ROMERO** (CPF: 82871396000) - Status: SEM_VALORES
- **LUCAS HENRIQUE ALVES DE OLIVEIRA** (CPF: 10977673618) - Status: SEM_VALORES
- **ALAERTE JACINTO JUNIOR** (CPF: 03071605994) - Status: SEM_VALORES
- **MARCOS VINICIUS DE SOUZA ALVES** (CPF: 11823866603) - Status: SEM_VALORES
... e mais 40 usuários

## ✅ USUÁRIOS COM DADOS COMPLETOS (amostra)
Total: 290

### JONAS CAVALCANTI DE OLIVEIRA
**CPF:** 01696239478
**Planilha - 1ª QZ:** R$ 1750.00
**API - Valor Base:** R$ 2026.00
**Planilha - SALDO FINAL:** R$ 6945.16
**API - SALDO FINAL:** R$ 1723.11
**Diferença:** R$ 5222.05

### RODRIGO CESAR DOS SANTOS
**CPF:** 07024923610
**Planilha - 1ª QZ:** R$ 700.00
**API - Valor Base:** R$ 2026.00
**Planilha - SALDO FINAL:** R$ 6626.04
**API - SALDO FINAL:** R$ 1723.11
**Diferença:** R$ 4902.93

### CAIO FRANCESCONI RIBEIRO
**CPF:** 08924586904
**Planilha - 1ª QZ:** R$ 3900.00
**API - Valor Base:** R$ 2025.00
**Planilha - SALDO FINAL:** R$ 6504.20
**API - SALDO FINAL:** R$ 1722.26
**Diferença:** R$ 4781.94

### MARCO AURELIO DE ANDRADE MORAES
**CPF:** 72756284220
**Planilha - 1ª QZ:** R$ 5000.00
**API - Valor Base:** R$ 2026.00
**Planilha - SALDO FINAL:** R$ 6084.36
**API - SALDO FINAL:** R$ 1723.11
**Diferença:** R$ 4361.25

### ALESSANDRO RODRIGO PASTRELLI
**CPF:** 02474960902
**Planilha - 1ª QZ:** R$ 500.00
**API - Valor Base:** R$ 2026.00
**Planilha - SALDO FINAL:** R$ 5136.45
**API - SALDO FINAL:** R$ 1723.11
**Diferença:** R$ 3413.34

## 🎯 CONCLUSÃO
- **Campos totais:** 16
- **Campos disponíveis/calculáveis via API:** 12
- **Cobertura:** 75.0%

### Campos que requerem entrada manual:
- **GESTOR**: NÃO DISPONÍVEL - requer investigação de approval flows
- **DIRETOR**: NÃO DISPONÍVEL - requer investigação de approval flows
- **Adiantamento**: NÃO DISPONÍVEL - campo manual na planilha
- **STATUS DO CARTÃO**: NÃO DISPONÍVEL - requer endpoint específico