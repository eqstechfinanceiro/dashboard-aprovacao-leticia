"""
Testar diferentes formatos de data na API para ver qual funciona
"""
import subprocess
import json

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"

# Testar diferentes formatos de data
test_cases = [
    ("2025-08-01", "2025-08-31", "Formato ISO (YYYY-MM-DD)"),
    ("01/08/2025", "31/08/2025", "Formato brasileiro (DD/MM/YYYY)"),
    ("2025-07-01", "2025-07-31", "Julho 2025 ISO"),
    ("2026-01-01", "2026-01-31", "Janeiro 2026 ISO"),
]

for start, end, desc in test_cases:
    print(f"\n--- Testando: {desc} ---")
    print(f"Range: {start} a {end}")
    
    url = f"{BASE_URL}/v2/expenses?search=date:{start},{end}&searchFields=date:between&paginate=true&page=1&per_page=1&include=user"
    
    response = subprocess.run(
        ["curl.exe", "-s", "-H", f"Authorization: {API_KEY}", "-H", "Accept: application/json", url],
        capture_output=True,
        text=True
    )
    
    if response.returncode == 0:
        data = json.loads(response.stdout)
        print(f"Success: {data.get('success')}")
        if not data.get('success'):
            print(f"Mensagem: {data.get('message', 'N/A')}")
            print(f"Código: {data.get('code', 'N/A')}")
            continue
        if 'data' in data and data['data']:
            count = len(data['data'])
            print(f"Expenses retornados: {count}")
            if count > 0:
                print(f"Primeiro expense ID: {data['data'][0].get('id')}")
                print(f"Data do primeiro expense: {data['data'][0].get('date')}")
        else:
            print("Sem dados retornados ou chave 'data' vazia")
    else:
        print(f"Erro: {response.stderr}")
