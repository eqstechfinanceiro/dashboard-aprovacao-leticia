#!/usr/bin/env python3
"""
Diagnostico das dependencias criticas:
1. Conexao Neon + tabelas existentes
2. Validade do token da API de extrato (v3/pay)
3. Colunas reais do extrato (SQLite atual)
"""
import os
import json
import subprocess
import sqlite3
from pathlib import Path
from dotenv import load_dotenv

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")

NEON_URL = os.getenv("NEON_DATABASE_URL")
LARAVEL_TOKEN = "eyJpdiI6Ik1JN2V3a3JEeWpCTDlrZ2Z1R2Y1Q1E9PSIsInZhbHVlIjoiaHJNRUNmVHQxUGtVZDlTN0RIVXlXUFBZdXlFTWMzMldweUxDWnlLYzRIV2U1STVBa2VTL2ZIaUtQZVFOcEZFTkFJTG9GNHJSWURiWWJEME5ZU0FoRXFUcjFNZ0FyVFhMaGtyeDZHS1NvTitPSjlyeFNiZzJ2cWRvWStUNm1PbmFJWlpEUG1GWTN2RHZiNE5PYlFxc1E4eEZEQ1VDZWFlL1hNcEs5cE1BbGl2SXpPd3BKaVd0dlY3cFBJQ3ZQR0RqZjF2VGFud2lZRVkza0Q3QnJDMXpIZFJDNmJkL2JSc0NRUTEwZGhNekxsRGZZaklleXNRWnBlRG5iaVZycnI3SkVQc2YyaWlzVzFpTnIvMEJJeFpzYjltNzRiMzhSRE0xcXBoazBLa3lyM084b00vbm40OUNPU2kxNkJ3MWhoeWwiLCJtYWMiOiIzZmQwMDA3MDEzZTY0NWU5OWQ2MWE1NjcwMWRhOWVjZGIzNjU5NTc0MzM5MTNhN2E4MTg1NGY2YjE0MzNmMjA2IiwidGFnIjoiIn0="

print("=" * 80)
print("1. CONEXAO NEON")
print("=" * 80)
try:
    import psycopg2
    conn = psycopg2.connect(NEON_URL)
    cur = conn.cursor()
    cur.execute("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' ORDER BY table_name
    """)
    tabelas = [r[0] for r in cur.fetchall()]
    print(f"OK - Conectado. Tabelas existentes ({len(tabelas)}):")
    for t in tabelas:
        cur.execute(f'SELECT COUNT(*) FROM "{t}"')
        cnt = cur.fetchone()[0]
        print(f"   - {t}: {cnt} linhas")
    cur.close()
    conn.close()
except Exception as e:
    print(f"FALHOU: {e}")

print("\n" + "=" * 80)
print("2. TOKEN API EXTRATO (v3/pay/statement)")
print("=" * 80)
try:
    url = "https://api.vexpenses.com/v3/pay/statement/excel-all?start_date=2026-06-01&end_date=2026-06-05"
    cmd = [
        "curl.exe", "-s", "-X", "GET", url,
        "-H", f"Cookie: laravel_token={LARAVEL_TOKEN}",
        "-H", "Accept: application/json",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    data = json.loads(result.stdout)
    if data.get("success"):
        print(f"OK - Token VALIDO. URL S3 retornada: {data['data']['url'][:60]}...")
    else:
        print(f"TOKEN INVALIDO/EXPIRADO. Resposta: {json.dumps(data)[:200]}")
except Exception as e:
    print(f"FALHOU: {e}")
    print(f"stdout: {result.stdout[:300] if 'result' in dir() else 'N/A'}")

print("\n" + "=" * 80)
print("3. COLUNAS DO EXTRATO (SQLite atual)")
print("=" * 80)
try:
    db = BASE / "data" / "historico_extrato.db"
    conn = sqlite3.connect(db)
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(extrato)")
    cols = cur.fetchall()
    print("Colunas:")
    for c in cols:
        print(f"   {c[1]} ({c[2]})")
    cur.execute("SELECT MIN(data), MAX(data), COUNT(*) FROM extrato")
    mn, mx, cnt = cur.fetchone()
    print(f"\nPeriodo no SQLite: {mn} a {mx} ({cnt} registros)")
    conn.close()
except Exception as e:
    print(f"FALHOU: {e}")
