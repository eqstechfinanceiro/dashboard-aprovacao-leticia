#!/usr/bin/env python3
"""
Testar API com período maior (3 meses)
Validar se conseguimos 100% de match com os saldos da CARGA QZ
"""

import subprocess
import json
from pathlib import Path
import time

# Configuração
LARAVEL_TOKEN = "eyJpdiI6Ik1JN2V3a3JEeWpCTDlrZ2Z1R2Y1Q1E9PSIsInZhbHVlIjoiaHJNRUNmVHQxUGtVZDlTN0RIVXlXUFBZdXlFTWMzMldweUxDWnlLYzRIV2U1STVBa2VTL2ZIaUtQZVFOcEZFTkFJTG9GNHJSWURiWWJEME5ZU0FoRXFUcjFNZ0FyVFhMaGtyeDZHS1NvTitPSjlyeFNiZzJ2cWRvWStUNm1PbmFJWlpEUG1GWTN2RHZiNE5PYlFxc1E4eEZEQ1VDZWFlL1hNcEs5cE1BbGl2SXpPd3BKaVd0dlY3cFBJQ3ZQR0RqZjF2VGFud2lZRVkza0Q3QnJDMXpIZFJDNmJkL2JSc0NRUTEwZGhNekxsRGZZaklleXNRWnBlRG5iaVZycnI3SkVQc2YyaWlzVzFpTnIvMEJJeFpzYjltNzRiMzhSRE0xcXBoazBLa3lyM084b00vbm40OUNPU2kxNkJ3MWhoeWwiLCJtYWMiOiIzZmQwMDA3MDEzZTY0NWU5OWQ2MWE1NjcwMWRhOWVjZGIzNjU5NTc0MzM5MTNhN2E4MTg1NGY2YjE0MzNmMjA2IiwidGFnIjoiIn0="

# Período de 3 meses: Março a Maio/2026
START_DATE = "2026-03-01"
END_DATE = "2026-05-31"

OUTPUT_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/api_statement_3meses.xlsx")

print("=" * 80)
print("TESTE API - PERIODO LONGO (3 MESES)")
print("=" * 80)
print(f"\nPeríodo: {START_DATE} a {END_DATE}")
print(f"Duração: ~3 meses")

# ============================================
# 1. CHAMAR API
# ============================================
print("\n" + "=" * 80)
print("1. CHAMANDO API v3/pay/statement/excel-all")
print("=" * 80)

url = f"https://api.vexpenses.com/v3/pay/statement/excel-all?start_date={START_DATE}&end_date={END_DATE}"

print(f"\nURL: {url}")
print("Enviando requisição...")

cmd = [
    "curl.exe", "-s", "-X", "GET", url,
    "-H", f"Cookie: laravel_token={LARAVEL_TOKEN}",
    "-H", "Accept: application/json"
]

try:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    print(f"Status: {result.returncode}")
    
    if result.stdout:
        print(f"\nResposta (primeiros 1000 chars):")
        print(result.stdout[:1000])
        
        # Tentar parsear JSON
        try:
            data = json.loads(result.stdout)
            print(f"\n✓ Resposta JSON válida")
            print(f"Keys: {list(data.keys())}")
            
            if 'data' in data and 'url' in data['data']:
                download_url = data['data']['url']
                print(f"\n✓ URL de download obtida")
                
                # ============================================
                # 2. DOWNLOAD DO ARQUIVO
                # ============================================
                print("\n" + "=" * 80)
                print("2. BAIXANDO ARQUIVO XLSX")
                print("=" * 80)
                
                print(f"\nDownload de: {download_url[:80]}...")
                print(f"Salvando em: {OUTPUT_FILE}")
                
                download_cmd = [
                    "curl.exe", "-s", "-L", "-o", str(OUTPUT_FILE),
                    download_url
                ]
                
                dl_result = subprocess.run(download_cmd, capture_output=True, text=True, timeout=120)
                
                if dl_result.returncode == 0 and OUTPUT_FILE.exists():
                    size = OUTPUT_FILE.stat().st_size
                    print(f"\n✓ Download concluído!")
                    print(f"  Tamanho: {size:,} bytes ({size/1024/1024:.2f} MB)")
                    
                    if size > 10000:  # Pelo menos 10KB
                        print(f"\n✓ Arquivo parece válido")
                    else:
                        print(f"\n✗ Arquivo muito pequeno, pode ser erro")
                        if size > 0:
                            with open(OUTPUT_FILE, 'r', errors='ignore') as f:
                                content = f.read(500)
                                print(f"  Conteúdo: {content[:300]}")
                else:
                    print(f"\n✗ Erro no download: {dl_result.stderr}")
            else:
                print(f"\n✗ Estrutura de resposta inesperada")
                print(f"  data: {data.get('data', 'N/A')}")
                
        except json.JSONDecodeError as e:
            print(f"\n✗ Erro ao parsear JSON: {e}")
            print(f"  Resposta: {result.stdout[:500]}")
    else:
        print(f"\n✗ Sem resposta")
        if result.stderr:
            print(f"  Erro: {result.stderr}")
            
except subprocess.TimeoutExpired:
    print(f"\n✗ Timeout na requisição")
except Exception as e:
    print(f"\n✗ Erro: {e}")

print("\n" + "=" * 80)
print("TESTE CONCLUIDO")
print("=" * 80)
