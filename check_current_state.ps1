$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null

# Check current total expenses
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-prestacao" -Method GET -WebSession $session
Write-Output "Total expenses: $($r.total_expenses.total_expenses)"
Write-Output "Total value: $($r.total_expenses.total_value)"
Write-Output "Prestacao value: $($r.total_expenses.prestacao_value)"
Write-Output ""
Write-Output "CPF count: $($r.cpf_summary.Count)"
Write-Output "Report count: $($r.report_count)"
