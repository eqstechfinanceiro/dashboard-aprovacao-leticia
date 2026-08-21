$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null

# Get all ENVIADO report IDs (non-FATURA)
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-expense-gaps" -Method GET -WebSession $session
$enviado = $r.enviado_reports | Where-Object { $_.report_name -notlike "FATURA*" -and $_.report_name -notlike "CARTAO*" }
$total = $enviado.Count
Write-Output "Total ENVIADO (non-FATURA) reports to fix: $total"
Write-Output ""

$fixed = 0
$failed = 0
$startTime = Get-Date

foreach ($rep in $enviado) {
    $rid = $rep.report_id
    try {
        $result = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-download-report?reportId=$rid" -Method GET -WebSession $session -TimeoutSec 30
        $before = [int]$result.before.count
        $after = [int]$result.after.count
        $newExpenses = $after - $before
        if ($newExpenses -gt 0) {
            Write-Output "  FIXED: rid=$rid name=$($rep.report_name) user=$($rep.user_name) +$newExpenses expenses (before=$before after=$after)"
            $fixed++
        }
    } catch {
        Write-Output "  FAILED: rid=$rid $($_.Exception.Message)"
        $failed++
    }

    # Progress every 10 reports
    $done = $fixed + $failed + ($enviado.Count - $enviado.IndexOf($rep) - 1)
    $processed = $fixed + $failed
    if ($processed % 10 -eq 0 -or $processed -eq $total) {
        $elapsed = (Get-Date) - $startTime
        $rate = $processed / $elapsed.TotalSeconds
        $remaining = $total - $processed
        $eta = if ($rate -gt 0) { [math]::Round($remaining / $rate) } else { 0 }
        Write-Output "  PROGRESS: $processed/$total ($([math]::Round($processed/$total*100,1))%) - fixed=$fixed failed=$failed - elapsed=$([math]::Round($elapsed.TotalSeconds))s - ETA=${eta}s"
    }
}

Write-Output ""
Write-Output "DONE: fixed=$fixed failed=$failed total=$total"
