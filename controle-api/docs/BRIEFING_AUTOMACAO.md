# Briefing: Automação da Planilha de Carga Quinzenal - VExpenses EQS

## Objetivo

Criar um script Python que, dado um período quinzenal (data_inicio + data_fim), acessa a API VExpenses, baixa os dados financeiros e gera automaticamente a planilha `CARGA QZ VEXPENSES EQS.xlsx` preenchida.

---

## 1. Contexto do Negócio

A EQS Engenharia usa o VExpenses para gestão de cartões corporativos de ~340 colaboradores organizados em **23 grupos regionais**. A cada quinzena é gerada uma planilha de "carga" que define quanto cada colaborador vai receber no cartão.

**Quinzenas:**
- 1ª QZ: dia 1 ao 15 do mês
- 2ª QZ: dia 16 ao último dia do mês

---

## 2. Estrutura da Planilha de Carga (Output desejado)

**Arquivo**: `CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx`  
**Aba**: `Planilha1`  
**Linhas**: 6 de cabeçalho + 340 linhas de colaboradores

### Layout da planilha:
- **Linha 4**: Parâmetro `0.5` na coluna M (multiplicador de reembolso)
- **Linha 5**: Fórmulas `=SUBTOTAL(9, ...)` para totais por coluna
- **Linha 6**: Cabeçalhos
- **Linhas 7-346**: Dados por colaborador

### Colunas (A até Q):

| Col | Nome | Origem | Observação |
|-----|------|--------|------------|
| A | COLABORADOR | API `/v2/team-members` campo `name` | Nome em maiúsculas |
| B | CPF | API `/v2/team-members` campo `cpf` | String 11 dígitos |
| C | SITUAÇÃO | API `/v2/team-members` campo `active` | `true`→"ATIVO", `false`→"INATIVO" |
| D | REGIONAL | Planilha PAINEL (controle) | Ex: "REGIONAL SC" |
| E | CENTRO DE CUSTO | Planilha PAINEL (controle) | |
| F | GESTOR | Planilha AUX (controle) por REGIONAL | VLOOKUP REGIONAL → GESTOR |
| G | DIRETOR | Planilha AUX (controle) por REGIONAL | VLOOKUP REGIONAL → DIRETOR |
| H | SALDO REEMBOLSAR | **Calculado na carga** | Soma de prestações de contas aprovadas no período |
| I | SALDO FINAL | Planilha PAINEL (controle) | Saldo acumulado do colaborador |
| J | 1ª QZ | **MANUAL** | Valor fixo da quinzena (preenchido pelo usuário) |
| K | SALDO CARTAO | **API VExpenses** `/v3/pay/` | Saldo atual do cartão do colaborador |
| L | Adiantamento | **MANUAL** | Valor de adiantamento eventual |
| M | CARGA PARCIAL | Fórmula: `J - I - K - L` | `1ª QZ - SALDO FINAL - SALDO CARTAO - Adiantamento` |
| N | REEMBOLSO | Fórmula: `H * 0.5` | `SALDO REEMBOLSAR * parâmetro N4` |
| O | Carga Final | Fórmula: `=IF(M<0,0,M)+N` | Carga efetiva a carregar |
| P | obs | **MANUAL** | Observações livres |
| Q | STATUS DO CARTÃO | Planilha PAINEL (controle) | Ex: "Cartão ativo", "Cadastro pendente" |

---

## 3. Fontes de Dados

### 3.1 API VExpenses - Autenticação

A autenticação é feita via **cookies de sessão** (não Bearer token):

```python
COOKIES = {
    "language": "pt-BR",
    "laravel_token": "<TOKEN>",  # Cookie de sessão Laravel (~500 chars, válido ~30 dias)
    "GACID": "GACID1825947",
    "GAUID": "GAUID1155319",
}

HEADERS = {
    "accept": "application/json",
    "accept-language": "pt-BR",
    "origin": "https://amp.vexpenses.com",
    "referer": "https://amp.vexpenses.com/",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}
```

O `laravel_token` precisa ser renovado manualmente quando expirar (capturado via DevTools do browser no site `amp.vexpenses.com`).

**Base URL**: `https://api.vexpenses.com`

---

