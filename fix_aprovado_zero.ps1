$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null

# Get APROVADO reports with 0 expenses (non-FATURA)
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-expense-gaps" -Method GET -WebSession $session
$aprovado = $r.suspicious_aprovado | Where-Object { [int]$_.expense_count -eq 0 }
$total = $aprovado.Count
Write-Output "Total APROVADO (non-FATURA) reports with 0 expenses: $total"
Write-Output ""

$fixed = 0
$failed = 0
$startTime = Get-Date

$idx = 0
foreach ($rep in $aprovado) {
    $rid = $rep.id
    $idx++
    try {
        $result = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-download-report?reportId=$rid" -Method GET -WebSession $session -TimeoutSec 30
        $before = [int]$result.before.count
        $after = [int]$result.after.count
        $newExpenses = $after - $before
        if ($newExpenses -gt 0) {
            Write-Output "  FIXED: rid=$rid name=$($rep.name) user=$($rep.user_name) +$newExpenses expenses (before=$before after=$after)"
            $fixed++
        }
    } catch {
        Write-Output "  FAILED: rid=$rid $($_.Exception.Message)"
        $failed++
    }

    if ($idx % 10 -eq 0 -or $idx -eq $total) {
        $elapsed = (Get-Date) - $startTime
        $rate = $idx / $elapsed.TotalSeconds
        $remaining = $total - $idx
        $eta = if ($rate -gt 0) { [math]::Round($remaining / $rate) } else { 0 }
        Write-Output "  PROGRESS: $idx/$total ($([math]::Round($idx/$total*100,1))%) - fixed=$fixed failed=$failed - elapsed=$([math]::Round($elapsed.TotalSeconds))s - ETA=${eta}s"
    }
}

Write-Output ""
Write-Output "DONE: fixed=$fixed failed=$failed total=$total"
