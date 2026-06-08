"""
Testar se a API tem endpoint para buscar expense por ID específico
"""
import subprocess
import json

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"

# Testar endpoint por ID
expense_id = 65089646  # ID que sabemos que existe

print(f"Testando endpoint por ID: {expense_id}")

# Tentar diferentes formatos de endpoint
endpoints = [
    f"{BASE_URL}/v2/expenses/{expense_id}",
    f"{BASE_URL}/v2/expenses?id={expense_id}",
    f"{BASE_URL}/v2/expenses?search=id:{expense_id}&searchFields=id:=&include=user,costs_center,payment_method,expense_type,report",
]

for url in endpoints:
    print(f"\nTestando: {url}")
    response = subprocess.run(
        ["curl.exe", "-s", "-H", f"Authorization: {API_KEY}", "-H", "Accept: application/json", url],
        capture_output=True,
        text=True
    )
    
    if response.returncode == 0:
        try:
            data = json.loads(response.stdout)
            print(f"Success: {data.get('success')}")
            if data.get('success'):
                if 'data' in data:
                    if isinstance(data['data'], list):
                        print(f"Expenses retornados: {len(data['data'])}")
                        if data['data']:
                            print(f"ID do primeiro: {data['data'][0].get('id')}")
                    else:
                        print(f"Expense único: ID {data['data'].get('id')}")
                else:
                    print("Sem chave 'data'")
            else:
                print(f"Erro: {data.get('message', 'N/A')}")
        except json.JSONDecodeError as e:
            print(f"Erro ao parsear JSON: {e}")
            print(f"Resposta: {response.stdout[:200]}")
    else:
        print(f"Erro na requisição: {response.stderr}")
