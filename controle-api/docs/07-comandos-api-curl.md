# Comandos API - Curl para Cada Aba

Este documento contém os comandos curl para requisitar todos os dados de cada aba da planilha de controle via API VExpenses.

## Configuração

**API Key:** `N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8`
**Base URL:** `https://api.vexpenses.com`

---

## Aba Detalhes1 / Detalhes2

### Endpoint: `/v2/expenses`

Baixa todas as despesas com includes completos.

```bash
curl.exe -s -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  -H "Accept: application/json" \
  "https://api.vexpenses.com/v2/expenses?search=date:2026-02-01,2026-02-28&searchFields=date:between&paginate=true&page=1&per_page=200&include=user,costs_center,payment_method,expense_type,report,apportionment" \
  -o data/expenses.json
```

**Parâmetros:**
- `search=date:2026-02-01,2026-02-28` - Filtro por período (altere conforme necessário)
- `searchFields=date:between` - Busca entre datas
- `include=user,costs_center,payment_method,expense_type,report,apportionment` - Includes aninhados
- `paginate=true&page=1&per_page=200` - Paginação

**Campos retornados:**
- `id`, `date`, `value`, `title`, `status`, `reimbursable`, `observation`
- `user.name`, `user.cpf`, `user.bank`, `user.agency`, `user.account`, `user.pix_key`
- `expense_type.description`
- `report.status`, `report.description`
- `costs_center.description`
- `payment_method.description`
- `apportionment.description`, `apportionment.percentage`

**Nota:** Para evitar erro 500/memory exhausted, use filtro de data. Não tente baixar todos os expenses sem filtro.

---

## Aba Reembolso

### Endpoint: `/v2/reports`

Baixa todos os relatórios com dados de usuário e expenses.

```bash
curl.exe -s -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  -H "Accept: application/json" \
  "https://api.vexpenses.com/v2/reports?include=user,expenses&paginate=true&page=1&per_page=200" \
  -o data/reports.json
```

**Parâmetros:**
- `include=user,expenses` - Inclui dados do usuário e lista de expenses
- `paginate=true&page=1&per_page=200` - Paginação

**Campos retornados:**
- `id`, `description`, `status`, `payment_date`, `observation`, `justification`
- `created_at`, `updated_at`
- `pdf_link`, `excel_link`
- `user.name`, `user.cpf`, `user.email`
- `expenses` - Lista de expenses do report (quando incluído)

**Filtros adicionais:**

Por período:
```bash
"https://api.vexpenses.com/v2/reports?search=created_at:2025-07-01,2025-07-31&searchFields=created_at:between&include=user,expenses&paginate=true&page=1&per_page=200"
```

Por usuário:
```bash
"https://api.vexpenses.com/v2/reports?search=user_id:895944&searchFields=user_id:=&include=user,expenses&paginate=true&page=1&per_page=200"
```

Por status:
```bash
"https://api.vexpenses.com/v2/reports?search=status:APROVADO&searchFields=status:=&include=user,expenses&paginate=true&page=1&per_page=200"
```

**Nota:** O endpoint `/v2/reports` com `include=expenses` pode retornar muitos dados. Use filtros para limitar o resultado.

---

## Aba Carga 1QZ

### Endpoint: `/v2/expenses`

Similar ao Detalhes1, mas com filtro específico para o período da Carga 1QZ.

```bash
curl.exe -s -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  -H "Accept: application/json" \
  "https://api.vexpenses.com/v2/expenses?search=date:2026-05-01,2026-05-15&searchFields=date:between&paginate=true&page=1&per_page=200&include=user,costs_center,payment_method,expense_type,report,apportionment" \
  -o data/expenses_carga_1qz.json
```

---

## Scripts PowerShell Automatizados

### Baixar Expenses (Detalhes1/Detalhes2)

Salve como `download_expenses.ps1`:

```powershell
$API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
$BASE_URL = "https://api.vexpenses.com"
$OUTPUT_FILE = "data/expenses.json"

# Altere o período conforme necessário
$START_DATE = "2026-02-01"
$END_DATE = "2026-02-28"

$url = "$BASE_URL/v2/expenses?search=date:$START_DATE,$END_DATE&searchFields=date:between&paginate=true&page=1&per_page=200&include=user,costs_center,payment_method,expense_type,report,apportionment"

Write-Host "Baixando expenses de $START_DATE a $END_DATE..."
curl.exe -s -H "Authorization: $API_KEY" -H "Accept: application/json" $url -o $OUTPUT_FILE

$json = Get-Content $OUTPUT_FILE -Raw | ConvertFrom-Json
Write-Host "Total de expenses: $($json.data.Count)"
Write-Host "Salvo em: $OUTPUT_FILE"
```

### Baixar Reports (Reembolso)

Salve como `download_reports.ps1`:

```powershell
$API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
$BASE_URL = "https://api.vexpenses.com"
$OUTPUT_FILE = "data/reports.json"

# Baixar todos os reports (sem filtro de período)
$url = "$BASE_URL/v2/reports?include=user,expenses&paginate=true&page=1&per_page=200"

Write-Host "Baixando reports..."
curl.exe -s -H "Authorization: $API_KEY" -H "Accept: application/json" $url -o $OUTPUT_FILE

$json = Get-Content $OUTPUT_FILE -Raw | ConvertFrom-Json
Write-Host "Total de reports: $($json.data.Count)"
Write-Host "Salvo em: $OUTPUT_FILE"
```

---

## Uso com Python

### Usando requests

```python
import requests
import json

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"

headers = {
    "Authorization": API_KEY,
    "Accept": "application/json"
}

# Baixar expenses
response = requests.get(
    f"{BASE_URL}/v2/expenses",
    params={
        "search": "date:2026-02-01,2026-02-28",
        "searchFields": "date:between",
        "include": "user,costs_center,payment_method,expense_type,report,apportionment",
        "paginate": "true",
        "page": "1",
        "per_page": "200"
    },
    headers=headers
)

data = response.json()
print(f"Total de expenses: {len(data['data'])}")

# Salvar em arquivo
with open("data/expenses.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
```

---

## Limitações e Workarounds

### Endpoint `/v2/expenses` por ID
- **Problema:** Retorna 502 Bad Gateway ou 500 Internal Server Error
- **Workaround:** Buscar por data ou usuário em vez de ID específico

### Endpoint `/v2/reports` com include=expenses
- **Problema:** Pode retornar muitos dados (arquivo grande)
- **Workaround:** Usar filtros de período, usuário ou status

### Baixar todos os expenses sem filtro
- **Problema:** Retorna erro 500 memory exhausted
- **Workaround:** Sempre usar filtro de data (mês ou quinzena)

---

## Resumo

| Aba | Endpoint | Arquivo de Saída | Script |
|-----|----------|-----------------|--------|
| Detalhes1 | `/v2/expenses` | `data/expenses.json` | `download_expenses.ps1` |
| Detalhes2 | `/v2/expenses` | `data/expenses.json` | `download_expenses.ps1` |
| Reembolso | `/v2/reports` | `data/reports.json` | `download_reports.ps1` |
| Carga 1QZ | `/v2/expenses` | `data/expenses_carga_1qz.json` | Alterar período no script |
