$token = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwiZW1haWwiOiJpdGFsby5tZWRyYWRvQGVxc2VuZ2VuaGFyaWEuY29tLmJyIiwibmFtZSI6Ikl0YWxvIE1lZHJhZG8iLCJqb2JfdGl0bGUiOiJBZG1pbmlzdHJhZG9yIiwicm9sZSI6ImFkbWluIiwibW9kdWxlcyI6W10sIm11c3RfY2hhbmdlX3Bhc3N3b3JkIjpmYWxzZSwiaWF0IjoxNzgyNzM4NTk2LCJleHAiOjE3ODMzNDMzOTZ9.qlE_2tIdygTy22zSimERZboPUrt0ohv17HRAUac4e8s"
$steps = @("download_extrato","refresh_cadastro","refresh_reports","download_expenses","snapshot_somase")
$qzs = @("2026-06-1","2026-06-2")

function New-Session {
    $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $c = New-Object System.Net.Cookie("vexp_auth_token", $token, "/", "localhost")
    $s.Cookies.Add($c)
    return $s
}

while ($true) {
    Clear-Host
    Write-Host "=== Pipeline Monitor === $(Get-Date -Format 'HH:mm:ss')`n" -ForegroundColor Cyan
    foreach ($qz in $qzs) {
        Write-Host "[QZ $qz]" -ForegroundColor Yellow
        try {
            $session = New-Session
            $r = Invoke-RestMethod -Uri "http://localhost:3000/api/pipeline/status?quinzena=$qz" -WebSession $session -Method GET -TimeoutSec 10
            if ($r.complete) {
                Write-Host "  COMPLETO!" -ForegroundColor Green
            }
            foreach ($step in $steps) {
                $s = $r.steps.$step
                if ($s) {
                    $icon = switch ($s.status) { "success" { "OK" } "running" { ">>" } "failed" { "XX" } default { "??" } }
                    $color = switch ($s.status) { "success" { "Green" } "running" { "Cyan" } "failed" { "Red" } default { "Gray" } }
                    $err = if ($s.error) { " ERR: $($s.error)" } else { "" }
                    $fin = if ($s.finished_at) { " done: $($s.finished_at.Substring(11,8))" } else { "" }
                    Write-Host "  $icon $step$fin$err" -ForegroundColor $color
                } else {
                    Write-Host "  -- $step (pendente)" -ForegroundColor DarkGray
                }
            }
        } catch {
            Write-Host "  Erro ao consultar API: $($_.Exception.Message)" -ForegroundColor Red
        }
        Write-Host ""
    }
    Start-Sleep 5
}
