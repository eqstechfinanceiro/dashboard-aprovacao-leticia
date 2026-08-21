"""
Testar se a API permite buscar múltiplos IDs de uma vez
"""
import subprocess
import json

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"

# Testar diferentes formatos para múltiplos IDs
test_ids = [65089646, 65089647, 65089648]

print("Testando diferentes formatos para múltiplos IDs:")

# Formato 1: search com OR
url1 = f"{BASE_URL}/v2/expenses?search=id:{','.join(map(str, test_ids))}&searchFields=id:in&include=user"
print(f"\n1. search com OR: {url1}")
response = subprocess.run(
    ["curl.exe", "-s", "-H", f"Authorization: {API_KEY}", "-H", "Accept: application/json", url1],
    capture_output=True,
    text=True
)
if response.returncode == 0:
    try:
        data = json.loads(response.stdout)
        print(f"Success: {data.get('success')}")
        if data.get('success') and 'data' in data:
            print(f"Expenses retornados: {len(data['data'])}")
    except json.JSONDecodeError as e:
        print(f"Erro JSON: {e}")
        print(f"Resposta: {response.stdout[:200]}")
else:
    print(f"Erro HTTP: {response.stderr}")

# Formato 2: filter com array
url2 = f"{BASE_URL}/v2/expenses?filter[id]={','.join(map(str, test_ids))}&include=user"
print(f"\n2. filter com array: {url2}")
response = subprocess.run(
    ["curl.exe", "-s", "-H", f"Authorization: {API_KEY}", "-H", "Accept: application/json", url2],
    capture_output=True,
    text=True
)
if response.returncode == 0:
    try:
        data = json.loads(response.stdout)
        print(f"Success: {data.get('success')}")
        if data.get('success') and 'data' in data:
            print(f"Expenses retornados: {len(data['data'])}")
    except json.JSONDecodeError as e:
        print(f"Erro JSON: {e}")
        print(f"Resposta: {response.stdout[:200]}")
else:
    print(f"Erro HTTP: {response.stderr}")

# Formato 3: whereIn
url3 = f"{BASE_URL}/v2/expenses?whereIn=id,{','.join(map(str, test_ids))}&include=user"
print(f"\n3. whereIn: {url3}")
response = subprocess.run(
    ["curl.exe", "-s", "-H", f"Authorization: {API_KEY}", "-H", "Accept: application/json", url3],
    capture_output=True,
    text=True
)
if response.returncode == 0:
    try:
        data = json.loads(response.stdout)
        print(f"Success: {data.get('success')}")
        if data.get('success') and 'data' in data:
            print(f"Expenses retornados: {len(data['data'])}")
    except json.JSONDecodeError as e:
        print(f"Erro JSON: {e}")
        print(f"Resposta: {response.stdout[:200]}")
else:
    print(f"Erro HTTP: {response.stderr}")
