# Estrutura Detalhada - Planilha de Carga Quinzenal

## Arquivo
- **Nome**: `CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx`
- **Aba**: Planilha1
- **Dimensão**: 346 linhas x 17 colunas
- **Linha de cabeçalho**: 6 (índice 5)
- **Dados úteis**: 340 linhas (linhas 7-346)

## Estrutura das Linhas

### Linhas 1-3: Vazias
- Linhas sem dados

### Linha 4: Parâmetro
- Contém valor `0.5` na coluna M (provavelmente um parâmetro de cálculo)

### Linha 5: Fórmulas de SUBTOTAL
- Contém fórmulas `=SUBTOTAL(9,H7:H346)` para cada coluna numérica
- Usado para calcular totais

### Linha 6: Cabeçalho
- COLABORADOR
- CPF
- SITUAÇÃO
- REGIONAL
- CENTRO DE CUSTO
- GESTOR
- DIRETOR
- SALDO REEMBOLSAR
- SALDO FINAL
- 1ª QZ
- SALDO CARTAO
- Adiantamento
- CARGA PARCIAL
- REEMBOLSO
- Carga Final
- obs
- STATUS DO CARTÃO

### Linhas 7-346: Dados dos Colaboradores
- 340 colaboradores
- Cada linha representa um colaborador

## Campos Detalhados

### 1. COLABORADOR
- **Tipo**: Texto
- **Origem**: PAINEL (planilha de controle) / API VExpenses
- **Descrição**: Nome completo do colaborador
- **Exemplo**: "JONAS CAVALCANTI DE OLIVEIRA"
- **API**:
  - **Rota**: `GET /v2/team-members`
  - **Campo**: `data[].name`
  - **Formato de retorno**: String direta
  - **Exemplo de response**:
    ```json
    {
      "data": [
        {
          "id": 1130776,
          "name": "MARCELO BRIG CAMPINA",
          "cpf": "71116346087",
          "active": true
        }
      ]
    }
    ```

### 2. CPF
- **Tipo**: Numérico (int64)
- **Origem**: PAINEL (planilha de controle) / API VExpenses
- **Descrição**: CPF do colaborador
- **Exemplo**: 1696239478
- **Observação**: Na carga é int64, no PAINEL é float64
- **API**:
  - **Rota**: `GET /v2/team-members`
  - **Campo**: `data[].cpf`
  - **Formato de retorno**: String (11 dígitos)
  - **Exemplo de response**:
    ```json
    {
      "data": [
        {
          "id": 1130776,
          "name": "MARCELO BRIG CAMPINA",
          "cpf": "71116346087",
          "active": true
        }
      ]
    }
    ```

### 3. SITUAÇÃO
- **Tipo**: Texto
- **Origem**: PAINEL (planilha de controle) / API VExpenses (derivado)
- **Descrição**: Status do colaborador
- **Valores**: "ATIVO", "INATIVO"
- **Exemplo**: "ATIVO"
- **API**:
  - **Rota**: `GET /v2/team-members`
  - **Campo**: `data[].active`
  - **Formato de retorno**: Boolean (true/false)
  - **Mapeamento**: `true` → "ATIVO", `false` → "INATIVO"
  - **Exemplo de response**:
    ```json
    {
      "data": [
        {
          "id": 1130776,
          "name": "MARCELO BRIG CAMPINA",
          "cpf": "71116346087",
          "active": true
        }
      ]
    }
    ```

### 4. REGIONAL
- **Tipo**: Texto
- **Origem**: PAINEL (planilha de controle)
- **Descrição**: Regional do colaborador
- **Exemplo**: "REGIONAL NE"

### 5. CENTRO DE CUSTO
- **Tipo**: Texto
- **Origem**: PAINEL (planilha de controle)
- **Descrição**: Centro de custo do colaborador
- **Exemplo**: "3R PETROLEUM NE"

