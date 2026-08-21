$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-approval-dates" -Method GET -WebSession $session

Write-Output "=== SUMMARY ==="
Write-Output "Total reports: $($r.total)"
Write-Output "Before day 11: $($r.before_day_11) (with expenses: $($r.before_11_with_expenses), zero: $($r.before_11_zero_expenses))"
Write-Output "On/after day 11: $($r.on_or_after_day_11) (with expenses: $($r.after_11_with_expenses), zero: $($r.after_11_zero_expenses))"
Write-Output "No date: $($r.no_date)"
Write-Output ""

Write-Output "=== BEFORE DAY 11 (first 30) ==="
foreach ($row in $r.before_11 | Select-Object -First 30) {
    Write-Output ("  id={0} {1} status={2} user={3} exp={4} val={5} approved={6} updated={7}" -f $row.id, $row.name, $row.status, $row.user_name, $row.expense_count, $row.total_value, $row.approved_at, $row.updated_at)
}

Write-Output ""
Write-Output "=== ON/AFTER DAY 11 (first 30) ==="
foreach ($row in $r.after_11 | Select-Object -First 30) {
    Write-Output ("  id={0} {1} status={2} user={3} exp={4} val={5} approved={6} updated={7}" -f $row.id, $row.name, $row.status, $row.user_name, $row.expense_count, $row.total_value, $row.approved_at, $row.updated_at)
}

Write-Output ""
Write-Output "=== NO DATE (first 10) ==="
foreach ($row in $r.no_date_samples | Select-Object -First 10) {
    Write-Output ("  id={0} {1} status={2} user={3} exp={4} val={5} created={6} updated={7}" -f $row.id, $row.name, $row.status, $row.user_name, $row.expense_count, $row.total_value, $row.created_at, $row.updated_at)
}
