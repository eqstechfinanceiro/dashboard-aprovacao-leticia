$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-expense-gaps" -Method GET -WebSession $session

Write-Output "=== Totals (non-FATURA, APROVADO+ENVIADO) ==="
Write-Output "  Reports: $($r.totals.report_count)"
Write-Output "  Expenses: $($r.totals.expense_count)"
Write-Output "  Total value: $($r.totals.total_value)"

Write-Output ""
Write-Output "=== Last expense download ==="
Write-Output "  Last created: $($r.last_expense.last_created)"
Write-Output "  Total rows: $($r.last_expense.total_rows)"

Write-Output ""
Write-Output "=== Pipeline status ==="
foreach ($p in $r.pipeline_status) {
    Write-Output "  $($p.step): $($p.status) started=$($p.started_at) finished=$($p.finished_at)"
}

Write-Output ""
Write-Output "=== ENVIADO reports (non-FATURA): $($r.enviado_count) ==="
foreach ($e in $r.enviado_reports) {
    if ([decimal]$e.total_value -gt 0) {
        Write-Output "  ID=$($e.id) name=$($e.name) user=$($e.user_name) cpf=$($e.user_cpf) expenses=$($e.expense_count) total=$($e.total_value)"
    }
}

Write-Output ""
Write-Output "=== Suspicious APROVADO (<5 expenses but value > 0) ==="
foreach ($e in $r.suspicious_aprovado) {
    Write-Output "  ID=$($e.id) name=$($e.name) user=$($e.user_name) cpf=$($e.user_cpf) expenses=$($e.expense_count) total=$($e.total_value)"
}
