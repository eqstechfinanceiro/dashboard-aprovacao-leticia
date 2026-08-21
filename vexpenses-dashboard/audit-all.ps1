$baseUrl = "http://localhost:3000"
$delayBetweenExpenses = 2000
$delayBetweenReports = 2000

# Get all pending reports
$resp = Invoke-WebRequest -Uri "$baseUrl/api/aprovacao-dinamica/pending?include_audit=true" -UseBasicParsing
$reports = ($resp.Content | ConvertFrom-Json).data

Write-Host "Total reports: $($reports.Count)"

$stats = @{ total = 0; approved = 0; pending = 0; rejected = 0; failed = 0; skipped = 0; pdfConverted = 0 }
$results = @()

for ($r = 0; $r -lt $reports.Count; $r++) {
    $report = $reports[$r]
    Write-Host "`n=== Report $($r+1)/$($reports.Count): id=$($report.id) ===" -ForegroundColor Cyan

    # Get expenses for this report
    try {
        $expResp = Invoke-WebRequest -Uri "$baseUrl/api/aprovacao-dinamica/report/$($report.id)/expenses" -UseBasicParsing -TimeoutSec 30
        $expenses = ($expResp.Content | ConvertFrom-Json).data.expenses
    } catch {
        Write-Host "  Failed to get expenses: $_" -ForegroundColor Red
        continue
    }

    if (!$expenses -or $expenses.Count -eq 0) {
        Write-Host "  No expenses" -ForegroundColor Yellow
        continue
    }

    Write-Host "  Expenses: $($expenses.Count)"

    # Get existing audit results
    try {
        $auditResp = Invoke-WebRequest -Uri "$baseUrl/api/aprovacao-dinamica/audit-results/$($report.id)" -UseBasicParsing -TimeoutSec 30
        $existingAudits = ($auditResp.Content | ConvertFrom-Json).data
    } catch {
        $existingAudits = @()
    }

    for ($e = 0; $e -lt $expenses.Count; $e++) {
        $expense = $expenses[$e]
        $stats.total++

        # Check if already audited with extracted_data
        $existing = $existingAudits | Where-Object { $_.expense_id -eq $expense.id -and $_.extracted_data }
        if ($existing -and $existing.Count -gt 0) {
            $stats.skipped++
            Write-Host "  [$($e+1)/$($expenses.Count)] Expense $($expense.id) - already audited, skipping" -ForegroundColor DarkGray
            continue
        }

        # Check if PDF
        $isPdf = $expense.receipt_url -match '\.pdf$|/pdfs/'
        if ($isPdf) { $stats.pdfConverted++ }

        # Delay between expenses
        if ($e -gt 0) { Start-Sleep -Milliseconds $delayBetweenExpenses }

        $body = @{
            report_id = $report.id
            force = $true
            expense = $expense
        } | ConvertTo-Json -Depth 5

        try {
            $sw = [System.Diagnostics.Stopwatch]::StartNew()
            $auditResp = Invoke-WebRequest -Uri "$baseUrl/api/aprovacao-dinamica/audit-expense" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 300
            $sw.Stop()
            $result = ($auditResp.Content | ConvertFrom-Json).data

            $status = $result.status
            $hasData = $null -ne $result.extracted_data
            $valor = if ($result.extracted_data) { $result.extracted_data.valor_total } else { "N/A" }
            $estab = if ($result.extracted_data) { $result.extracted_data.estabelecimento } else { "N/A" }

            switch ($status) {
                'APROVADO_BOT' { $stats.approved++; Write-Host "  [$($e+1)/$($expenses.Count)] $($expense.id) APPROVED (${valor}) ${estab} ($($sw.ElapsedMilliseconds)ms)" -ForegroundColor Green }
                'PENDENTE' { $stats.pending++; Write-Host "  [$($e+1)/$($expenses.Count)] $($expense.id) PENDING (${valor}) ${estab} ($($sw.ElapsedMilliseconds)ms)" -ForegroundColor Yellow }
                'REPROVADO' { $stats.rejected++; Write-Host "  [$($e+1)/$($expenses.Count)] $($expense.id) REJECTED (${valor}) ${estab} ($($sw.ElapsedMilliseconds)ms)" -ForegroundColor Red }
                default { $stats.failed++; Write-Host "  [$($e+1)/$($expenses.Count)] $($expense.id) status=$status ($($sw.ElapsedMilliseconds)ms)" -ForegroundColor Magenta }
            }

            $results += [PSCustomObject]@{
                report = $report.id
                expense = $expense.id
                status = $status
                valor = $valor
                estab = $estab
                title = $expense.title
                informedValue = $expense.value
                isPdf = $isPdf
                timeMs = $sw.ElapsedMilliseconds
            }
        } catch {
            $stats.failed++
            Write-Host "  [$($e+1)/$($expenses.Count)] $($expense.id) FAILED: $_" -ForegroundColor Red
        }
    }

    if ($r -lt $reports.Count - 1) { Start-Sleep -Milliseconds $delayBetweenReports }
}

Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "Total expenses processed: $($stats.total)"
Write-Host "Approved: $($stats.approved)" -ForegroundColor Green
Write-Host "Pending: $($stats.pending)" -ForegroundColor Yellow
Write-Host "Rejected: $($stats.rejected)" -ForegroundColor Red
Write-Host "Failed/Skipped: $($stats.failed)/$($stats.skipped)" -ForegroundColor Magenta
Write-Host "PDFs converted: $($stats.pdfConverted)"

# Save results to CSV
$results | Export-Csv -Path "audit-results.csv" -NoTypeInformation
Write-Host "`nResults saved to audit-results.csv"
