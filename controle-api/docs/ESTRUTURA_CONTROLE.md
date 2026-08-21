# Estrutura Detalhada - Planilha de Controle

## Arquivo
- **Nome**: `CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx`
- **Total de abas**: 16
- **Total de fórmulas**: 160.116
- **Tamanho**: ~15 MB

## Resumo de Fórmulas por Aba

| ABA | Fórmulas | Total Células | % Fórmulas | Tipo |
|-----|----------|---------------|------------|------|
| EXTRATO | 52.438 | ~500k | ~10% | Cálculos de movimentações |
| BASE PREST | 50.648 | ~500k | ~10% | Cálculos de prestações |
| QUINZENAS | 33.165 | ~100k | ~33% | Cálculos por quinzena |
| PAINEL | 12.201 | ~20k | ~60% | Painel principal |
| SALDO CARTAO | 9.656 | ~100k | ~10% | Saldo do cartão |
| ADICIONAIS | 1.698 | ~500 | ~340% | Adicionais |
| REEMBOLSO | 282 | ~3k | ~9% | Reembolsos |
| ADICIONAL ITAÚ | 17 | ~400 | ~4% | Adicionais Itaú |
| SALDOS ADM EQS | 11 | ~200 | ~5% | Saldos administrativos |
| PAINEL PRESTAÇÕES | 0 | ~5k | 0% | Painel de prestações |
| ESTORNO - SAQUE | 0 | ~2k | 0% | Estornos |
| Detalhes1/2/3 | 0 | ~30k | 0% | Detalhes de relatórios |
| AUX | 0 | ~200 | 0% | Tabela auxiliar |

## Abas Principais

### 1. PAINEL (12.201 fórmulas)
**Dimensão**: 721 linhas x 27 colunas  
**Linha de cabeçalho**: 11 (índice 10)  
**Dados úteis**: 710 colaboradores (linhas 12-721)

#### Campos (27 colunas)

| # | Campo | Tipo | Origem | Fórmula/Descrição |
|---|-------|------|--------|-------------------|
| 1 | EMPRESA | Texto | Direto | "EQS" |
| 2 | COLABORADOR | Texto | Direto | Nome do colaborador |
| 3 | CPF | Numérico | Direto | CPF do colaborador |
| 4 | CHAVE | Texto | **Calculado** | `=LEFT(CPF,3)&RIGHT(CPF,3)` |
| 5 | SITUAÇÃO | Texto | Direto | "ATIVO" ou "INATIVO" |
| 6 | STATUS DO CARTÃO | Texto | Direto | Status do cartão |
| 7 | CARTÃO ITAU | Numérico | Direto | Número do cartão Itaú |
| 8 | TERMO | Texto | Direto | "ASSINADO" |
| 9 | REGIONAL | Texto | Direto | Regional |
| 10 | CENTRO DE CUSTO | Texto | Direto | Centro de custo |
| 11 | GESTOR | Texto | **Calculado** | `=VLOOKUP(REGIONAL, AUX!B:C, 2, 0)` |
| 12 | DIRETOR | Texto | **Calculado** | `=VLOOKUP(REGIONAL, AUX!B:D, 3, 0)` |
| 13 | CARTÃO VEXPENSES | Texto | Direto | "SIM" ou "NÃO" |
| 14 | CARGA | Numérico | **Calculado** | `=SUMIFS(EXTRATO!L:L, EXTRATO!J:J, "CARGA", EXTRATO!I:I, COLABORADOR)` |
| 15 | TRANSFERENCIA | Numérico | **Calculado** | `=SUMIFS(EXTRATO!L:L, EXTRATO!J:J, "TRANSFERÊNCIA", EXTRATO!I:I, COLABORADOR)` |
| 16 | (-) TARIFA | Numérico | **Calculado** | `=SUMIFS(EXTRATO!L:L, EXTRATO!J:J, "TARIFA", EXTRATO!I:I, COLABORADOR)` |
| 17 | (-) PRESTAÇÃO DE CONTAS | Numérico | **Calculado** | `=SUMIF('BASE PREST'!J:J, CPF, 'BASE PREST'!AA:AA)` |
| 18 | SALDO PRESTAÇÃO | Numérico | **Calculado** | `=CARGA + TRANSFERENCIA + (-) TARIFA - (-) PRESTAÇÃO DE CONTAS` |
| 19 | (-) SALDO CARTAO | Numérico | **Calculado** | `=IFERROR(VLOOKUP(CPF, 'SALDO CARTAO'!K:L, 2, 0), 0)` |
| 20 | SALDO FINAL | Numérico | **Calculado** | `=SALDO PRESTAÇÃO - (-) SALDO CARTAO` |
| 21 | 1ª QZ | Numérico | **Calculado** | `=SUMIFS(QUINZENAS[VALOR], QUINZENAS[CPF], CPF, QUINZENAS[QUINZENA], "1ª QZ", QUINZENAS[MÊS], $W$8, QUINZENAS[ANO], $W$7)` |
| 22 | 2ª QZ | Numérico | **Calculado** | `=SUMIFS(QUINZENAS[VALOR], QUINZENAS[CPF], CPF, QUINZENAS[QUINZENA], "2ª QZ", QUINZENAS[MÊS], $W$8, QUINZENAS[ANO], $W$7)` |
| 23 | ADICIONAIS | Numérico | **Calculado** | `=SUMIFS(ADICIONAIS[VALOR], ADICIONAIS[CPF], CPF, ADICIONAIS[MÊS], $W$8, ADICIONAIS[ANO], $W$7)` |
| 24 | SITUAÇÃO COLABORADOR | Texto | **Calculado** | `=IF(1ª QZ + 2ª QZ >= SALDO FINAL, "PROCESSADO", "BLOQUEADO")` |
| 25 | CARTÃO CRED. ITAU | Texto | **Calculado** | `=IF(ITAU > 0, "SIM", "NÃO")` |
| 26 | ITAU | Numérico | **Calculado** | `=SUMIFS(QUINZENAS[VALOR], QUINZENAS[CPF], CPF, QUINZENAS[QUINZENA], "ITAU", QUINZENAS[MÊS], $W$8)` |
| 27 | ADICIONAL ITAU | Numérico | **Calculado** | `=SUMIFS(ADICIONAL_ITAU[ADICIONADO], ADICIONAL_ITAU[CPF], CPF, ADICIONAL_ITAU[MÊS], $W$8)` |

