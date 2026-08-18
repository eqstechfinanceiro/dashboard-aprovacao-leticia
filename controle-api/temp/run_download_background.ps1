
# Script PowerShell para rodar download_to_db.py em background
$scriptPath = "download_to_db.py"
$logPath = "download_log.txt"
$pythonPath = "python"

# Verificar se o script Python existe
if (-not (Test-Path $scriptPath)) {
    Write-Host "Erro: Script $scriptPath não encontrado"
    exit 1
}

# Iniciar o processo em background
Write-Host "Iniciando download em background..."
Write-Host "Log será salvo em: $logPath"
Write-Host "Para acompanhar: Get-Content $logPath -Tail 10 -Wait"
Write-Host "Para parar: Stop-Process -Name python -Force"
Write-Host ""

# Iniciar o processo Python
$process = Start-Process -FilePath $pythonPath -ArgumentList $scriptPath -RedirectStandardOutput $logPath -RedirectStandardError $logPath -PassThru -WindowStyle Hidden

Write-Host "Processo iniciado com PID: $($process.Id)"
Write-Host "Execute 'python check_download_progress.py' para verificar o progresso"
