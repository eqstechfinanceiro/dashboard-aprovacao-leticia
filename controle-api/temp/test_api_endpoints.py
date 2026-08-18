"""
Testar endpoints da API VExpenses para descobrir disponíveis
"""
import subprocess
import json

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"

# Endpoints conhecidos que funcionam
known_endpoints = [
    f"{BASE_URL}/v2/expenses",
    f"{BASE_URL}/v2/team-members",
]

# Possíveis endpoints relacionados
possible_endpoints = [
    f"{BASE_URL}/v2/wallets",
    f"{BASE_URL}/v2/cards",
    f"{BASE_URL}/v2/balance",
    f"{BASE_URL}/v2/users",
    f"{BASE_URL}/v2/reports",
]

print("Testando endpoints conhecidos:")
print("=" * 60)

for url in known_endpoints:
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
                        print(f"Registros: {len(data['data'])}")
                    else:
                        print(f"Data keys: {data['data'].keys()}")
            else:
                print(f"Erro: {data.get('message', 'N/A')}")
        except json.JSONDecodeError:
            print("Erro JSON")

print("\n" + "=" * 60)
print("Testando endpoints possíveis:")
print("=" * 60)

for url in possible_endpoints:
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
                        print(f"Registros: {len(data['data'])}")
                    else:
                        print(f"Data keys: {data['data'].keys()}")
            else:
                print(f"Erro: {data.get('message', 'N/A')}")
        except json.JSONDecodeError:
            print("Erro JSON (endpoint pode não existir)")

print("\n" + "=" * 60)
