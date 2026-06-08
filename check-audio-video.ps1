# Script de verificação de uso de microfone e câmera - Detecção de malware
# Executar como Administrador

Write-Host "=== VERIFICAÇÃO DE MICROFONE E CÂMERA ===" -ForegroundColor Cyan
Write-Host "Iniciando em: $(Get-Date)" -ForegroundColor Yellow
Write-Host ""

# 1. Verificar processos com handles de áudio/vídeo
Write-Host "[1] Verificando processos com handles de áudio/vídeo..." -ForegroundColor Yellow
try {
    $audioProcesses = Get-Process | Where-Object {
        try {
            $_.Modules.FileName -like "*audio*" -or 
            $_.Modules.FileName -like "*camera*" -or
            $_.Modules.FileName -like "*video*" -or
            $_.Modules.FileName -like "*capture*"
        } catch {}
    }
    
    if ($audioProcesses) {
        Write-Host "Processos com módulos de áudio/vídeo encontrados:" -ForegroundColor Red
        $audioProcesses | ForEach-Object {
            Write-Host "  - $($_.Name) (PID: $($_.Id)) - Path: $($_.Path)" -ForegroundColor Red
        }
    } else {
        Write-Host "Nenhum processo com módulos óbvios de áudio/vídeo encontrado" -ForegroundColor Green
    }
} catch {
    Write-Host "Erro ao verificar processos: $_" -ForegroundColor Red
}
Write-Host ""

# 2. Verificar dispositivos de captura via WMI
Write-Host "[2] Verificando dispositivos de captura ativos via WMI..." -ForegroundColor Yellow
try {
    $audioDevices = Get-WmiObject -Class Win32_SoundDevice | Where-Object { $_.Status -eq "OK" }
    Write-Host "Dispositivos de áudio:"
    $audioDevices | ForEach-Object {
        Write-Host "  - $($_.Name) - Status: $($_.Status)" -ForegroundColor White
    }
    
    $videoDevices = Get-WmiObject -Class Win32_PnPEntity | Where-Object { 
        $_.Name -like "*camera*" -or $_.Name -like "*webcam*" -or $_.Name -like "*video*"
    }
    Write-Host "Dispositivos de vídeo:"
    $videoDevices | ForEach-Object {
        Write-Host "  - $($_.Name) - Status: $($_.Status)" -ForegroundColor White
    }
} catch {
    Write-Host "Erro ao verificar dispositivos WMI: $_" -ForegroundColor Red
}
Write-Host ""