### 3.2 Endpoint Principal: Excel de Extrato (campo SALDO CARTAO e TARIFA)

**O endpoint mais importante da automação:**

```
GET https://api.vexpenses.com/v3/pay/statement/excel-all
    ?start_date=2026-05-16
    &end_date=2026-05-31
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "url": "https://s3-vex-vexprod-app.s3.us-east-1.amazonaws.com/pay/statements/xxxxx.xlsx",
    "expires_in": "2026-07-15 18:40:42"
  }
}
```

Baixar o XLSX pela URL S3 retornada (não requer autenticação).

**Estrutura do XLSX baixado** (aba `Extrato`, ~6.000+ linhas):

| Coluna | Nome |
|--------|------|
| 0 | Data |
| 1 | Hora |
| 2 | Código de Transação |
| 3 | Número do Cartão |
| 4 | Grupo |
| 5 | Usuário |
| 6 | Tipo |
| 7 | Descrição |
| 8 | Valor |
| 9 | Status |
| 10 | ID da Despesa |
| 11 | ID do Relatório |
| 12 | Tipo de Despesa |
| 13 | Centro de Custo |
| 14 | Projeto |
| 15 | Percentual de projeto |

**Tipos de transação e seus mapeamentos:**

| Tipo no XLSX | Campo da planilha | Regra |
|---|---|---|
| `Transferência` (Valor > 0) | **CARGA** | Entrada de dinheiro no cartão do colaborador |
| `Transferência` (Valor < 0) | **TRANSFERÊNCIA** (saída) | Saída do cartão do colaborador |
| `Taxa` | **TARIFA** | Cobrada por transação |
| `Compra` | Despesas/prestação | Para cálculo de SALDO REEMBOLSAR |
| `Saque` | Saque em ATM | |
| `Pix` | Transferência Pix | |
| `Estorno` | Estorno de compra | |
| `Estorno de taxa` | Estorno de tarifa | |

---

### 3.3 Endpoint de Grupos (card-groups)

```
GET https://api.vexpenses.com/v3/pay/v2/app/card-groups/
```

Retorna os 23 grupos com seus `account_aggregation_id`:

```json
{
  "data": {
    "objects": [
      {
        "id": "dcbf8cae-...",
        "name": "ADMINISTRATIVO",
        "account_aggregation_id": "ca9953e8-4a88-4d05-9de8-2cdc4d486919"
      },
      ...
    ]
  }
}
```

**Grupos existentes**: ADMINISTRATIVO, COMERCIAL, DIRETORIA, FINANCEIRO, GESTAO DE PESSOAS, IMPLANTACAO, KEY ACCOUNT, REGIONAL CLARO INFRA NORDESTE, REGIONAL CLARO INFRA RS, REGIONAL CLARO INFRA SC, REGIONAL CLARO INFRA SUL, REGIONAL CO, REGIONAL DEFENSORIA PUBLICA RS, REGIONAL DOCUMENTOS, REGIONAL ES, REGIONAL MG, REGIONAL NE, REGIONAL QSMS, REGIONAL RJ, REGIONAL RS, REGIONAL SC, REGIONAL SP, REGIONAL TI

---

### 3.4 Endpoint de Saldo por Grupo (statement)

```
GET https://api.vexpenses.com/v3/pay/statement/account-aggregations/{account_aggregation_id}
    ?start_date=2026-05-16
    &end_date=2026-05-31
    &limit=500
```

Retorna `daily_balances` (saldo diário) e `transactions` do grupo.  
O `daily_balances[0].balance` = saldo atual do grupo.

---

### 3.5 API pública v2 (colaboradores)

```
GET https://api.vexpenses.com/v2/team-members
    ?active=true
    &limit=500
    &page=1
```

**Requer**: header `Authorization: Bearer <vexAt_token>` (JWT público, diferente do laravel_token)

Retorna:
```json
{
  "data": [
    {
      "id": 1130776,
      "name": "MARCELO BRIG CAMPINA",
      "cpf": "71116346087",
      "active": true,
      "payment_method": "CARD"
    }
  ]
}
```

---

### 3.6 Saldo da empresa

```
GET https://api.vexpenses.com/v3/pay/company/balance
```

