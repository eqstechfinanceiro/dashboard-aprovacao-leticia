$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null

# Re-fetch prestacao debug
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-prestacao" -Method GET -WebSession $session
$r | ConvertTo-Json -Depth 10 | Out-File -FilePath "prestacao_debug.json" -Encoding UTF8

Write-Output "Total reports: $($r.report_count)"
Write-Output "Total expenses: $($r.total_expenses.total_expenses)"
Write-Output "Total value: $($r.total_expenses.total_value)"
Write-Output "Prestacao value: $($r.total_expenses.prestacao_value)"
Write-Output "CPF count: $($r.cpf_summary.Count)"
Write-Output "Saved to prestacao_debug.json"
