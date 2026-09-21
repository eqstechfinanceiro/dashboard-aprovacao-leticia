$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null

for ($i = 0; $i -lt 120; $i++) {
    $r = Invoke-RestMethod -Uri "http://localhost:3000/api/fix-aprovado-zero" -Method GET -WebSession $session
    Write-Output ("[{0}] Progress: {1}/{2} ({3}) fixed={4} failed={5} elapsed={6}s eta={7}s" -f (Get-Date -Format "HH:mm:ss"), $r.done, $r.total, $r.progress_pct, $r.fixed, $r.failed, $r.elapsed_seconds, $r.eta_seconds)
    if (-not $r.running) {
        Write-Output "DONE!"
        if ($r.errors.Count -gt 0) {
            Write-Output "Errors (first 5):"
            $r.errors | Select-Object -First 5 | ForEach-Object { Write-Output "  $_" }
        }
        break
    }
    Start-Sleep -Seconds 5
}