#### Dependências do PAINEL
- **AUX**: Para GESTOR e DIRETOR (VLOOKUP)
- **EXTRATO**: Para CARGA, TRANSFERENCIA, (-) TARIFA (SUMIFS)
- **BASE PREST**: Para (-) PRESTAÇÃO DE CONTAS (SUMIF)
- **SALDO CARTAO**: Para (-) SALDO CARTAO (VLOOKUP)
- **QUINZENAS**: Para 1ª QZ, 2ª QZ, ITAU (SUMIFS)
- **ADICIONAIS**: Para ADICIONAIS (SUMIFS)
- **ADICIONAL ITAÚ**: Para ADICIONAL ITAU (SUMIFS)

#### Parâmetros
- **$W$7**: Ano (ex: 2026)
- **$W$8**: Mês (ex: "MAIO")

### 2. QUINZENAS (33.165 fórmulas)
**Dimensão**: 11.069 linhas x 9 colunas  
**Linha de cabeçalho**: 4 (índice 3)  
**Dados úteis**: 11.065 registros de quinzenas

#### Campos (9 colunas)
1. COLABORADOR - Nome do colaborador
2. CPF - CPF do colaborador
3. VALOR - Valor da quinzena
4. QUINZENA - "1ª QZ", "2ª QZ", "ITAU"
5. DATA - Data (número serial Excel)
6. MÊS - **Calculado**: `=UPPER(TEXT(DATA, "MMMM"))`
7. ANO - **Calculado**: `=YEAR(DATA)`
8. REGIONAL - **Calculado**: `=VLOOKUP(CPF, PAINEL!C:I, 7, 0)`
9. OBSERVAÇÃO - Observações

#### Dependências do QUINZENAS
- **PAINEL**: Para REGIONAL (VLOOKUP)

### 3. SALDO CARTAO (9.656 fórmulas)
**Dimensão**: 7.951 linhas x 14 colunas  
**Linha de cabeçalho**: 5 (índice 4)  
**Dados úteis**: 7.946 registros de saldo

#### Campos (14 colunas)
1. COLABORADOR - Nome
2. CPF - CPF
3. VALOR - Valor
4. QUINZENA - Quinzena
5. DATA - Data
6. MÊS - **Calculado**: `=UPPER(TEXT(DATA, "MMMM"))`
7. ANO - **Calculado**: `=YEAR(DATA)`
8. REGIONAL - **Calculado**: `=VLOOKUP(CPF, PAINEL!C:I, 7, 0)`
9. [Outros campos calculados]

