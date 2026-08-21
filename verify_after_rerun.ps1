$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null

# Check RAFAEL again
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-prestacao-cpf?cpf=01677920599" -Method GET -WebSession $session

Write-Output "=== RAFAEL AMORIM VELLO - After download_expenses re-run ==="
foreach ($e in $r.api_expenses) {
    if ($e.report_name -like "CAIXA*") {
        Write-Output "  ID=$($e.report_id) name=$($e.report_name) status=$($e.status) expenses=$($e.expense_count) total=$($e.total_value)"
    }
}

# Check total prestacao now
$r2 = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-prestacao" -Method GET -WebSession $session
Write-Output ""
Write-Output "=== Total prestacao (debug, after re-run) ==="
$r2.total_expenses | ConvertTo-Json
