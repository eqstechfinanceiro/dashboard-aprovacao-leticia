$envContent = Get-Content ".env.local" -Raw
$match = [regex]::Match($envContent, 'VEXPENSES_API_KEY=(.+)')
$key = $match.Groups[1].Value.Trim()

# Check report 10912854 with page parameter
$resp1 = Invoke-RestMethod -Uri "https://api.vexpenses.com/v2/reports/10912854?include=expenses&page=1" -Headers @{Authorization=$key; Accept="application/json"}
Write-Output "Page 1 - Expense count: $($resp1.data.expenses.data.Count)"
if ($resp1.data.expenses.meta) {
    Write-Output "Meta: $($resp1.data.expenses.meta | ConvertTo-Json -Depth 3)"
}
if ($resp1.data.expenses.links) {
    Write-Output "Links: $($resp1.data.expenses.links | ConvertTo-Json -Depth 3)"
}

# Also check without page param
$resp2 = Invoke-RestMethod -Uri "https://api.vexpenses.com/v2/reports/10912854?include=expenses" -Headers @{Authorization=$key; Accept="application/json"}
Write-Output ""
Write-Output "No page - Expense count: $($resp2.data.expenses.data.Count)"

# Check total_value from report
Write-Output ""
Write-Output "Report total_value: $($resp2.data.total_value)"
Write-Output "Report status: $($resp2.data.status)"
Write-Output "Report name: $($resp2.data.name)"

# Sum all expense values
$totalSum = 0
foreach ($e in $resp2.data.expenses.data) {
    $totalSum += [decimal]$e.value
}
Write-Output "Sum of all expense values: $totalSum"