#### Dependências do SALDO CARTAO
- **PAINEL**: Para REGIONAL (VLOOKUP)

### 4. EXTRATO (52.438 fórmulas)
**Dimensão**: ~500k linhas x 14 colunas  
**Linha de cabeçalho**: 2 (índice 1)

#### Campos principais
- COLABORADOR
- CPF
- TIPO - "CARGA", "TRANSFERÊNCIA", "TARIFA", etc.
- VALOR
- DATA
- MÊS
- ANO
- REGIONAL

#### Dependências do EXTRATO
- **PAINEL**: Para REGIONAL (VLOOKUP)

### 5. BASE PREST (50.648 fórmulas)
**Dimensão**: ~500k linhas x 29 colunas  
**Linha de cabeçalho**: 2 (índice 1)

#### Campos principais
- ID da Despesa
- Nome do relatório
- Nome do membro de equipe
- CPF
- Valor
- MÊS
- Centro de Custos
- Forma de pagamento

#### Dependências do BASE PREST
- **PAINEL**: Para Nome do membro de equipe (VLOOKUP)

### 6. REEMBOLSO (282 fórmulas)
**Dimensão**: 284 linhas x 10 colunas  
**Linha de cabeçalho**: 3 (índice 2)  
**Dados úteis**: 281 registros

#### Campos (10 colunas)
1. COLABORADOR
2. CPF
3. VALOR
4. DATA
5. MÊS - **Calculado**: `=UPPER(TEXT(E:E, "MMMM"))`
6. CENTRO DE CUSTO
7. DIRETOR REGIONAL
8. DIRETOR REGIONAL (2)
9. MOTIVO

### 7. ADICIONAIS (1.698 fórmulas)
**Dimensão**: ~500 linhas x 20 colunas  
**Linha de cabeçalho**: 4 (índice 3)

#### Campos principais
- COLABORADOR
- CPF
- VALOR
- DATA
- MÊS
- ANO

### 8. ADICIONAL ITAÚ (17 fórmulas)
**Dimensão**: ~100 linhas x 8 colunas  
**Linha de cabeçalho**: 5 (índice 4)

#### Campos principais
- COLABORADOR
- CPF
- ADICIONADO
- DATA
- MÊS - **Calculado**: `=UPPER(TEXT(DATA, "[$-pt-BR]mmmm"))`

### 9. SALDOS ADM EQS (11 fórmulas)
**Dimensão**: 15 linhas x 11 colunas  
**Linha de cabeçalho**: 2 (índice 1)

#### Campos principais
- REGIONAL
- GESTOR
- DIRETOR
- VALOR 1
- VALOR 2
- TOTAL - **Calculado**: `=VALOR 1 + VALOR 2`

### 10. AUX (0 fórmulas)
**Dimensão**: 38 linhas x 5 colunas  
**Linha de cabeçalho**: 2 (índice 1)  
**Dados úteis**: 35 registros

#### Campos (5 colunas)
1. REGIONAL - Chave primária
2. GESTOR
3. DIRETOR
4. REGIONAL2 - Regional alternativa

#### Função
Tabela auxiliar usada para lookup de GESTOR e DIRETOR por REGIONAL

### 11. PAINEL PRESTAÇÕES (0 fórmulas)
**Dimensão**: 514 linhas x 9 colunas  
**Linha de cabeçalho**: 1 (índice 0)

#### Campos
- Dados de prestações de contas

### 12. ESTORNO - SAQUE (0 fórmulas)
**Dimensão**: ~2k linhas x 10 colunas  
**Linha de cabeçalho**: 2 (índice 1)

#### Campos
- Dados de estornos e saques

### 13. Detalhes1/2/3 (0 fórmulas)
**Dimensão**: ~30k linhas x 29 colunas  
**Linha de cabeçalho**: 2 (índice 1)

#### Campos
- Detalhes de relatórios específicos

## Mapa de Dependências Entre Abas

