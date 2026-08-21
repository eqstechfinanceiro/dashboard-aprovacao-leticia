$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-prestacao-cpf?cpf=01677920599" -Method GET -WebSession $session
Write-Output "Total reports: $($r.total_reports)"
Write-Output ""
Write-Output "Status summary:"
foreach ($s in $r.status_summary) {
    Write-Output "  $($s.status): $($s.report_count) reports, R$($s.total_expenses)"
}
Write-Output ""
Write-Output "All reports:"
foreach ($e in $r.api_expenses) {
    Write-Output "  ID=$($e.report_id) name=$($e.report_name) status=$($e.status) expenses=$($e.expense_count) total=$($e.total_value) excluded=$($e.excluded_value)"
}
