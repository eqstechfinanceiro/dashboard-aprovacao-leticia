# Pipeline Runner + Monitor
# Executa o pipeline via curl com timeout de 20 min e monitora progresso real no Neon via API
# Uso: powershell -ExecutionPolicy Bypass -File run-pipeline.ps1 -Quinzena "2026-06-1"

param(
    [Parameter(Mandatory=$true)]
    [string]$Quinzena
)

$token = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwiZW1haWwiOiJpdGFsby5tZWRyYWRvQGVxc2VuZ2VuaGFyaWEuY29tLmJyIiwibmFtZSI6Ikl0YWxvIE1lZHJhZG8iLCJqb2JfdGl0bGUiOiJBZG1pbmlzdHJhZG9yIiwicm9sZSI6ImFkbWluIiwibW9kdWxlcyI6W10sIm11c3RfY2hhbmdlX3Bhc3N3b3JkIjpmYWxzZSwiaWF0IjoxNzgyNzM4NTk2LCJleHAiOjE3ODMzNDMzOTZ9.qlE_2tIdygTy22zSimERZboPUrt0ohv17HRAUac4e8s"
$steps = @("download_extrato","refresh_cadastro","refresh_reports","download_expenses","snapshot_somase")
$apiUrl = "http://localhost:3000"
$timeoutSec = 1800  # 30 minutes

function New-Session {
    $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $c = New-Object System.Net.Cookie("vexp_auth_token", $token, "/", "localhost")
    $s.Cookies.Add($c)
    return $s
}

function Get-PipelineStatus {
    param([string]$Qz)
    try {
        $session = New-Session
        $r = Invoke-RestMethod -Uri "$apiUrl/api/pipeline/status?quinzena=$Qz" -WebSession $session -Method GET -TimeoutSec 10
        return $r
    } catch {
        return $null
    }
}

function Show-Status {
    param([string]$Qz, [datetime]$StartTime)
    $r = Get-PipelineStatus -Qz $Qz
    if (-not $r) {
        Write-Host "  [ERRO] Nao foi possivel consultar o status" -ForegroundColor Red
        return
    }
    
    $elapsed = (Get-Date) - $StartTime
    $elapsedStr = "{0:mm\:ss}" -f $elapsed
    
    if ($r.complete) {
        Write-Host "`n  [COMPLETO] Pipeline finalizado em $elapsedStr" -ForegroundColor Green
    }
    
    foreach ($step in $steps) {
        $s = $r.steps.$step
        if ($s) {
            $icon = switch ($s.status) { 
                "success" { "[OK]" } 
                "running" { "[>>]" } 
                "failed"  { "[XX]" } 
                default   { "[??]" } 
            }
            $color = switch ($s.status) { 
                "success" { "Green" } 
                "running" { "Cyan" } 
                "failed"  { "Red" } 
                default   { "Gray" } 
            }
            
            $detail = ""
            if ($s.started_at -and $s.finished_at) {
                $start = [DateTime]::Parse($s.started_at)
                $end = [DateTime]::Parse($s.finished_at)
                $dur = ($end - $start).TotalSeconds
                $detail = " ({0:N0}s)" -f $dur
            } elseif ($s.started_at -and $s.status -eq "running") {
                $start = [DateTime]::Parse($s.started_at)
                $runSec = ((Get-Date) - $start).TotalSeconds
                $detail = " ({0:N0}s rodando)" -f $runSec
            }
            if ($s.error) { $detail += " ERRO: $($s.error)" }
            
            Write-Host "  $icon $step$detail" -ForegroundColor $color
        } else {
            Write-Host "  [--] $step (pendente)" -ForegroundColor DarkGray
        }
    }
}

Write-Host "`n=== Pipeline Runner: QZ $Quinzena ===" -ForegroundColor Cyan
Write-Host "Inicio: $(Get-Date -Format 'HH:mm:ss')`n" -ForegroundColor Cyan

# Disparar o pipeline em background
Write-Host "Disparando POST /api/pipeline/run..." -ForegroundColor Yellow
$session = New-Session
$body = @{ quinzena = $Quinzena; trigger = "manual" } | ConvertTo-Json

$job = Start-Job -ScriptBlock {
    param($url, $token, $bodyStr)
    $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $c = New-Object System.Net.Cookie("vexp_auth_token", $token, "/", "localhost")
    $s.Cookies.Add($c)
    try {
        $r = Invoke-RestMethod -Uri "$url/api/pipeline/run" -WebSession $s -Method POST -Body $bodyStr -ContentType "application/json" -TimeoutSec 1200
        return $r | ConvertTo-Json -Depth 10
    } catch {
        return "ERROR: $($_.Exception.Message)"
    }
} -ArgumentList $apiUrl, $token, $body

$startTime = Get-Date

# Monitorar progresso
$lastStep = ""
while ($true) {
    Clear-Host
    Write-Host "=== Pipeline Runner: QZ $Quinzena ===" -ForegroundColor Cyan
    $elapsed = (Get-Date) - $startTime
    $elapsedStr = "{0:mm\:ss}" -f $elapsed
    Write-Host "Tempo decorrido: $elapsedStr (timeout: 20:00)`n" -ForegroundColor Cyan
    
    Show-Status -Qz $Quinzena -StartTime $startTime
    
    # Verificar se o job do curl terminou
    $jobState = $job.State
    Write-Host "`n  [JOB] Estado: $jobState" -ForegroundColor DarkGray
    
    if ($jobState -eq "Completed" -or $jobState -eq "Failed") {
        $jobResult = Receive-Job $job
        Write-Host "  [JOB] Resultado: $jobResult" -ForegroundColor $(if ($jobResult -like "ERROR*") { "Red" } else { "Green" })
        Remove-Job $job -Force
        
        # Mostrar status final
        Write-Host "`n--- Status Final ---" -ForegroundColor Cyan
        Start-Sleep 2
        Show-Status -Qz $Quinzena -StartTime $startTime
        break
    }
    
    # Timeout
    if ($elapsed.TotalSeconds -gt $timeoutSec) {
        Write-Host "`n  [TIMEOUT] Abortando apos $elapsedStr" -ForegroundColor Red
        Stop-Job $job -ErrorAction SilentlyContinue
        Remove-Job $job -Force -ErrorAction SilentlyContinue
        break
    }
    
    Start-Sleep 5
}

Write-Host "`nFinalizado: $(Get-Date -Format 'HH:mm:ss')`n" -ForegroundColor Cyan
