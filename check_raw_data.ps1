$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-raw-data" -Method GET -WebSession $session

Write-Output "=== RAW DATA KEYS ==="
$r.raw_data_keys | ForEach-Object { Write-Output "  $_" }

Write-Output ""
Write-Output "=== APROVADO SAMPLE ==="
$r.aprovado_samples[0].raw_data | ConvertTo-Json -Depth 5

Write-Output ""
Write-Output "=== ENVIADO SAMPLE ==="
$r.enviado_samples[0].raw_data | ConvertTo-Json -Depth 5