Retorna: `{"data": {"amount": 104.07}}`

---

## 4. Arquivos de Controle (Planilhas Excel Locais)

Localização: `backend/planilhas/`

### `CONTROLE - VEXPENSES - MAIO - 2026.xlsx`

**Aba PAINEL** (cabeçalho na linha 11):
- Colunas relevantes: `COLABORADOR`, `CPF`, `SITUAÇÃO`, `REGIONAL`, `CENTRO DE CUSTO`, `SALDO FINAL`, `STATUS DO CARTÃO`

**Aba AUX** (cabeçalho na linha 2):
- Colunas: `REGIONAL`, `GESTOR`, `DIRETOR` (tabela de lookup)
- 37 linhas (~23 regionais)

**Aba SALDO CARTAO** (cabeçalho na linha 5):
- Histórico de saldos de cartão por colaborador

**Aba QUINZENAS** (cabeçalho na linha 4):
- Histórico de valores por quinzena por colaborador

**Aba BASE PREST**:
- Base de prestações de contas — fonte do `SALDO REEMBOLSAR`

---

## 5. Lógica de Cálculo dos Campos

### SALDO CARTAO (col K)
Saldo atual do cartão do colaborador. Vem do XLSX baixado via `excel-all`:
- Para cada colaborador: pegar a última linha com `Tipo = None` e `Valor = 0.0` (linha de cabeçalho do colaborador no XLSX) — **OU** calcular pelo saldo do grupo usando statement API.

> **Nota**: No XLSX, cada colaborador tem uma linha de "saldo inicial" (Hora = '-', Valor = 0.0) que pode representar o saldo atual. Confirmar a lógica com dados reais.

### SALDO REEMBOLSAR (col H)
Soma das despesas aprovadas no relatório que precisam de reembolso.  
Fonte: API `/v2/reports` com `status=APROVADO` no período, ou aba `BASE PREST` do controle.

### CARGA PARCIAL (col M)
```
CARGA PARCIAL = 1ª QZ - SALDO FINAL - SALDO CARTAO - Adiantamento
```

### REEMBOLSO (col N)
```
REEMBOLSO = SALDO REEMBOLSAR * 0.5
```
(o multiplicador 0.5 fica na célula N4 da planilha)

### Carga Final (col O)
```
Carga Final = MAX(CARGA PARCIAL, 0) + REEMBOLSO
```

---

## 6. Fluxo de Execução Proposto

```
1. Receber input: start_date, end_date, arquivo_controle.xlsx
2. Carregar aba PAINEL do controle → dict CPF → {REGIONAL, CENTRO DE CUSTO, SALDO FINAL, STATUS CARTAO}
3. Carregar aba AUX do controle → dict REGIONAL → {GESTOR, DIRETOR}
4. Chamar GET /v3/pay/statement/excel-all?start_date=X&end_date=Y
5. Baixar XLSX do S3 retornado
6. Processar XLSX:
   a. Agrupar por Usuário (col 5)
   b. Para cada colaborador:
      - SALDO CARTAO = saldo atual (linha de cabeçalho com Valor=0, Hora='-')
      - TARIFA = soma de todas as linhas com Tipo = "Taxa"
      - CARGA recebida = soma de Transferências com Valor > 0
      - TRANSFERENCIA saída = soma de Transferências com Valor < 0
7. Para cada colaborador do PAINEL:
   - Cruzar por nome (normalizado) ou por CPF
   - Preencher colunas D, E (PAINEL), F, G (AUX), I, Q (PAINEL)
   - Preencher K (SALDO CARTAO do XLSX)
   - Deixar J (1ª QZ), L (Adiantamento), P (obs) em branco para preenchimento manual
8. Calcular fórmulas: M, N, O
9. Gerar XLSX final com formatação da planilha original
```

---

## 7. Estrutura do Projeto

```
planilha-carga-quinzenal/
├── backend/
│   ├── planilhas/         # Arquivos Excel de controle
│   ├── scripts/           # Scripts de geração
│   └── cache/             # Cache de dados
├── docs/
│   ├── BRIEFING_AUTOMACAO.md  # Este arquivo
│   ├── ESTRUTURA_CARGA.md     # Detalhamento dos campos
│   └── README.md
├── output/
│   └── statement_carga_quinzenal.xlsx  # XLSX baixado da API (exemplo)
└── teste/
    ├── explorar_card_groups.py
    ├── baixar_excel_statement.py
    └── ...
```

