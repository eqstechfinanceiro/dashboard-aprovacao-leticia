"""
Testar endpoints da API VExpenses relacionados a transações/extratos
"""
import subprocess
import json

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"

# Possíveis endpoints para transações/extratos
endpoints = [
    f"{BASE_URL}/v2/transactions",
    f"{BASE_URL}/v2/cards",
    f"{BASE_URL}/v2/statements",
    f"{BASE_URL}/v2/extracts",
    f"{BASE_URL}/v2/card-transactions",
    f"{BASE_URL}/v2/transfers",
]

print("Testando endpoints relacionados a transações/extratos:")
print("=" * 60)

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
                        print(f"Registros retornados: {len(data['data'])}")
                        if data['data']:
                            print(f"Exemplo: {data['data'][0].keys()}")
                    else:
                        print(f"Data: {data['data'].keys()}")
                else:
                    print("Sem chave 'data'")
            else:
                print(f"Erro: {data.get('message', 'N/A')}")
        except json.JSONDecodeError as e:
            print(f"Erro JSON: {e}")
            print(f"Resposta: {response.stdout[:200]}")
    else:
        print(f"Erro HTTP: {response.stderr}")

print("\n" + "=" * 60)
