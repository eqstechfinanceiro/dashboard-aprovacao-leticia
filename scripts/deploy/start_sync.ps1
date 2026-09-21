$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null

Write-Output "Starting sync..."
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/sync-expenses" -Method POST -Body (@{} | ConvertTo-Json) -ContentType "application/json" -WebSession $session
Write-Output "Total reports to sync: $($r.totalReports)"

# Poll progress
while ($true) {
    Start-Sleep -Seconds 5
    $p = Invoke-RestMethod -Uri "http://localhost:3000/api/sync-expenses" -Method GET -WebSession $session

    $pct = $p.progress_pct
    $elapsed = $p.elapsed_seconds
    $eta = $p.eta_seconds
    $elapsedStr = "{0:mm\:ss}" -f ([TimeSpan]::FromSeconds($elapsed))
    $etaStr = "{0:mm\:ss}" -f ([TimeSpan]::FromSeconds([math]::Max($eta, 0)))

    $barLen = 30
    $filled = [math]::Round($pct / 100 * $barLen)
    $bar = ("#" * $filled) + ("-" * ($barLen - $filled))

    Write-Output ("`r[$bar] $pct% | $($p.processed)/$($p.total) | sync=$($p.synced) del=$($p.deleted_expenses) ins=$($p.inserted_expenses) upd=$($p.updated_expenses) same=$($p.unchanged) err=$($p.errors) | ${elapsedStr} / ETA ${etaStr}          ") -NoNewline

    if ($p.status -ne "running") {
        Write-Output ""
        Write-Output ""
        Write-Output "=== SYNC COMPLETE ==="
        Write-Output "Status: $($p.status)"
        Write-Output "Processed: $($p.processed)/$($p.total)"
        Write-Output "Synced (had changes): $($p.synced)"
        Write-Output "  Deleted expenses: $($p.deleted_expenses)"
        Write-Output "  Inserted expenses: $($p.inserted_expenses)"
        Write-Output "  Updated expenses: $($p.updated_expenses)"
        Write-Output "Unchanged: $($p.unchanged)"
        Write-Output "Errors: $($p.errors)"

        if ($p.recentChanges.Count -gt 0) {
            Write-Output ""
            Write-Output "=== RECENT CHANGES (last $($p.recentChanges.Count)) ==="
            foreach ($c in $p.recentChanges) {
                Write-Output ("  Report {0} {1}: {2} (value diff: {3:+0.00;-0.00})" -f $c.report_id, $c.report_name, $c.action, $c.value)
            }
        }

        if ($p.errorList.Count -gt 0) {
            Write-Output ""
            Write-Output "=== ERRORS (first 20) ==="
            $p.errorList | Select-Object -First 20 | ForEach-Object { Write-Output "  $_" }
        }
        break
    }
}
