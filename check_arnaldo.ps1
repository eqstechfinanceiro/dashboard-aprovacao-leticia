$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null

# Check ARNALDO's reports directly
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-prestacao-cpf?cpf=80873367049" -Method GET -WebSession $session
Write-Output "ARNALDO VARGAS NETO (cpf=80873367049):"
foreach ($e in $r.api_expenses) {
    Write-Output "  id=$($e.report_id) name=$($e.report_name) status=$($e.status) count=$($e.expense_count) total=$($e.total_value)"
}

# Check the specific report IDs from BASE PREST
Write-Output ""
Write-Output "Checking report 11156525 (CAIXA 05/2026):"
$r2 = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-download-report?reportId=11156525" -Method GET -WebSession $session
Write-Output "  API expenses: $($r2.apiExpenseCount) before: $($r2.before.count) after: $($r2.after.count) inserted: $($r2.inserted)"

Write-Output ""
Write-Output "Checking report 11085603 (CAIXA 04/2026):"
$r3 = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-download-report?reportId=11085603" -Method GET -WebSession $session
Write-Output "  API expenses: $($r3.apiExpenseCount) before: $($r3.before.count) after: $($r3.after.count) inserted: $($r3.inserted)"
