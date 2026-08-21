$baseUrl = "http://localhost:3000"
$delayBetweenExpenses = 2000
$delayBetweenReports = 2000

# Get all pending reports
$resp = Invoke-WebRequest -Uri "$baseUrl/api/aprovacao-dinamica/pending?include_audit=true" -UseBasicParsing
$reports = ($resp.Content | ConvertFrom-Json).data

Write-Host "Total reports: $($reports.Count)"

$stats = @{ total = 0; approved = 0; pending = 0; rejected = 0; failed = 0; skipped = 0; pdfNative = 0 }
$results = @()

for ($r = 0; $r -lt $reports.Count; $r++) {
    $report = $reports[$r]
    Write-Host ""
    Write-Host "=== Report $($r + 1)/$($reports.Count): id=$($report.id) ==="

    # Skip entire report if already fully audited
    if ($report.audited -eq $true) {
        # Double-check: get audit results and compare count with expenses
        try {
            $expResp = Invoke-WebRequest -Uri "$baseUrl/api/aprovacao-dinamica/report/$($report.id)/expenses" -UseBasicParsing -TimeoutSec 30000
            $expenses = ($expResp.Content | ConvertFrom-Json).data.expenses
            $auditResp = Invoke-WebRequest -Uri "$baseUrl/api/aprovacao-dinamica/audit-results/$($report.id)" -UseBasicParsing -TimeoutSec 30000
            $existingAudits = ($auditResp.Content | ConvertFrom-Json).data.expenses
            $auditedWithdata = @()
            if ($existingAudits) {
                $auditedWithdata = $existingAudits | Where-Object { $_.extracted_data -ne $null }
            }
            if ($auditedWithdata.Count -ge $expenses.Count) {
                Write-Host "  SKIPPED (all $($expenses.Count) expenses already audited)"
                $stats.skipped += $expenses.Count
                continue
            }
            $auditedIds = $auditedWithdata | ForEach-Object { $_.expense_id }
        } catch {
            $auditedIds = @()
            $expenses = @()
        }
    } else {
        # Get expenses for this report
        try {
            $expResp = Invoke-WebRequest -Uri "$baseUrl/api/aprovacao-dinamica/report/$($report.id)/expenses" -UseBasicParsing -TimeoutSec 30000
            $expenses = ($expResp.Content | ConvertFrom-Json).data.expenses
        } catch {
            Write-Host "  Failed to get expenses: $_"
            continue
        }

        if ($expenses.Count -eq 0) {
            Write-Host "  No expenses"
            continue
        }

        Write-Host "  Expenses: $($expenses.Count)"

        # Get existing audit results to skip already processed
        try {
            $auditResp = Invoke-WebRequest -Uri "$baseUrl/api/aprovacao-dinamica/audit-results/$($report.id)" -UseBasicParsing -TimeoutSec 30000
            $existingAudits = ($auditResp.Content | ConvertFrom-Json).data.expenses
            $auditedIds = @()
            if ($existingAudits) {
                $auditedIds = $existingAudits | Where-Object { $_.extracted_data -ne $null } | ForEach-Object { $_.expense_id }
            }
        } catch {
            $auditedIds = @()
        }
    }

    if ($expenses.Count -eq 0) {
        Write-Host "  No expenses"
        continue
    }

    $pendingCount = $expenses.Count - $auditedIds.Count
    Write-Host "  Expenses: $($expenses.Count) (pending: $pendingCount, already audited: $($auditedIds.Count))"

    for ($i = 0; $i -lt $expenses.Count; $i++) {
        $expense = $expenses[$i]

        # Skip if already has extracted_data
        if ($auditedIds -contains $expense.id) {
            Write-Host "  [$($i + 1)/$($expenses.Count)] $($expense.id) SKIPPED (already audited)"
            $stats.skipped++
            continue
        }

        $isPdf = $expense.receipt_url -match '\.pdf$|/pdfs/'
        if ($isPdf) { $stats.pdfNative++ }

        $body = @{
            report_id = $report.id
            expense = $expense
            force = $false
        } | ConvertTo-Json -Depth 5

        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        try {
            $auditResp = Invoke-WebRequest -Uri "$baseUrl/api/aprovacao-dinamica/audit-expense-gemini-direct" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 300000
            $sw.Stop()
            $audit = ($auditResp.Content | ConvertFrom-Json).data

            $valor = $audit.extracted_data.valor_total
            $estab = $audit.extracted_data.estabelecimento
            if (-not $valor) { $valor = "N/A" }
            if (-not $estab) { $estab = "N/A" }

            $pdfTag = if ($isPdf) { " [PDF-native]" } else { "" }
            Write-Host "  [$($i + 1)/$($expenses.Count)] $($expense.id) $($audit.status) ($valor) $estab$($pdfTag) ($($sw.ElapsedMilliseconds)ms)"

            $stats.total++
            switch ($audit.status) {
                "APROVADO_BOT" { $stats.approved++ }
                "PENDENTE" { $stats.pending++ }
                "REPROVADO" { $stats.rejected++ }
            }

            $results += [PSCustomObject]@{
                report_id = $report.id
                expense_id = $expense.id
                status = $audit.status
                valor = $valor
                estabelecimento = $estab
                is_pdf = $isPdf
                time_ms = $sw.ElapsedMilliseconds
                provider = "gemini-direct"
            }
        } catch {
            $sw.Stop()
            Write-Host "  [$($i + 1)/$($expenses.Count)] $($expense.id) FAILED ($($sw.ElapsedMilliseconds)ms) - $_"
            $stats.failed++
            $stats.total++
        }

        if ($i -lt $expenses.Count - 1) {
            Start-Sleep -Milliseconds $delayBetweenExpenses
        }
    }

    if ($r -lt $reports.Count - 1) {
        Start-Sleep -Milliseconds $delayBetweenReports
    }
}

# Save results to CSV
$csvPath = "audit-gemini-direct-results.csv"
if ($results.Count -gt 0) {
    $results | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8
    Write-Host ""
    Write-Host "Results saved to $csvPath"
}

Write-Host ""
Write-Host "=== Gemini Direct Summary ==="
Write-Host "Total processed: $($stats.total)"
Write-Host "Approved: $($stats.approved)"
Write-Host "Pending: $($stats.pending)"
Write-Host "Rejected: $($stats.rejected)"
Write-Host "Failed: $($stats.failed)"
Write-Host "Skipped: $($stats.skipped)"
Write-Host "PDF native: $($stats.pdfNative)"
