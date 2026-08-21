$envContent = Get-Content ".env.local" -Raw
$match = [regex]::Match($envContent, 'VEXPENSES_API_KEY=(.+)')
$key = $match.Groups[1].Value.Trim()

# Call the API for report 10912854 and check expense details
$resp = Invoke-RestMethod -Uri "https://api.vexpenses.com/v2/reports/10912854?include=expenses" -Headers @{Authorization=$key; Accept="application/json"}

Write-Output "Total expenses from API: $($resp.data.expenses.data.Count)"

# Check if any expenses have null/missing ids or values
$badCount = 0
foreach ($e in $resp.data.expenses.data) {
    if (-not $e.id -or $null -eq $e.value) {
        Write-Output "  BAD: id=$($e.id) value=$($e.value) title=$($e.title)"
        $badCount++
    }
}
Write-Output "Bad expenses: $badCount"

# Check last 5 expenses (the ones we're missing)
Write-Output ""
Write-Output "Last 5 expenses:"
$resp.data.expenses.data | Select-Object -Last 5 | ForEach-Object {
    Write-Output "  id=$($_.id) value=$($_.value) date=$($_.date) title=$($_.title) status=$($_.status)"
}

# Check if any expense has a very large id
Write-Output ""
Write-Output "Max expense id: $(($resp.data.expenses.data | Measure-Object -Property id -Maximum).Maximum)"
Write-Output "Min expense id: $(($resp.data.expenses.data | Measure-Object -Property id -Minimum).Minimum)"

# Check what's in our DB for this report
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null

# Use the debug endpoint to get all expenses for this CPF
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-prestacao-cpf?cpf=01677920599" -Method GET -WebSession $session

# Find report 10912854
foreach ($e in $r.api_expenses) {
    if ($e.report_id -eq 10912854) {
        Write-Output ""
        Write-Output "DB has: $($e.expense_count) expenses, total=$($e.total_value)"
        break
    }
}