```
AUX
├── PAINEL (GESTOR, DIRETOR via VLOOKUP)
└── QUINZENAS (REGIONAL via VLOOKUP)
└── SALDO CARTAO (REGIONAL via VLOOKUP)
└── EXTRATO (REGIONAL via VLOOKUP)

PAINEL
├── QUINZENAS (1ª QZ, 2ª QZ, ITAU via SUMIFS)
├── SALDO CARTAO ((-) SALDO CARTAO via VLOOKUP)
├── EXTRATO (CARGA, TRANSFERENCIA, (-) TARIFA via SUMIFS)
├── BASE PREST ((-) PRESTAÇÃO DE CONTAS via SUMIF)
├── ADICIONAIS (ADICIONAIS via SUMIFS)
└── ADICIONAL ITAÚ (ADICIONAL ITAU via SUMIFS)

EXTRATO
└── PAINEL (CARGA, TRANSFERENCIA, (-) TARIFA)

BASE PREST
└── PAINEL ((-) PRESTAÇÃO DE CONTAS)

QUINZENAS
└── PAINEL (REGIONAL via VLOOKUP)

SALDO CARTAO
└── PAINEL ((-) SALDO CARTAO via VLOOKUP)
└── PAINEL (REGIONAL via VLOOKUP)

ADICIONAIS
└── PAINEL (ADICIONAIS via SUMIFS)

ADICIONAL ITAÚ
└── PAINEL (ADICIONAL ITAU via SUMIFS)
```

## Campos Calculados por Tipo de Função

### VLOOKUP (Busca em tabelas auxiliares)
- GESTOR (PAINEL) → AUX
- DIRETOR (PAINEL) → AUX
- REGIONAL (QUINZENAS) → PAINEL
- REGIONAL (SALDO CARTAO) → PAINEL
- REGIONAL (EXTRATO) → PAINEL
- (-) SALDO CARTAO (PAINEL) → SALDO CARTAO
- Nome do membro de equipe (BASE PREST) → PAINEL

### SUMIFS (Soma condicional)
- CARGA (PAINEL) → EXTRATO
- TRANSFERENCIA (PAINEL) → EXTRATO
- (-) TARIFA (PAINEL) → EXTRATO
- 1ª QZ (PAINEL) → QUINZENAS
- 2ª QZ (PAINEL) → QUINZENAS
- ITAU (PAINEL) → QUINZENAS
- ADICIONAIS (PAINEL) → ADICIONAIS
- ADICIONAL ITAU (PAINEL) → ADICIONAL ITAÚ

### SUMIF (Soma simples)
- (-) PRESTAÇÃO DE CONTAS (PAINEL) → BASE PREST

### Cálculos Aritméticos
- CHAVE (PAINEL): `=LEFT(CPF,3)&RIGHT(CPF,3)`
- SALDO PRESTAÇÃO (PAINEL): `=CARGA + TRANSFERENCIA + (-) TARIFA - (-) PRESTAÇÃO DE CONTAS`
- SALDO FINAL (PAINEL): `=SALDO PRESTAÇÃO - (-) SALDO CARTAO`
- MÊS (QUINZENAS): `=UPPER(TEXT(DATA, "MMMM"))`
- ANO (QUINZENAS): `=YEAR(DATA)`
- TOTAL (SALDOS ADM EQS): `=VALOR 1 + VALOR 2`

### Condicionais (IF)
- SITUAÇÃO COLABORADOR (PAINEL): `=IF(1ª QZ + 2ª QZ >= SALDO FINAL, "PROCESSADO", "BLOQUEADO")`
- CARTÃO CRED. ITAU (PAINEL): `=IF(ITAU > 0, "SIM", "NÃO")`
- (-) SALDO CARTAO (PAINEL): `=IFERROR(VLOOKUP(...), 0)`

### SUBTOTAL (Totais)
- Usado em várias abas para calcular totais filtrados

## Observações Importantes

1. **Centralidade do PAINEL**: A aba PAINEL é o centro das dependências - quase todas as abas alimentam ou são alimentadas pelo PAINEL
2. **AUX como tabela de referência**: A aba AUX é uma tabela simples usada para lookup de GESTOR e DIRETOR por REGIONAL
3. **Parâmetros globais**: As células $W$7 (ANO) e $W$8 (MÊS) no PAINEL controlam filtros de data em várias fórmulas
4. **Volume de dados**: EXTRATO e BASE PREST são as maiores abas (~500k linhas cada), contendo transações detalhadas
5. **Cálculos em cascata**: Muitos campos dependem de outros campos calculados (ex: SALDO FINAL depende de SALDO PRESTAÇÃO que depende de CARGA, TRANSFERENCIA, etc.)
6. **Fórmulas estruturadas**: Uso intensivo de referências de tabela do Excel (ex: `PAINEL[[#This Row],[CPF]]`)
