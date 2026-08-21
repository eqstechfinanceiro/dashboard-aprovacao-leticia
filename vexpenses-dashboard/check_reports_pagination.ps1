$envContent = Get-Content ".env.local" -Raw
$match = [regex]::Match($envContent, 'VEXPENSES_API_KEY=(.+)')
$key = $match.Groups[1].Value.Trim()

# Check reports list pagination
$resp = Invoke-RestMethod -Uri "https://api.vexpenses.com/v2/reports?include=user" -Headers @{Authorization=$key; Accept="application/json"}

Write-Output "Report count: $($resp.data.Count)"
Write-Output ""
Write-Output "Meta:"
$resp.meta | ConvertTo-Json -Depth 3
Write-Output ""
Write-Output "Links:"
$resp.links | ConvertTo-Json -Depth 3