# 3. Verificar conexões de rede suspeitas (streaming)
Write-Host "[3] Verificando conexões de rede suspeitas (streaming)..." -ForegroundColor Yellow
try {
    $connections = Get-NetTCPConnection -State Established | Where-Object { 
        $_.RemotePort -eq 443 -or $_.RemotePort -eq 80 -or $_.RemotePort -gt 1024
    }
    
    $suspiciousPorts = @(1935, 554, 8554, 9000, 9001, 5222, 5223, 5269, 5280)
    $streamingConnections = $connections | Where-Object { 
        $suspiciousPorts -contains $_.RemotePort
    }
    
    if ($streamingConnections) {
        Write-Host "Conexões suspeitas (portas de streaming):" -ForegroundColor Red
        $streamingConnections | ForEach-Object {
            $process = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
            Write-Host "  - PID: $($_.OwningProcess) - Processo: $($process.Name) - Remote: $($_.RemoteAddress):$($_.RemotePort)" -ForegroundColor Red
        }
    } else {
        Write-Host "Nenhuma conexão em portas de streaming detectada" -ForegroundColor Green
    }
    
    # Verificar conexões com alto volume de dados
    Write-Host "`nVerificando processos com conexões ativas:"
    $activeProcesses = $connections | Group-Object OwningProcess | Where-Object { $_.Count -gt 5 }
    $activeProcesses | ForEach-Object {
        $process = Get-Process -Id $_.Name -ErrorAction SilentlyContinue
        Write-Host "  - $($process.Name) (PID: $($_.Name)) - $($_.Count) conexões" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Erro ao verificar conexões: $_" -ForegroundColor Red
}
Write-Host ""

# 4. Verificar logs de eventos do Windows (últimas horas)
Write-Host "[4] Verificando logs de eventos do Windows (desde 8h)..." -ForegroundColor Yellow
try {
    $startTime = Get-Date -Hour 8 -Minute 0 -Second 0
    if ((Get-Date).Hour -lt 8) {
        $startTime = $startTime.AddDays(-1)
    }
    
    Write-Host "Verificando eventos desde: $startTime"
    
    # Logs de segurança
    $securityEvents = Get-WinEvent -FilterHashtable @{
        LogName='Security'
        StartTime=$startTime
    } -MaxEvents 100 -ErrorAction SilentlyContinue
    
    if ($securityEvents) {
        Write-Host "Eventos de segurança recentes:"
        $securityEvents | Where-Object { 
            $_.Message -like "*device*" -or 
            $_.Message -like "*audio*" -or 
            $_.Message -like "*camera*" -or
            $_.Message -like "*microphone*"
        } | Select-Object -First 10 | ForEach-Object {
            Write-Host "  - $($_.TimeCreated) - ID: $($_.Id) - $($_.Message.Substring(0, [Math]::Min(100, $_.Message.Length)))..." -ForegroundColor Yellow
        }
    }
    
    # Logs do sistema
    $systemEvents = Get-WinEvent -FilterHashtable @{
        LogName='System'
        StartTime=$startTime
    } -MaxEvents 100 -ErrorAction SilentlyContinue
    
    if ($systemEvents) {
        Write-Host "`nEventos do sistema recentes:"
        $systemEvents | Where-Object { 
            $_.Message -like "*audio*" -or 
            $_.Message -like "*camera*" -or
            $_.Message -like "*driver*"
        } | Select-Object -First 10 | ForEach-Object {
            Write-Host "  - $($_.TimeCreated) - ID: $($_.Id) - $($_.Message.Substring(0, [Math]::Min(100, $_.Message.Length)))..." -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "Erro ao verificar logs de eventos: $_" -ForegroundColor Red
}
Write-Host ""

# 5. Verificar serviços suspeitos
Write-Host "[5] Verificando serviços suspeitos..." -ForegroundColor Yellow
try {
    $services = Get-Service | Where-Object { 
        $_.Status -eq "Running" -and 
        ($_.DisplayName -like "*audio*" -or 
         $_.DisplayName -like "*camera*" -or
         $_.DisplayName -like "*video*" -or
         $_.DisplayName -like "*capture*")
    }
    
    if ($services) {
        Write-Host "Serviços em execução relacionados a áudio/vídeo:" -ForegroundColor Yellow
        $services | ForEach-Object {
            Write-Host "  - $($_.DisplayName) - Status: $($_.Status)" -ForegroundColor White
        }
    } else {
        Write-Host "Nenhum serviço suspeito encontrado" -ForegroundColor Green
    }
} catch {
    Write-Host "Erro ao verificar serviços: $_" -ForegroundColor Red
}
Write-Host ""

# 6. Verificar processos ocultos/injetados
Write-Host "[6] Verificando processos com permissões elevadas..." -ForegroundColor Yellow
try {
    $elevatedProcesses = Get-Process | Where-Object { 
        try {
            $_.Path -and (Test-Path $_.Path) -and 
            ((Get-Acl $_.Path).Owner -like "*Administrator*" -or 
             (Get-Acl $_.Path).Owner -like "*SYSTEM*")
        } catch {}
    }
    
    if ($elevatedProcesses) {
        Write-Host "Processos com permissões elevadas:"
        $elevatedProcesses | Select-Object -First 20 | ForEach-Object {
            Write-Host "  - $($_.Name) (PID: $($_.Id)) - Path: $($_.Path)" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "Erro ao verificar processos elevados: $_" -ForegroundColor Red
}
Write-Host ""

# 7. Verificar arquivos temporários de gravação
Write-Host "[7] Verificando arquivos temporários de áudio/vídeo..." -ForegroundColor Yellow
$tempDirs = @("$env:TEMP", "$env:APPDATA\Temp", "$env:LOCALAPPDATA\Temp")
$videoExtensions = @("*.mp4", "*.avi", "*.mkv", "*.mov", "*.webm", "*.flv", "*.wmv")
$audioExtensions = @("*.mp3", "*.wav", "*.flac", "*.aac", "*.m4a", "*.wma")

foreach ($dir in $tempDirs) {
    if (Test-Path $dir) {
        $recentFiles = Get-ChildItem -Path $dir -Include ($videoExtensions + $audioExtensions) -Recurse -ErrorAction SilentlyContinue | 
                       Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-2) }
        
        if ($recentFiles) {
            Write-Host "Arquivos de audio/video recentes em ${dir}:" -ForegroundColor Red
            $recentFiles | ForEach-Object {
                Write-Host "  - $($_.Name) - Criado: $($_.CreationTime) - Tamanho: $([math]::Round($_.Length/1MB, 2)) MB" -ForegroundColor Red
            }
        }
    }
}
Write-Host ""

Write-Host "=== VERIFICAÇÃO CONCLUÍDA ===" -ForegroundColor Cyan
Write-Host "Finalizado em: $(Get-Date)" -ForegroundColor Yellow