### 6. GESTOR
- **Tipo**: Texto
- **Origem**: PAINEL (planilha de controle)
- **Descrição**: Gestor do colaborador
- **Cálculo**: VLOOKUP na tabela AUX usando REGIONAL como chave
- **Exemplo**: "GERSON OLIVEIRA"

### 7. DIRETOR
- **Tipo**: Texto
- **Origem**: PAINEL (planilha de controle)
- **Descrição**: Diretor do colaborador
- **Cálculo**: VLOOKUP na tabela AUX usando REGIONAL como chave
- **Exemplo**: "ROGERIO SCATAMBULO"

### 8. SALDO REEMBOLSAR
- **Tipo**: Numérico
- **Origem**: **CALCULADO NA CARGA**
- **Descrição**: Saldo disponível para reembolso
- **Fórmula**: `=SUBTOTAL(9,H7:H346)` (na linha 5)
- **Observação**: Este campo é calculado na própria planilha de carga, não importado do controle

### 9. SALDO FINAL
- **Tipo**: Numérico
- **Origem**: PAINEL (planilha de controle)
- **Descrição**: Saldo final do colaborador
- **Cálculo**: `=SUBTOTAL(9,PAINEL[SALDO FINAL])` no controle
- **Exemplo**: 6945.16

### 10. 1ª QZ
- **Tipo**: Numérico
- **Origem**: **MANUAL**
- **Descrição**: Valor da primeira quinzena
- **Preenchimento**: Manual pelo usuário
- **Exemplo**: 1750

### 11. SALDO CARTAO
- **Tipo**: Numérico
- **Origem**: **CALCULADO NA CARGA**
- **Descrição**: Saldo do cartão VExpenses
- **Observação**: Campo calculado na planilha de carga

### 12. Adiantamento
- **Tipo**: Numérico
- **Origem**: **MANUAL**
- **Descrição**: Valor de adiantamento
- **Preenchimento**: Manual pelo usuário
- **Exemplo**: 15.21

### 13. CARGA PARCIAL
- **Tipo**: Numérico
- **Origem**: **CALCULADO NA CARGA**
- **Descrição**: Carga parcial calculada
- **Fórmula**: `=Tabela1[[#This Row],[1ª QZ]]-Tabela1[[#This Row],[SALDO FINAL]]-Tabela1[[#This Row],[SALDO CARTAO]]-Tabela1[[#This Row],[Adiantamento ]]`
- **Lógica**: 1ª QZ - SALDO FINAL - SALDO CARTAO - Adiantamento

### 14. REEMBOLSO
- **Tipo**: Numérico
- **Origem**: **CALCULADO NA CARGA**
- **Descrição**: Valor de reembolso
- **Fórmula**: `=Tabela1[[#This Row],[SALDO REEMBOLSAR]]*$N$4`
- **Lógica**: SALDO REEMBOLSAR multiplicado pelo parâmetro da célula N4 (0.5)

### 15. Carga Final
- **Tipo**: Numérico
- **Origem**: **CALCULADO NA CARGA**
- **Descrição**: Carga final calculada
- **Fórmula**: `=IF(Tabela1[[#This Row],[CARGA PARCIAL]]<0,0,Tabela1[[#This Row],[CARGA PARCIAL]])+Tabela1[[#This Row],[REEMBOLSO]]`
- **Lógica**: Se CARGA PARCIAL < 0, usa 0, senão usa CARGA PARCIAL, depois soma REEMBOLSO

### 16. obs
- **Tipo**: Texto
- **Origem**: **MANUAL**
- **Descrição**: Observações
- **Preenchimento**: Manual pelo usuário
- **Exemplo**: (vazio na maioria dos casos)

### 17. STATUS DO CARTÃO
- **Tipo**: Texto
- **Origem**: PAINEL (planilha de controle)
- **Descrição**: Status do cartão VExpenses
- **Valores**: "Cartão ativo", "Cadastro pendente", etc.
- **Exemplo**: "Cartão ativo"

## Resumo por Tipo de Campo

### Campos Diretos do PAINEL (7)
1. COLABORADOR
2. CPF
3. SITUAÇÃO
4. REGIONAL
5. CENTRO DE CUSTO
6. SALDO FINAL
7. STATUS DO CARTÃO