---

## 8. Dependências Python Necessárias

```txt
requests
openpyxl
pandas
```

---

## 9. Exemplo de Código Base

```python
import requests
import openpyxl
import pandas as pd
from io import BytesIO

# ---- CONFIGURAÇÃO ----
COOKIES = {
    "language": "pt-BR",
    "laravel_token": "<SUBSTITUIR>",
    "GACID": "GACID1825947",
    "GAUID": "GAUID1155319",
}
H = {
    "accept": "application/json",
    "origin": "https://amp.vexpenses.com",
    "referer": "https://amp.vexpenses.com/",
}
START_DATE = "2026-05-16"
END_DATE   = "2026-05-31"

# ---- PASSO 1: Baixar XLSX da API ----
r = requests.get(
    "https://api.vexpenses.com/v3/pay/statement/excel-all",
    params={"start_date": START_DATE, "end_date": END_DATE},
    headers=H, cookies=COOKIES, timeout=30
)
xlsx_url = r.json()["data"]["url"]
xlsx_bytes = requests.get(xlsx_url, timeout=60).content

# ---- PASSO 2: Processar XLSX ----
df = pd.read_excel(BytesIO(xlsx_bytes), sheet_name="Extrato", header=0)
# Colunas: Data, Hora, Código de Transação, Número do Cartão,
#          Grupo, Usuário, Tipo, Descrição, Valor, Status, ...

# Agrupar por colaborador
for usuario, grupo_df in df.groupby("Usuário"):
    saldo_cartao = grupo_df[grupo_df["Hora"] == "-"]["Valor"].sum()
    tarifa = grupo_df[grupo_df["Tipo"] == "Taxa"]["Valor"].abs().sum()
    carga = grupo_df[(grupo_df["Tipo"] == "Transferência") & (grupo_df["Valor"] > 0)]["Valor"].sum()
    transferencia_saida = grupo_df[(grupo_df["Tipo"] == "Transferência") & (grupo_df["Valor"] < 0)]["Valor"].abs().sum()
    print(f"{usuario}: saldo={saldo_cartao}, tarifa={tarifa}, carga={carga}")

# ---- PASSO 3: Cruzar com PAINEL ----
df_painel = pd.read_excel("backend/planilhas/CONTROLE.xlsx", sheet_name="PAINEL", header=10)
df_aux = pd.read_excel("backend/planilhas/CONTROLE.xlsx", sheet_name="AUX", header=1)
```

---

## 10. Pontos de Atenção

1. **Renovação do laravel_token**: Expira ~30 dias. Capturar no DevTools do browser (`amp.vexpenses.com` → F12 → Application → Cookies → laravel_token). Idealmente criar um script que alerta quando está perto de expirar.

2. **Cruzamento de nomes**: O XLSX da API usa nomes às vezes abreviados (ex: "ALISSON R. RAMBO") enquanto o PAINEL usa nomes completos. Usar normalização + fuzzy matching ou cruzar por CPF quando possível.

3. **Saldo do cartão individual**: O XLSX traz uma linha por colaborador com `Hora = '-'` e `Valor = 0.0` que parece ser o saldo inicial do período, não o saldo atual. Validar se o saldo atual deve vir do endpoint `GET /v3/pay/statement/account-aggregations/{id}` via `daily_balances[0].balance`.

4. **Campos manuais**: `1ª QZ` (col J), `Adiantamento` (col L) e `obs` (col P) não têm fonte automática — a planilha deve ser gerada com essas colunas em branco para preenchimento manual posterior.

5. **Arquivo de controle muda por mês**: O arquivo `CONTROLE - VEXPENSES - MAIO - 2026.xlsx` muda todo mês. O script deve receber o caminho do arquivo de controle como parâmetro.

6. **Linha de saldo do XLSX**: Cada colaborador no XLSX baixado tem uma primeira linha com `Hora = '-'`, `Tipo = None`, `Valor = 0.0` — investigar se isso representa o saldo do cartão.
