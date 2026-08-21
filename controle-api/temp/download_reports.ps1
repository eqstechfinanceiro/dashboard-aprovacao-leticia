# Script para baixar reports da API VExpenses via curl
# Salva os dados em data/reports.json para uso nos checks

$API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
$BASE_URL = "https://api.vexpenses.com"
$OUTPUT_DIR = "data"
$OUTPUT_FILE = "$OUTPUT_DIR\reports.json"

# Criar diretório se não existir
if (-not (Test-Path $OUTPUT_DIR)) {
    New-Item -ItemType Directory -Path $OUTPUT_DIR -Force
}

Write-Host "Baixando reports da API VExpenses..."

# Baixar todos os reports (sem filtro de período)
$url = "$BASE_URL/v2/reports?include=user,expenses&paginate=true&page=1&per_page=200"

try {
    $response = curl.exe -s -H "Authorization: $API_KEY" -H "Accept: application/json" $url
    $response | Out-File -FilePath $OUTPUT_FILE -Encoding utf8
    
    # Verificar se o arquivo foi criado e tem conteudo
    if (Test-Path $OUTPUT_FILE) {
        $fileSize = (Get-Item $OUTPUT_FILE).Length
        Write-Host "Reports salvos em $OUTPUT_FILE ($fileSize bytes)"
        
        # Contar reports no arquivo
        $json = Get-Content $OUTPUT_FILE -Raw | ConvertFrom-Json
        if ($json.data) {
            Write-Host "Total de reports: $($json.data.Count)"
        }
    } else {
        Write-Host "Erro: arquivo nao foi criado"
    }
} catch {
    Write-Host "Erro ao baixar reports: $_"
    exit 1
}

Write-Host "Concluido!"
