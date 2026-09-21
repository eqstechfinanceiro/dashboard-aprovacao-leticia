import json, subprocess

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
API_URL = "https://api.vexpenses.com"

# Try different API endpoints for expenses
endpoints = [
    "/v2/reports/10912883/expenses",
    "/v2/reports/10912883/expenses?page=1&per_page=500",
    "/v2/expenses?report_id=10912883",
    "/v2/expenses?expense_id=10912883",
    "/v2/reports/10912883",
]

for ep in endpoints:
    print(f"\n{'='*80}")
    print(f"Trying: {ep}")
    print(f"{'='*80}")
    ps_script = f'''
$headers = @{{ Authorization = "Bearer {API_KEY}" }}
try {{
    $resp = Invoke-RestMethod -Uri "{API_URL}{ep}" -Method GET -Headers $headers
    $resp | ConvertTo-Json -Depth 10
}} catch {{
    Write-Output "STATUS: $($_.Exception.Response.StatusCode.value__)"
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    Write-Output $reader.ReadToEnd()
}}
'''
    result = subprocess.run(['powershell.exe', '-NoProfile', '-Command', ps_script],
                           capture_output=True, text=True, timeout=60)
    out = result.stdout.strip()
    if out:
        print(out[:3000])
    else:
        print(f"(no output, stderr: {result.stderr[:300]})")
