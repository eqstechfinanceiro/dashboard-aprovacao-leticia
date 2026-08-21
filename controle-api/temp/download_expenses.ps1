# Script para baixar expenses da API VExpenses via curl
# Salva os dados em data/expenses.json para uso nos checks
# Faz paginação automática para baixar todos os dados

param(
    [Parameter(Mandatory=$true)]
    [string]$StartDate,
    
    [Parameter(Mandatory=$true)]
    [string]$EndDate,
    
    [Parameter(Mandatory=$false)]
    [int]$MaxPages = 99999
)

$API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
$BASE_URL = "https://api.vexpenses.com"
$OUTPUT_DIR = "data"
$OUTPUT_FILE = "$OUTPUT_DIR\expenses.json"

# Criar diretório se não existir
if (-not (Test-Path $OUTPUT_DIR)) {
    New-Item -ItemType Directory -Path $OUTPUT_DIR -Force
}

Write-Host "Baixando expenses da API VExpenses..."
Write-Host "Periodo: $StartDate a $EndDate"

# Baixar todas as páginas
$page = 1
$per_page = 200
$all_expenses = @()

do {
    Write-Host "Baixando pagina $page..."
    $url = "$BASE_URL/v2/expenses?search=date:$StartDate,$EndDate&searchFields=date:between&paginate=true&page=$page&per_page=$per_page&include=user,costs_center,payment_method,expense_type,report,apportionment"
    
    try {
        $response = curl.exe -s -H "Authorization: $API_KEY" -H "Accept: application/json" $url
        $json = $response | ConvertFrom-Json
        
        if ($json.data -and $json.data.Count -gt 0) {
            # Extrair dados de dentro da chave 'data' dos includes
            foreach ($expense in $json.data) {
                if ($expense.user -and $expense.user.data) {
                    $expense.user = $expense.user.data
                }
                if ($expense.costs_center -and $expense.costs_center.data) {
                    $expense.costs_center = $expense.costs_center.data
                }
                if ($expense.payment_method -and $expense.payment_method.data) {
                    $expense.payment_method = $expense.payment_method.data
                }
                if ($expense.expense_type -and $expense.expense_type.data) {
                    $expense.expense_type = $expense.expense_type.data
                }
                if ($expense.report -and $expense.report.data) {
                    $expense.report = $expense.report.data
                }
            }
            $all_expenses += $json.data
            Write-Host "  Pagina ${page}: $($json.data.Count) expenses"
            $page++
            
            # Parar se atingir o limite de páginas
            if ($page -gt $MaxPages) {
                Write-Host "Limite de ${MaxPages} páginas atingido"
                break
            }
        } else {
            Write-Host "  Pagina ${page}: sem dados, parando"
            break
        }
    } catch {
        Write-Host "Erro ao baixar pagina ${page}: $_"
        break
    }
} while ($true)

# Salvar todos os expenses
Write-Host "Salvando $($all_expenses.Count) expenses no arquivo..."
$output = @{
    data = $all_expenses
} | ConvertTo-Json -Depth 10

$output | Out-File -FilePath $OUTPUT_FILE -Encoding utf8

# Verificar se o arquivo foi criado
if (Test-Path $OUTPUT_FILE) {
    $fileSize = (Get-Item $OUTPUT_FILE).Length
    Write-Host "Expenses salvos em $OUTPUT_FILE ($fileSize bytes)"
    Write-Host "Total de expenses: $($all_expenses.Count)"
} else {
    Write-Host "Erro: arquivo não foi criado"
}

Write-Host "Concluido!"
