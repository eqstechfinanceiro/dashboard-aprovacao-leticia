$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null
$body2 = @{} | ConvertTo-Json
$resp = Invoke-RestMethod -Uri "http://localhost:3000/api/fix-enviado-expenses" -Method POST -Body $body2 -ContentType "application/json" -WebSession $session
$resp | ConvertTo-Json -Depth 3
