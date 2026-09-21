$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null

# First check progress before
$before = Invoke-RestMethod -Uri "http://localhost:3000/api/download-progress" -Method GET -WebSession $session
Write-Output "BEFORE: expenses=$($before.current_expenses.total) prestacao=$($before.prestacao_total.total_value) diff=$($before.diff)"

# Run smart download (only ENVIADO + 0-expense reports)
$body2 = @{ mode = "smart"; concurrency = 10 } | ConvertTo-Json
$resp = Invoke-RestMethod -Uri "http://localhost:3000/api/smart-download-expenses" -Method POST -Body $body2 -ContentType "application/json" -WebSession $session
Write-Output ""
Write-Output "RESULT:"
Write-Output "  Reports processed: $($resp.reports_processed)"
Write-Output "  Total expenses downloaded: $($resp.total_expenses)"
Write-Output "  Errors: $($resp.error_count)"
Write-Output "  Elapsed: $($resp.elapsed_seconds)s"
if ($resp.errors.Count -gt 0) {
    Write-Output "  Error samples:"
    foreach ($e in ($resp.errors | Select-Object -First 5)) { Write-Output "    $e" }
}

# Check progress after
$after = Invoke-RestMethod -Uri "http://localhost:3000/api/download-progress" -Method GET -WebSession $session
Write-Output ""
Write-Output "AFTER: expenses=$($after.current_expenses.total) prestacao=$($after.prestacao_total.total_value) diff=$($after.diff)"
Write-Output "Progress: $($after.progress_pct)"
