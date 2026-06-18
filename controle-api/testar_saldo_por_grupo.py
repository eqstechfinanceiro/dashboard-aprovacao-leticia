#!/usr/bin/env python3
"""
Testar obter saldo usando balance_id dos card-groups
"""

import subprocess
import json

LARAVEL_TOKEN = "eyJpdiI6Ik1JN2V3a3JEeWpCTDlrZ2Z1R2Y1Q1E9PSIsInZhbHVlIjoiaHJNRUNmVHQxUGtVZDlTN0RIVXlXUFBZdXlFTWMzMldweUxDWnlLYzRIV2U1STVBa2VTL2ZIaUtQZVFOcEZFTkFJTG9GNHJSWURiWWJEME5ZU0FoRXFUcjFNZ0FyVFhMaGtyeDZHS1NvTitPSjlyeFNiZzJ2cWRvWStUNm1PbmFJWlpEUG1GWTN2RHZiNE5PYlFxc1E4eEZEQ1VDZWFlL1hNcEs5cE1BbGl2SXpPd3BKaVd0dlY3cFBJQ3ZQR0RqZjF2VGFud2lZRVkza0Q3QnJDMXpIZFJDNmJkL2JSc0NRUTEwZGhNekxsRGZZaklleXNRWnBlRG5iaVZycnI3SkVQc2YyaWlzVzFpTnIvMEJJeFpzYjltNzRiMzhSRE0xcXBoazBLa3lyM084b00vbm40OUNPU2kxNkJ3MWhoeWwiLCJtYWMiOiIzZmQwMDA3MDEzZTY0NWU5OWQ2MWE1NjcwMWRhOWVjZGIzNjU5NTc0MzM5MTNhN2E4MTg1NGY2YjE0MzNmMjA2IiwidGFnIjoiIn0="

# IDs dos grupos obtidos no teste anterior
GRUPOS = [
    {"name": "ADMINISTRATIVO", "balance_id": "5755f829-b809-41a7-91b8-c21426a424d0", "account_aggregation_id": "ca9953e8-4a88-4d05-9de8-2cdc4d486919"},
    {"name": "COMERCIAL", "balance_id": "9d1127cd-92e9-4526-b61f-be78c51b3642", "account_aggregation_id": "804d706f-b6d2-46c1-9a08-594f9c51e44d"},
]

print("=" * 80)
print("TESTANDO SALDO POR GRUPO")
print("=" * 80)

# Testar diferentes endpoints com os IDs
for grupo in GRUPOS:
    print(f"\n{'='*60}")
    print(f"Grupo: {grupo['name']}")
    print(f"Balance ID: {grupo['balance_id']}")
    print(f"Account Aggregation ID: {grupo['account_aggregation_id']}")
    print(f"{'='*60}")
    
    # Testar endpoint com balance_id
    endpoints = [
        f"/v3/pay/balance/{grupo['balance_id']}",
        f"/v3/pay/statement/balance/{grupo['balance_id']}",
        f"/v3/pay/account-aggregations/{grupo['account_aggregation_id']}",
    ]
    
    for endpoint in endpoints:
        url = f"https://api.vexpenses.com{endpoint}"
        print(f"\n--- Testando: {endpoint} ---")
        
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
                        print(f"✓ SUCESSO!")
                        print(f"Dados: {json.dumps(data.get('data', {}), indent=2, ensure_ascii=False)[:1000]}")
                    else:
                        erro = data.get('errors', [{}])[0].get('message', 'Erro')[:80]
                        print(f"✗ {erro}")
                except:
                    print(f"Resposta: {result.stdout[:200]}")
            else:
                print(f"✗ Sem resposta")
        except Exception as e:
            print(f"✗ Erro: {e}")

print("\n" + "=" * 80)
print("TESTE CONCLUIDO")
print("=" * 80)
