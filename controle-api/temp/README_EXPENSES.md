# Como usar os checks de expenses via arquivo JSON

## Problema

A API VExpenses (`/v2/expenses`) está instável e retorna erro 500/memory exhausted ao fazer requisições diretas.

## Solução

Baixar os dados de expenses via curl e salvar em um arquivo JSON, que é lido localmente pelos checks.

## Passo 1: Baixar expenses via PowerShell

Execute o script para baixar os expenses do período desejado:

```powershell
powershell -ExecutionPolicy Bypass -File download_expenses.ps1
```

Este script:
- Baixa expenses da API VExpenses via curl
- Salva em `data/expenses.json`
- O período padrão é fevereiro de 2026 (pode ser editado no script)

## Passo 2: Editar o período (se necessário)

Abra `download_expenses.ps1` e altere a data na linha 15-18:

```powershell
Write-Host "Periodo: 2026-02-01 a 2026-02-28 (fevereiro)"

$url = "$BASE_URL/v2/expenses?search=date:2026-02-01,2026-02-28&searchFields=date:between&paginate=true&page=1&per_page=200&include=user,costs_center,payment_method,expense_type,report,apportionment"
```

Altere as datas para o período da sua planilha.

## Passo 3: Executar os checks

```bash
python test_detalhes1.py
```

Os checks irão:
- Carregar os expenses do arquivo `data/expenses.json` (rápido, sem requisições à API)
- Comparar com os dados do SQLite
- Mostrar o resultado de cada coluna

## Como funciona

1. `download_expenses.ps1` usa curl para baixar expenses da API
2. `api_client.py` tem a função `load_expenses_from_file()` que lê o JSON
3. `get_or_load_period_expenses()` foi modificado para usar o arquivo em vez da API
4. Todos os checks de expenses usam essa função, carregando os dados uma única vez

## Vantagens

- ✅ Evita erro 500/memory exhausted da API
- ✅ Muito mais rápido (leitura local vs requisição HTTP)
- ✅ Pode ser executado offline após o download
- ✅ Cache em memória para múltiplos checks

## Limitações

- O arquivo JSON precisa ser atualizado manualmente quando houver novos expenses
- O período deve corresponder ao período da planilha sendo verificada
