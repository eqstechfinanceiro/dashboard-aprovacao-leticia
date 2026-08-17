$envContent = Get-Content ".env.local" -Raw
$match = [regex]::Match($envContent, 'VEXPENSES_API_KEY=(.+)')
$key = $match.Groups[1].Value.Trim()

# Check report 10912854 (CAIXA 07/2026 - RAFAEL)
$resp = Invoke-RestMethod -Uri "https://api.vexpenses.com/v2/reports/10912854?include=expenses" -Headers @{Authorization=$key; Accept="application/json"}

Write-Output "Expense count: $($resp.data.expenses.data.Count)"
Write-Output ""
Write-Output "Meta:"
$resp.data.expenses.meta | ConvertTo-Json -Depth 3
Write-Output ""
Write-Output "Links:"
$resp.data.expenses.links | ConvertTo-Json -Depth 3
Write-Output ""
Write-Output "First 3 expenses:"
$resp.data.expenses.data | Select-Object -First 3 | ForEach-Object { Write-Output "  id=$($_.id) value=$($_.value) title=$($_.title)" }
