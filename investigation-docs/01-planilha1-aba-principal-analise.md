# Análise Detalhada: Planilha 1 - Aba Principal "1 QZ VEXPENSES 04_2026"

## Visão Geral

**Arquivo:** `1QZ ABRIL 2026 - VEXPENSES (1).xlsx`  
**Aba:** `1 QZ VEXPENSES 04_2026`  
**Objetivo:** Controle de 1ª Quinzena (1QZ) de cartões corporativos VExpenses para Abril 2026  
**Total de linhas:** 337  
**Total de colunas:** 50  
**Linha de cabeçalho:** 5  
**Linha de início dos dados:** 6

---

## Estrutura da Aba

### Colunas Principais (B-R)

| Coluna | Campo | Tipo | Descrição | Fórmula |
|--------|-------|------|-----------|---------|
| B | PORTADOR | Texto | Nome do colaborador | Não |
| C | CPF | Texto | CPF do colaborador | Não |
| D | STATUS COLAB | Texto | Status do colaborador (ATIVO) | **SIM** - XLOOKUP |
| E | CENTRO CUSTO | Texto | Nome do centro de custo | Não |
| F | COD CENTRO CUSTO | Texto | Código do centro de custo | Não |
| G | GESTOR | Texto | Nome do gestor | Não |
| H | DIREÇÃO | Texto | Nome do diretor | Não |
| I | SALDO REEMBOLSAR | Numérico | Saldo a reembolsar | Não |
| J | SALDO FINAL | Numérico | Saldo final do cartão | Não |
| K | 1QZ DE ABRIL 26 | Numérico | Valor da 1ª quinzena de Abril 2026 | Não |
| L | SALDO CARTAO | Numérico | Saldo atual do cartão | Não |
| M | ADIANTAMENTO | Numérico | Valor de adiantamento | Não |
| N | CARGA PARCIAL | Numérico | Carga parcial realizada | **SIM** - Cálculo |
| O | REEMBOLSO | Numérico | Valor reembolsado | Não |
| P | CARGA FINAL | Numérico | Carga final | **SIM** - Cálculo |
| Q | STATUS DO CARTAO | Texto | Status do cartão (Cartão ativo) | Não |
| R | OBS | Texto | Observações | Não |

### Colunas Vazias (S-AX)

As colunas S até AX estão vazias (sem dados).

---

## Fórmulas Detalhadas

### 1. STATUS COLAB (Coluna D)

**Fórmula:** `=_xlfn.XLOOKUP(Tabela1[[#This Row],[CPF]],[1]Funcionário!$B:$B,[1]Funcionário!$H:$H)`

**Lógica:**
- Busca o CPF na coluna B da aba `[1]Funcionário`
- Retorna o valor da coluna H (STATUS) correspondente
- Usa XLOOKUP (função moderna do Excel)

**Dependência:** Aba `[1]Funcionário` (não analisada ainda)

**Dados necessários da API:**
- TeamMember.active (booleano)
- TeamMember.confirmed (booleano)
- TeamMember.user_type (string)

---

### 2. CARGA PARCIAL (Coluna N)

**Fórmula:** `=Tabela1[[#This Row],[1QZ DE ABRIL 26]]-Tabela1[[#This Row],[SALDO FINAL]]-Tabela1[[#This Row],[SALDO CARTAO]]-Tabela1[[#This Row],[ADIANTAMENTO]]`

**Lógica:**
```
CARGA PARCIAL = 1QZ DE ABRIL 26 - SALDO FINAL - SALDO CARTAO - ADIANTAMENTO
```

**Exemplo numérico:**
- 1QZ DE ABRIL 26: 16000
- SALDO FINAL: 291.66
- SALDO CARTAO: 20
- ADIANTAMENTO: 0
- CARGA PARCIAL = 16000 - 291.66 - 20 - 0 = 15688.34

