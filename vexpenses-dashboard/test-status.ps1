$token = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwiZW1haWwiOiJpdGFsby5tZWRyYWRvQGVxc2VuZ2VuaGFyaWEuY29tLmJyIiwibmFtZSI6Ikl0YWxvIE1lZHJhZG8iLCJqb2JfdGl0bGUiOiJBZG1pbmlzdHJhZG9yIiwicm9sZSI6ImFkbWluIiwibW9kdWxlcyI6W10sIm11c3RfY2hhbmdlX3Bhc3N3b3JkIjpmYWxzZSwiaWF0IjoxNzgyNzM4NTk2LCJleHAiOjE3ODMzNDMzOTZ9.qlE_2tIdygTy22zSimERZboPUrt0ohv17HRAUac4e8s"
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$cookie = New-Object System.Net.Cookie("vexp_auth_token", $token, "/", "localhost")
$session.Cookies.Add($cookie)
try {
    $r = Invoke-RestMethod -Uri "http://localhost:3000/api/pipeline/status?quinzena=2026-06-1" -WebSession $session -Method GET -TimeoutSec 10
    $r | ConvertTo-Json -Depth 5
} catch {
    Write-Host "ERROR:"
    Write-Host $_.Exception.Message
}
