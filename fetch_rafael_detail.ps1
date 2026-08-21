$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null

# Check report 10912854 (CAIXA 07/2026) - API says 55 expenses, BASE PREST says 187
$cpf = "01677920599"

# Get all CAIXA reports for RAFAEL with expense counts
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-prestacao-cpf?cpf=$cpf" -Method GET -WebSession $session

Write-Output "=== CAIXA reports only (comparing API vs BASE PREST) ==="
foreach ($e in $r.api_expenses) {
    if ($e.report_name -like "CAIXA*") {
        Write-Output "  ID=$($e.report_id) name=$($e.report_name) status=$($e.status) api_expenses=$($e.expense_count) api_total=$($e.total_value) excluded=$($e.excluded_value)"
    }
}

Write-Output ""
Write-Output "=== FATURA reports (filtered by name or payment_method) ==="
$fatura_total = 0
foreach ($e in $r.api_expenses) {
    if ($e.report_name -like "FATURA*") {
        Write-Output "  ID=$($e.report_id) name=$($e.report_name) status=$($e.status) api_expenses=$($e.expense_count) api_total=$($e.total_value) excluded=$($e.excluded_value)"
        $fatura_total += [decimal]$e.excluded_value
    }
}
Write-Output "  Total FATURA excluded: $fatura_total"