**Dados necessários da API:**
- **1QZ DE ABRIL 26:** Precisa ser calculado a partir de despesas da API
- **SALDO FINAL:** Dado financeiro do cartão (NÃO DISPONÍVEL na API)
- **SALDO CARTAO:** Dado financeiro do cartão (NÃO DISPONÍVEL na API)
- **ADIANTAMENTO:** Pode vir de `Advance` na API (se houver)

**Problema crítico:** SALDO FINAL e SALDO CARTAO são dados financeiros do cartão corporativo que NÃO estão disponíveis na API VExpenses.

---

### 3. CARGA FINAL (Coluna P)

**Fórmula:** `=IF(Tabela1[[#This Row],[CARGA PARCIAL]]<0,0,Tabela1[[#This Row],[CARGA PARCIAL]])+Tabela1[[#This Row],[REEMBOLSO]]`

**Lógica:**
```
CARGA FINAL = IF(CARGA PARCIAL < 0, 0, CARGA PARCIAL) + REEMBOLSO
```

**Explicação:**
- Se CARGA PARCIAL for negativo, usa 0
- Se CARGA PARCIAL for positivo, usa o valor
- Soma com REEMBOLSO

**Dados necessários da API:**
- **CARGA PARCIAL:** Calculado acima (depende de dados não disponíveis)
- **REEMBOLSO:** Dado financeiro (NÃO DISPONÍVEL na API)

**Problema crítico:** REEMBOLSO é dado financeiro que NÃO está disponível na API VExpenses.

---

### 4. SUBTOTALS (Colunas I-P)

**Fórmulas nos cabeçalhos:**
- I6: `=SUBTOTAL(9,I7:I1048576)` - SALDO REEMBOLSAR
- J6: `=SUBTOTAL(9,J7:J1048576)` - SALDO FINAL
- K6: `=SUBTOTAL(9,K7:K1048576)` - 1QZ DE ABRIL 26
- L6: `=SUBTOTAL(9,L7:L1048576)` - SALDO CARTAO
- M6: `=SUBTOTAL(9,M7:M1048576)` - ADIANTAMENTO
- N6: `=SUBTOTAL(9,N332:N1048576)` - CARGA PARCIAL
- O6: `=SUBTOTAL(9,O7:O1048576)` - REEMBOLSO
- P6: `=SUBTOTAL(9,P7:P1048576)` - CARGA FINAL

**Função SUBTOTAL(9,...):**
- 9 = SUM (soma)
- Ignora linhas ocultas
- Usado para totais dinâmicos

**Nota:** A coluna N começa em N332 (diferente das outras que começam na linha 7)

---

## Amostra de Dados

### Linha 7 (Primeiro colaborador)

| Campo | Valor |
|-------|-------|
| PORTADOR | RAFAEL AMORIM VELLO |
| CPF | 01677920599 |
| STATUS COLAB | (fórmula XLOOKUP) |
| CENTRO CUSTO | CEF NORTE OESTE BA |
| GESTOR | GERSON OLIVEIRA |
| DIREÇÃO | ROGERIO SCATAMBULO |
| SALDO REEMBOLSAR | - |
| SALDO FINAL | 291.66 |
| 1QZ DE ABRIL 26 | 16000 |
| SALDO CARTAO | 20 |
| ADIANTAMENTO | - |
| CARGA PARCIAL | (fórmula) |
| REEMBOLSO | 0 |
| CARGA FINAL | (fórmula) |
| STATUS DO CARTAO | Cartão ativo |

### Linha 8 (Segundo colaborador)

| Campo | Valor |
|-------|-------|
| PORTADOR | ABNER ANDRADE CAVALCANTE |
| CPF | 02027745203 |
| STATUS COLAB | (fórmula XLOOKUP) |
| CENTRO CUSTO | CEF AM AC RR |
| GESTOR | ANGELICA SOARES |
| DIREÇÃO | ROGERIO SCATAMBULO |
| SALDO REEMBOLSAR | -98.92 |
| SALDO FINAL | 0 |
| 1QZ DE ABRIL 26 | 9840 |
| SALDO CARTAO | 5 |
| ADIANTAMENTO | - |
| CARGA PARCIAL | (fórmula) |
| REEMBOLSO | 0 |
| CARGA FINAL | (fórmula) |
| STATUS DO CARTAO | Cartão ativo |

