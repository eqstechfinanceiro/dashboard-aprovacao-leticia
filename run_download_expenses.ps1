$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null

# Run download_expenses step
$body2 = @{ quinzenaId = "2026-08-1"; step = "download_expenses" } | ConvertTo-Json
$resp = Invoke-RestMethod -Uri "http://localhost:3000/api/pipeline/step" -Method POST -Body $body2 -ContentType "application/json" -WebSession $session
$resp | ConvertTo-Json -Depth 5
