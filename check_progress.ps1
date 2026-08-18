$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/fix-enviado-expenses" -Method GET -WebSession $session -TimeoutSec 10
Write-Output ("running={0} done={1}/{2} fixed={3} failed={4} pct={5}" -f $r.running, $r.done, $r.total, $r.fixed, $r.failed, $r.progress_pct)
