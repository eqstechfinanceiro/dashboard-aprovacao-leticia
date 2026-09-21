$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-prestacao" -Method GET -WebSession $session
$r | ConvertTo-Json -Depth 10 | Out-File -FilePath "prestacao_debug.json" -Encoding UTF8
Write-Output "Total counts:"
$r.total_counts | ConvertTo-Json
Write-Output "---"
Write-Output "Total expenses:"
$r.total_expenses | ConvertTo-Json
Write-Output "---"
Write-Output "CPF count: $($r.cpf_summary.Count)"
Write-Output "Report count: $($r.report_count)"
Write-Output "Fatura reports: $($r.fatura_reports.Count)"
