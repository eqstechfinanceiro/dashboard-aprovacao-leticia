"""
Versão do script para rodar em background (PowerShell)
Salva log em arquivo para acompanhamento
"""
import subprocess
import sys
import os

# Script PowerShell para rodar em background
ps_script = '''
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
'''

# Salvar o script PowerShell
with open('run_download_background.ps1', 'w') as f:
    f.write(ps_script)

print("Script PowerShell criado: run_download_background.ps1")
print("Para executar em background:")
print("  1. Abra um terminal PowerShell")
print("  2. Execute: .\\run_download_background.ps1")
print("  3. Para acompanhar: Get-Content download_log.txt -Tail 10 -Wait")