---

## Campos que Podem vir da API ✅

| Campo Planilha | Fonte API | Campo API | Observações |
|----------------|-----------|-----------|-------------|
| PORTADOR | TeamMembers | `name` | Correspondência direta |
| CPF | TeamMembers | `cpf` | Correspondência direta |
| CENTRO CUSTO | CostCenters | `name` | Correspondência direta |
| COD CENTRO CUSTO | CostCenters | `integration_id` | Se disponível |
| GESTOR | Approval Flows | `approvers` | Mapeamento complexo |
| DIREÇÃO | Approval Flows | `approvers` | Mapeamento complexo |
| STATUS DO CARTAO | TeamMembers | `active` | Status do usuário, não do cartão físico |
| 1QZ DE ABRIL 26 | Expenses | Cálculo | Soma de despesas do período |
| ADIANTAMENTO | Advances | `value` | Se houver adiantamento |

---

## Campos que NÃO Podem vir da API ❌

| Campo Planilha | Motivo |
|----------------|--------|
| STATUS COLAB (fórmula atual) | Depende de aba externa `[1]Funcionário` |
| SALDO REEMBOLSAR | Dado financeiro do cartão corporativo |
| SALDO FINAL | Dado financeiro do cartão corporativo |
| SALDO CARTAO | Dado financeiro do cartão corporativo |
| CARGA PARCIAL | Depende de SALDO FINAL e SALDO CARTAO (não disponíveis) |
| REEMBOLSO | Dado financeiro de reembolso |
| CARGA FINAL | Depende de CARGA PARCIAL e REEMBOLSO |

---

## Cálculos Necessários via API

### 1. Cálculo de 1QZ DE ABRIL 26

**Lógica:**
```python
# Somar todas as despesas do colaborador no período da 1ª quinzena
def calcular_1qz(cpf, mes, ano):
    despesas = api.get_expenses(
        user_cpf=cpf,
        date_from=f"{ano}-{mes}-01",
        date_to=f"{ano}-{mes}-15"
    )
    return sum(despesa.value for despesa in despesas)
```

**Endpoint API necessário:**
- `/v2/expenses` com filtros por:
  - `user_id` ou `cpf`
  - `date` (range)
  - `on=true` (apenas despesas ativas)

---

## Conclusão e Próximos Passos

### Problemas Identificados

1. **Dados financeiros do cartão:** SALDO FINAL, SALDO CARTAO, REEMBOLSO não estão disponíveis na API
2. **Dependência de abas externas:** STATUS COLAB depende da aba `[1]Funcionário`
3. **Cálculos complexos:** CARGA PARCIAL e CARGA FINAL dependem de dados não disponíveis

### Possíveis Soluções

1. **Manter dados financeiros na planilha:** Continuar usando a planilha para controle de saldos
2. **Usar API apenas para dados operacionais:** PORTADOR, CPF, CENTRO CUSTO, 1QZ calculado
3. **Enriquecer com dados da API:** Adicionar campos da API que não existem na planilha
4. **Híbrido:** Parte dos dados da API + parte da planilha (via VLOOKUP/XLOOKUP)

### Recomendação

Investigar a aba `[1]Funcionário` para entender:
- Estrutura dos dados de funcionários
- Como o STATUS COLAB é determinado
- Se esses dados podem vir da API VExpenses

---

**Data da análise:** 2026-05-21  
**Arquivos gerados:**
- `planilha1_complete_analysis.json` - Análise completa de todas as abas
- `planilha1_formulas.json` - Todas as fórmulas da aba principal
- `planilha1_structure.json` - Estrutura detalhada da aba principal
