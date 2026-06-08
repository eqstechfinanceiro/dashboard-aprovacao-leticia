"""
Teste simples da API
"""
import subprocess
import json

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"

url = f"{BASE_URL}/v2/expenses/65089646"
print(f"Testando: {url}")

response = subprocess.run(
    ["curl.exe", "-s", "-H", f"Authorization: {API_KEY}", "-H", "Accept: application/json", url],
    capture_output=True,
    text=True
)

print(f"Return code: {response.returncode}")
print(f"Response length: {len(response.stdout)}")
print(f"Response (first 500 chars): {response.stdout[:500]}")
