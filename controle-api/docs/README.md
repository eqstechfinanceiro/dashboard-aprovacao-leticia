# Sistema de Análise de Dados - Planilha Carga Quinzenal

## Estrutura dos Arquivos

### Arquivos Originais
- `CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx` - Planilha de carga quinzenal (341 linhas)
- `CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx` - Arquivo de controle com múltiplas abas e fórmulas
- `CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsb` - Versão binária (sem fórmulas)

### ⚠️ Importante: XLSX vs XLSB

O arquivo XLSX contém **160.116 fórmulas** distribuídas em 9 abas:
- PAINEL: 12.201 fórmulas
- SALDO CARTAO: 9.656 fórmulas
- QUINZENAS: 33.165 fórmulas
- EXTRATO: 52.438 fórmulas
- BASE PREST: 50.648 fórmulas
- E outras abas menores

**Recomendação:** Use sempre o arquivo `.xlsx` para análise, pois o `.xlsb` perde todas as fórmulas e os dados calculados.

## Abas do Arquivo de Controle

| Aba | Linhas | Colunas | Descrição |
|-----|--------|---------|-----------|
| PAINEL | 721 | 27 | Painel principal com dados dos colaboradores |
| QUINZENAS | 11.065 | 9 | Valores por quinzena |
| SALDO CARTAO | 7.946 | 11 | Saldo do cartão VExpenses |
| REEMBOLSO | 281 | 9 | Dados de reembolso |
| ADICIONAL ITAÚ | - | - | Adicionais Itaú |
| ADICIONAIS | - | - | Outros adicionais |
| SALDOS ADM EQS | - | - | Saldos administrativos |
| EXTRATO | - | - | Extrato de movimentações |
| PAINEL PRESTAÇÕES | - | - | Painel de prestações |
| BASE PREST | - | - | Base de prestações |
| ESTORNO - SAQUE | - | - | Estornos e saques |
| Detalhes1/2/3 | - | - | Detalhes de relatórios |
| AUX | 37 | 5 | Tabela auxiliar (Regional, Gestor, Diretor) |

## Como Usar

### 1. Carregar Dados

```python
from carregador_dados import CarregadorDados

# Inicializar carregador
carregador = CarregadorDados()

# Listar abas disponíveis
abas = carregador.listar_abas_controle()
print(abas)

# Carregar carga quinzenal
df_carga = carregador.carregar_carga_quinzenal()

# Carregar aba específica do controle
df_painel = carregador.carregar_aba_controle('PAINEL')
df_quinzenas = carregador.carregar_aba_controle('QUINZENAS')
df_saldo = carregador.carregar_aba_controle('SALDO CARTAO')
df_reembolso = carregador.carregar_aba_controle('REEMBOLSO')

# Ver resumo dos dados carregados
carregador.mostrar_resumo()
```

### 2. Acessar Dados Carregados

```python
# Acessar DataFrame específico
painel = carregador.obter_dados('PAINEL')
quinzenas = carregador.obter_dados('QUINZENAS')

# Ver colunas
print(painel.columns.tolist())

# Ver primeiras linhas
print(painel.head())

# Filtros e análises
colaboradores_ativos = painel[painel['SITUAÇÃO'] == 'ATIVO']
```

### 3. Cache Automático

O sistema salva automaticamente os dados em cache (arquivos `.pkl`) para carregamento rápido nas próximas vezes.

```python
# Limpar cache se necessário
carregador.limpar_cache()

# Desabilitar cache para recarregar do Excel
df = carregador.carregar_aba_controle('PAINEL', usar_cache=False)
```

### 4. Correlacionar Dados Entre Abas

```python
# Exemplo: Correlacionar PAINEL com QUINZENAS por CPF
painel = carregador.obter_dados('PAINEL')
quinzenas = carregador.obter_dados('QUINZENAS')

# Merge por CPF
merged = pd.merge(painel, quinzenas, on='CPF', how='left')

# Exemplo: Correlacionar com AUX por REGIONAL
aux = carregador.obter_dados('AUX')
merged_aux = pd.merge(painel, aux, on='REGIONAL', how='left')
```

## Scripts de Análise

### `explorar_estrutura.py`
Explora a estrutura dos arquivos Excel (abas, linhas, colunas).

```bash
python explorar_estrutura.py
```

### `comparar_xlsx_xlsb.py`
Compara os arquivos XLSX e XLSB para verificar diferenças.

```bash
python comparar_xlsx_xlsb.py
```

### `carregador_dados.py`
Classe principal para carregar e gerenciar os dados.

```bash
python carregador_dados.py
```

## Observações Importantes

1. **Fórmulas:** O arquivo XLSX usa fórmulas do Excel (SUBTOTAL, VLOOKUP, XLOOKUP, etc.). Ao carregar com pandas, você obtém os valores calculados, não as fórmulas.

2. **Linhas de Cabeçalho:** Cada aba tem o cabeçalho em uma linha diferente:
   - PAINEL: linha 11
   - QUINZENAS: linha 4
   - SALDO CARTAO: linha 5
   - REEMBOLSO: linha 3
   - AUX: linha 2

3. **Colunas Unnamed:** O sistema remove automaticamente colunas "Unnamed" (vazias) após o carregamento.

4. **Avisos openpyxl:** Você verá avisos sobre "conditional formatting" e "slicer" - são normais e não afetam os dados.

## Próximos Passos

Para análises específicas, crie novos scripts na pasta `teste/` importando o `CarregadorDados`:

```python
from carregador_dados import CarregadorDados
import pandas as pd

c = CarregadorDados()
painel = c.carregar_aba_controle('PAINEL')
quinzenas = c.carregar_aba_controle('QUINZENAS')

# Sua análise aqui...
```