### Campos Calculados no PAINEL (2)
1. GESTOR (VLOOKUP na AUX)
2. DIRETOR (VLOOKUP na AUX)

### Campos Manuais (3)
1. 1ª QZ
2. Adiantamento
3. obs

### Campos Calculados na Carga (5)
1. SALDO REEMBOLSAR
2. SALDO CARTAO
3. CARGA PARCIAL
4. REEMBOLSO
5. Carga Final

## Fórmulas da Planilha de Carga

### Linha 5 (Totais)
- `=SUBTOTAL(9,H7:H346)` - SALDO REEMBOLSAR
- `=SUBTOTAL(9,I7:I346)` - SALDO FINAL
- `=SUBTOTAL(9,J7:J346)` - 1ª QZ
- `=SUBTOTAL(9,K7:K346)` - SALDO CARTAO
- `=SUBTOTAL(9,L7:L346)` - Adiantamento
- `=SUBTOTAL(9,M7:M346)` - CARGA PARCIAL
- `=SUBTOTAL(9,N7:N346)` - REEMBOLSO
- `=SUBTOTAL(9,O7:O346)` - Carga Final

### Linhas 7-346 (Por colaborador)
- **CARGA PARCIAL**: `=Tabela1[[#This Row],[1ª QZ]]-Tabela1[[#This Row],[SALDO FINAL]]-Tabela1[[#This Row],[SALDO CARTAO]]-Tabela1[[#This Row],[Adiantamento ]]`
- **REEMBOLSO**: `=Tabela1[[#This Row],[SALDO REEMBOLSAR]]*$N$4`
- **Carga Final**: `=IF(Tabela1[[#This Row],[CARGA PARCIAL]]<0,0,Tabela1[[#This Row],[CARGA PARCIAL]])+Tabela1[[#This Row],[REEMBOLSO]]`

## Observações Importantes

1. **Parâmetro N4**: A célula N4 contém o valor 0.5, usado como multiplicador no cálculo de REEMBOLSO
2. **Tabela1**: A planilha usa referências de tabela estruturada do Excel
3. **Campos vazios**: SALDO REEMBOLSAR e SALDO CARTAO aparecem como 0 ou vazios nos dados atuais
4. **Interseção 100%**: Todos os 340 CPFs da carga existem no PAINEL do controle
5. **Campos manuais**: Apenas 3 campos precisam de input manual após migração para API

## Disponibilidade via API VExpenses

### Campos Simples Disponíveis via API ✅
| Campo | Rota API | Campo JSON | Formato | Observação |
|-------|-----------|------------|---------|------------|
| COLABORADOR | `GET /v2/team-members` | `data[].name` | String | Nome completo |
| CPF | `GET /v2/team-members` | `data[].cpf` | String (11 dígitos) | CPF como string |
| SITUAÇÃO | `GET /v2/team-members` | `data[].active` | Boolean | `true`→"ATIVO", `false`→"INATIVO" |

### Campos Calculados (requerem lógica adicional)
| Campo | Origem | Observação |
|-------|--------|------------|
| GESTOR | VLOOKUP no PAINEL | Requer tabela AUX |
| DIRETOR | VLOOKUP no PAINEL | Requer tabela AUX |
| SALDO FINAL | PAINEL | Campo calculado no painel |
| SALDO REEMBOLSAR | Calculado na Carga | Fórmula da planilha |
| SALDO CARTAO | Calculado na Carga | Campo calculado |
| CARGA PARCIAL | Calculado na Carga | Fórmula da planilha |
| REEMBOLSO | Calculado na Carga | Fórmula da planilha |
| Carga Final | Calculado na Carga | Fórmula da planilha |

### Campos Manuais (requerem input do usuário)
| Campo | Observação |
|-------|------------|
| 1ª QZ | Preenchimento manual |
| Adiantamento | Preenchimento manual |
| obs | Preenchimento manual |
