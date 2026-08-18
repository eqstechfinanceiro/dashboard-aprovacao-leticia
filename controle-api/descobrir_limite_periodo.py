#!/usr/bin/env python3
"""
Descobrir o limite máximo de período da API
Testar incrementalmente até encontrar o limite
"""

import subprocess
import json
from pathlib import Path

LARAVEL_TOKEN = "eyJpdiI6Ik1JN2V3a3JEeWpCTDlrZ2Z1R2Y1Q1E9PSIsInZhbHVlIjoiaHJNRUNmVHQxUGtVZDlTN0RIVXlXUFBZdXlFTWMzMldweUxDWnlLYzRIV2U1STVBa2VTL2ZIaUtQZVFOcEZFTkFJTG9GNHJSWURiWWJEME5ZU0FoRXFUcjFNZ0FyVFhMaGtyeDZHS1NvTitPSjlyeFNiZzJ2cWRvWStUNm1PbmFJWlpEUG1GWTN2RHZiNE5PYlFxc1E4eEZEQ1VDZWFlL1hNcEs5cE1BbGl2SXpPd3BKaVd0dlY3cFBJQ3ZQR0RqZjF2VGFud2lZRVkza0Q3QnJDMXpIZFJDNmJkL2JSc0NRUTEwZGhNekxsRGZZaklleXNRWnBlRG5iaVZycnI3SkVQc2YyaWlzVzFpTnIvMEJJeFpzYjltNzRiMzhSRE0xcXBoazBLa3lyM084b00vbm40OUNPU2kxNkJ3MWhoeWwiLCJtYWMiOiIzZmQwMDA3MDEzZTY0NWU5OWQ2MWE1NjcwMWRhOWVjZGIzNjU5NTc0MzM5MTNhN2E4MTg1NGY2YjE0MzNmMjA2IiwidGFnIjoiIn0="

# Testar diferentes períodos
periodos = [
    ("2026-05-01", "2026-05-31", "1 mês (Maio)"),
    ("2026-04-01", "2026-05-31", "2 meses (Abr-Mai)"),
    ("2026-03-01", "2026-05-31", "3 meses (Mar-Mai) - FALHOU ANTES"),
    ("2026-04-15", "2026-05-31", "1.5 meses (15 Abr - 31 Mai)"),
    ("2026-05-01", "2026-06-15", "1.5 meses (01 Mai - 15 Jun)"),
]

print("=" * 80)
print("DESCOBRINDO LIMITE DE PERIODO DA API")
print("=" * 80)

resultados = []

for start_date, end_date, desc in periodos:
    print(f"\n{'='*60}")
    print(f"Testando: {desc}")
    print(f"Período: {start_date} a {end_date}")
    print(f"{'='*60}")
    
    url = f"https://api.vexpenses.com/v3/pay/statement/excel-all?start_date={start_date}&end_date={end_date}"
    
    cmd = [
        "curl.exe", "-s", "-X", "GET", url,
        "-H", f"Cookie: laravel_token={LARAVEL_TOKEN}",
        "-H", "Accept: application/json"
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        if result.stdout:
            try:
                data = json.loads(result.stdout)
                
                if data.get('success') == True:
                    download_url = data.get('data', {}).get('url')
                    if download_url:
                        print(f"✓ SUCESSO - URL obtida")
                        resultados.append({
                            'periodo': desc,
                            'start': start_date,
                            'end': end_date,
                            'status': 'SUCESSO',
                            'url': download_url[:60] + '...'
                        })
                    else:
                        print(f"⚠ Sucesso mas sem URL")
                        resultados.append({
                            'periodo': desc,
                            'status': 'SUCESSO_SEM_URL',
                            'url': None
                        })
                else:
                    erro = data.get('errors', [{}])[0].get('message', 'Erro desconhecido')
                    code = data.get('code', 'N/A')
                    print(f"✗ FALHA - Código {code}: {erro[:100]}")
                    resultados.append({
                        'periodo': desc,
                        'status': 'FALHA',
                        'erro': erro[:100]
                    })
            except json.JSONDecodeError:
                print(f"✗ FALHA - Resposta não é JSON válido")
                resultados.append({
                    'periodo': desc,
                    'status': 'FALHA_JSON'
                })
        else:
            print(f"✗ FALHA - Sem resposta")
            resultados.append({
                'periodo': desc,
                'status': 'FALHA_SEM_RESPOSTA'
            })
            
    except subprocess.TimeoutExpired:
        print(f"✗ FALHA - Timeout")
        resultados.append({
            'periodo': desc,
            'status': 'TIMEOUT'
        })
    except Exception as e:
        print(f"✗ FALHA - {e}")
        resultados.append({
            'periodo': desc,
            'status': f'ERRO: {e}'
        })
    
    # Pausa entre requisições
    import time
    time.sleep(2)

# ============================================
# RESUMO
# ============================================
print("\n" + "=" * 80)
print("RESUMO DOS TESTES")
print("=" * 80)

for r in resultados:
    status_icon = "✓" if r['status'] == 'SUCESSO' else "✗"
    print(f"\n{status_icon} {r['periodo']}: {r['status']}")
    if 'url' in r and r['url']:
        print(f"  URL: {r['url']}")
    if 'erro' in r:
        print(f"  Erro: {r['erro']}")

print("\n" + "=" * 80)
print("CONCLUSAO")
print("=" * 80)

sucessos = [r for r in resultados if r['status'] == 'SUCESSO']
falhas = [r for r in resultados if r['status'] != 'SUCESSO']

if sucessos:
    print(f"\n✓ Periodos que funcionam: {len(sucessos)}")
    for s in sucessos:
        print(f"  - {s['periodo']}")

if falhas:
    print(f"\n✗ Periodos que falharam: {len(falhas)}")
    for f in falhas:
        print(f"  - {f['periodo']}: {f['status']}")

print("""
## RECOMENDACAO

Se o limite for ~2 meses, estratégia para obter dados históricos:

1. Fazer múltiplas chamadas para períodos de 2 meses
2. Concatenar os resultados
3. Calcular saldo acumulado

Exemplo para 6 meses:
  - Chamada 1: 2026-01-01 a 2026-02-28
  - Chamada 2: 2026-03-01 a 2026-04-30
  - Chamada 3: 2026-05-01 a 2026-06-30
  - Concatenar e calcular saldo final
""")
