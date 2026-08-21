$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null

# Try downloading report 11128415 directly
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-download-report?reportId=11128415" -Method GET -WebSession $session
Write-Output "Report 11128415 (RAMON):"
Write-Output "  API expenses: $($r.apiExpenseCount)"
Write-Output "  Before: $($r.before.count) / $($r.before.total)"
Write-Output "  After: $($r.after.count) / $($r.after.total)"
Write-Output "  Inserted: $($r.inserted)"
Write-Output "  Errors: $($r.errors.Count)"
if ($r.errors.Count -gt 0) { $r.errors | ForEach-Object { Write-Output "    $_" } }

# Also try 10944416
Write-Output ""
$r2 = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-download-report?reportId=10944416" -Method GET -WebSession $session
Write-Output "Report 10944416 (CARLOS EDUARDO):"
Write-Output "  API expenses: $($r2.apiExpenseCount)"
Write-Output "  Before: $($r2.before.count) / $($r2.before.total)"
Write-Output "  After: $($r2.after.count) / $($r2.after.total)"
Write-Output "  Inserted: $($r2.inserted)"
Write-Output "  Errors: $($r2.errors.Count)"
if ($r2.errors.Count -gt 0) { $r2.errors | ForEach-Object { Write-Output "    $_" } }

# Also try 10869132
Write-Output ""
$r3 = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-download-report?reportId=10869132" -Method GET -WebSession $session
Write-Output "Report 10869132 (LUCIANO):"
Write-Output "  API expenses: $($r3.apiExpenseCount)"
Write-Output "  Before: $($r3.before.count) / $($r3.before.total)"
Write-Output "  After: $($r3.after.count) / $($r3.after.total)"
Write-Output "  Inserted: $($r3.inserted)"
Write-Output "  Errors: $($r3.errors.Count)"
if ($r3.errors.Count -gt 0) { $r3.errors | ForEach-Object { Write-Output "    $_" } }
