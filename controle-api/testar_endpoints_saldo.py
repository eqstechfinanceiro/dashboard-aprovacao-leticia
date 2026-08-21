#!/usr/bin/env python3
"""
Testar outros endpoints da API para obter SALDO CARTAO
Testar: /v3/pay/v2/app/card-groups/ e /v3/pay/statement/account-aggregations/{id}
"""

import subprocess
import json
from pathlib import Path

LARAVEL_TOKEN = "eyJpdiI6Ik1JN2V3a3JEeWpCTDlrZ2Z1R2Y1Q1E9PSIsInZhbHVlIjoiaHJNRUNmVHQxUGtVZDlTN0RIVXlXUFBZdXlFTWMzMldweUxDWnlLYzRIV2U1STVBa2VTL2ZIaUtQZVFOcEZFTkFJTG9GNHJSWURiWWJEME5ZU0FoRXFUcjFNZ0FyVFhMaGtyeDZHS1NvTitPSjlyeFNiZzJ2cWRvWStUNm1PbmFJWlpEUG1GWTN2RHZiNE5PYlFxc1E4eEZEQ1VDZWFlL1hNcEs5cE1BbGl2SXpPd3BKaVd0dlY3cFBJQ3ZQR0RqZjF2VGFud2lZRVkza0Q3QnJDMXpIZFJDNmJkL2JSc0NRUTEwZGhNekxsRGZZaklleXNRWnBlRG5iaVZycnI3SkVQc2YyaWlzVzFpTnIvMEJJeFpzYjltNzRiMzhSRE0xcXBoazBLa3lyM084b00vbm40OUNPU2kxNkJ3MWhoeWwiLCJtYWMiOiIzZmQwMDA3MDEzZTY0NWU5OWQ2MWE1NjcwMWRhOWVjZGIzNjU5NTc0MzM5MTNhN2E4MTg1NGY2YjE0MzNmMjA2IiwidGFnIjoiIn0="

print("=" * 80)
print("TESTANDO ENDPOINTS DE SALDO")
print("=" * 80)

# ============================================
# 1. TESTAR /v3/pay/v2/app/card-groups/
# ============================================
print("\n" + "=" * 80)
print("1. TESTANDO /v3/pay/v2/app/card-groups/")
print("=" * 80)

url1 = "https://api.vexpenses.com/v3/pay/v2/app/card-groups/"
print(f"\nURL: {url1}")

cmd1 = [
    "curl.exe", "-s", "-X", "GET", url1,
    "-H", f"Cookie: laravel_token={LARAVEL_TOKEN}",
    "-H", "Accept: application/json"
]

try:
    result1 = subprocess.run(cmd1, capture_output=True, text=True, timeout=30)
    print(f"Status: {result1.returncode}")
    
    if result1.stdout:
        try:
            data1 = json.loads(result1.stdout)
            print(f"\n✓ Resposta JSON válida")
            print(f"Keys: {list(data1.keys())}")
            
            if data1.get('success'):
                print(f"\n✓ Sucesso!")
                print(f"Data: {json.dumps(data1.get('data', {}), indent=2)[:2000]}")
            else:
                erro1 = data1.get('errors', [{}])[0].get('message', 'Erro desconhecido')
                print(f"\n✗ Erro: {erro1}")
        except:
            print(f"\nResposta: {result1.stdout[:500]}")
    else:
        print(f"\n✗ Sem resposta. Erro: {result1.stderr}")
except Exception as e:
    print(f"\n✗ Erro: {e}")

# ============================================
# 2. TESTAR /v3/pay/statement/account-aggregations/{id}
# ============================================
print("\n" + "=" * 80)
print("2. TESTANDO /v3/pay/statement/account-aggregations/{id}")
print("=" * 80)

# Precisamos de um ID - vamos testar com alguns valores comuns
ids_teste = ["1", "2", "3", "me"]

for test_id in ids_teste:
    url2 = f"https://api.vexpenses.com/v3/pay/statement/account-aggregations/{test_id}"
    print(f"\n--- Testando ID: {test_id} ---")
    print(f"URL: {url2}")
    
    cmd2 = [
        "curl.exe", "-s", "-X", "GET", url2,
        "-H", f"Cookie: laravel_token={LARAVEL_TOKEN}",
        "-H", "Accept: application/json"
    ]
    
    try:
        result2 = subprocess.run(cmd2, capture_output=True, text=True, timeout=30)
        
        if result2.stdout:
            try:
                data2 = json.loads(result2.stdout)
                
                if data2.get('success'):
                    print(f"✓ Sucesso!")
                    print(f"Data: {json.dumps(data2.get('data', {}), indent=2)[:1000]}")
                    break  # Se deu certo, parar
                else:
                    erro2 = data2.get('errors', [{}])[0].get('message', 'Erro')
                    print(f"✗ Erro: {erro2[:100]}")
            except:
                print(f"Resposta: {result2.stdout[:200]}")
        else:
            print(f"✗ Sem resposta")
    except Exception as e:
        print(f"✗ Erro: {e}")

# ============================================
# 3. TENTAR OUTROS ENDPOINTS POSSÍVEIS
# ============================================
print("\n" + "=" * 80)
print("3. TESTANDO OUTROS ENDPOINTS POSSÍVEIS")
print("=" * 80)

endpoints = [
    ("/v3/pay/cards", "Listar cartões"),
    ("/v3/pay/balance", "Saldo"),
    ("/v3/pay/accounts", "Contas"),
]

for endpoint, desc in endpoints:
    url = f"https://api.vexpenses.com{endpoint}"
    print(f"\n--- {desc}: {endpoint} ---")
    
    cmd = [
        "curl.exe", "-s", "-X", "GET", url,
        "-H", f"Cookie: laravel_token={LARAVEL_TOKEN}",
        "-H", "Accept: application/json"
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.stdout:
            try:
                data = json.loads(result.stdout)
                
                if data.get('success'):
                    print(f"✓ Funciona!")
                    print(f"Resumo: {str(data.get('data', {}))[:200]}")
                else:
                    erro = data.get('errors', [{}])[0].get('message', 'Erro')[:80]
                    print(f"✗ {erro}")
            except:
                print(f"Resposta não-JSON: {result.stdout[:100]}")
        else:
            print(f"✗ Sem resposta")
    except Exception as e:
        print(f"✗ Erro: {e}")

print("\n" + "=" * 80)
print("TESTE CONCLUIDO")
print("=" * 80)
