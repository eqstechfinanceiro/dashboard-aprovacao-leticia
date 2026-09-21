$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-expense-gaps" -Method GET -WebSession $session
$r | ConvertTo-Json -Depth 5 | Out-File -FilePath "expense_gaps.json" -Encoding UTF8
Write-Output "Reports: $($r.totals.report_count)"
Write-Output "Expenses: $($r.totals.expense_count)"
Write-Output "Total value: $($r.totals.total_value)"
Write-Output "Total rows in prestacao_expenses: $($r.last_expense.total_rows)"
Write-Output "Max expense id: $($r.last_expense.max_id)"
Write-Output "Enviado report count: $($r.enviado_count)"
