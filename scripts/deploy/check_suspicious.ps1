$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-expense-gaps" -Method GET -WebSession $session
Write-Output "Suspicious APROVADO count: $($r.suspicious_aprovado.Count)"
foreach ($s in $r.suspicious_aprovado) {
    Write-Output "  id=$($s.id) name=$($s.name) status=$($s.status) expenses=$($s.expense_count) value=$($s.total_value)"
}
