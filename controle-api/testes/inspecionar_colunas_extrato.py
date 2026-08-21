#!/usr/bin/env python3
"""Baixa uma amostra do extrato e imprime as colunas reais + dtypes + amostra."""
import json
import subprocess
import pandas as pd
from pathlib import Path

BASE = Path(__file__).parent.parent
TEMP = BASE / "temp"
TEMP.mkdir(exist_ok=True)

LARAVEL_TOKEN = "eyJpdiI6Ik1JN2V3a3JEeWpCTDlrZ2Z1R2Y1Q1E9PSIsInZhbHVlIjoiaHJNRUNmVHQxUGtVZDlTN0RIVXlXUFBZdXlFTWMzMldweUxDWnlLYzRIV2U1STVBa2VTL2ZIaUtQZVFOcEZFTkFJTG9GNHJSWURiWWJEME5ZU0FoRXFUcjFNZ0FyVFhMaGtyeDZHS1NvTitPSjlyeFNiZzJ2cWRvWStUNm1PbmFJWlpEUG1GWTN2RHZiNE5PYlFxc1E4eEZEQ1VDZWFlL1hNcEs5cE1BbGl2SXpPd3BKaVd0dlY3cFBJQ3ZQR0RqZjF2VGFud2lZRVkza0Q3QnJDMXpIZFJDNmJkL2JSc0NRUTEwZGhNekxsRGZZaklleXNRWnBlRG5iaVZycnI3SkVQc2YyaWlzVzFpTnIvMEJJeFpzYjltNzRiMzhSRE0xcXBoazBLa3lyM084b00vbm40OUNPU2kxNkJ3MWhoeWwiLCJtYWMiOiIzZmQwMDA3MDEzZTY0NWU5OWQ2MWE1NjcwMWRhOWVjZGIzNjU5NTc0MzM5MTNhN2E4MTg1NGY2YjE0MzNmMjA2IiwidGFnIjoiIn0="

url = "https://api.vexpenses.com/v3/pay/statement/excel-all?start_date=2026-06-01&end_date=2026-06-10"
cmd = ["curl.exe", "-s", "-X", "GET", url, "-H", f"Cookie: laravel_token={LARAVEL_TOKEN}", "-H", "Accept: application/json"]
result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
data = json.loads(result.stdout)
s3_url = data["data"]["url"]

temp_file = TEMP / "amostra_extrato.xlsx"
subprocess.run(["curl.exe", "-s", "-L", "-o", str(temp_file), s3_url], capture_output=True, timeout=120)

# Listar sheets
xl = pd.ExcelFile(temp_file)
print(f"Sheets: {xl.sheet_names}")

df = pd.read_excel(temp_file, sheet_name=xl.sheet_names[0])
print(f"\nTotal linhas: {len(df)}")
print(f"\nColunas e dtypes:")
for col in df.columns:
    print(f"   {col!r} -> {df[col].dtype}")

print(f"\nPrimeiras 5 linhas:")
print(df.head(5).to_string())

print(f"\nLinhas de SNAPSHOT (Tipo nulo):")
tipo_col = [c for c in df.columns if c.strip().lower() == 'tipo']
if tipo_col:
    snaps = df[df[tipo_col[0]].isna()]
    print(f"   Total snapshots: {len(snaps)}")
    print(snaps.head(3).to_string())

temp_file.unlink()
