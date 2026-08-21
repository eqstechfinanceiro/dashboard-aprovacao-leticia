$envContent = Get-Content ".env.local" -Raw
$match = [regex]::Match($envContent, 'VEXPENSES_API_KEY=(.+)')
$key = $match.Groups[1].Value.Trim()

# Check RAMON's report 11128415
$resp = Invoke-RestMethod -Uri "https://api.vexpenses.com/v2/reports/11128415?include=expenses" -Headers @{Authorization=$key; Accept="application/json"}
Write-Output "Report 11128415 (RAMON CAIXA 07/2026):"
Write-Output "  Status: $($resp.data.status)"
Write-Output "  Name: $($resp.data.name)"
Write-Output "  Expense count: $($resp.data.expenses.data.Count)"
if ($resp.data.expenses.data.Count -gt 0) {
    $sum = 0
    foreach ($e in $resp.data.expenses.data) { $sum += [decimal]$e.value }
    Write-Output "  Sum: $sum"
    Write-Output "  First: id=$($resp.data.expenses.data[0].id) value=$($resp.data.expenses.data[0].value)"
}

# Also check CARLOS EDUARDO's report 10944416
Write-Output ""
$resp2 = Invoke-RestMethod -Uri "https://api.vexpenses.com/v2/reports/10944416?include=expenses" -Headers @{Authorization=$key; Accept="application/json"}
Write-Output "Report 10944416 (CARLOS EDUARDO CAIXA 07/2026):"
Write-Output "  Status: $($resp2.data.status)"
Write-Output "  Name: $($resp2.data.name)"
Write-Output "  Expense count: $($resp2.data.expenses.data.Count)"
if ($resp2.data.expenses.data.Count -gt 0) {
    $sum2 = 0
    foreach ($e in $resp2.data.expenses.data) { $sum2 += [decimal]$e.value }
    Write-Output "  Sum: $sum2"
}

# Check LUCIANO's report 10869132
Write-Output ""
$resp3 = Invoke-RestMethod -Uri "https://api.vexpenses.com/v2/reports/10869132?include=expenses" -Headers @{Authorization=$key; Accept="application/json"}
Write-Output "Report 10869132 (LUCIANO CAIXA 07/2026):"
Write-Output "  Status: $($resp3.data.status)"
Write-Output "  Name: $($resp3.data.name)"
Write-Output "  Expense count: $($resp3.data.expenses.data.Count)"
if ($resp3.data.expenses.data.Count -gt 0) {
    $sum3 = 0
    foreach ($e in $resp3.data.expenses.data) { $sum3 += [decimal]$e.value }
    Write-Output "  Sum: $sum3"
}
