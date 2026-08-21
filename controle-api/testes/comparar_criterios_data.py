#!/usr/bin/env python3
"""Comparar diferentes critérios de data para alinhar com a planilha CONTROLE"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import psycopg2

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")
NEON_URL = os.getenv("NEON_DATABASE_URL")

conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor()

print("=" * 80)
print("  COMPARAÇÃO DE CRITÉRIOS DE DATA")
print("=" * 80)
print("  Planilha CONTROLE (2ª QZ MAIO): R$ 451,950.00")
print()

criterios = [
    ("Report created_at (11-25/05)", "r.created_at", "2026-05-11", "2026-05-25"),
    ("Expense date (11-25/05)", "e.date", "2026-05-11", "2026-05-25"),
    ("Report created_at (TODO MAIO)", "r.created_at", "2026-05-01", "2026-05-31"),
    ("Expense date (TODO MAIO)", "e.date", "2026-05-01", "2026-05-31"),
    ("Report created_at (ABR-MAIO)", "r.created_at", "2026-04-01", "2026-05-31"),
    ("Expense date (ABR-MAIO)", "e.date", "2026-04-01", "2026-05-31"),
]

for desc, coluna, inicio, fim in criterios:
    cur.execute(f"""
        SELECT COUNT(*), COALESCE(SUM(e.value), 0)
        FROM prestacao_reports r
        JOIN prestacao_expenses e ON e.report_id = r.id
        WHERE {coluna} >= %s AND {coluna} <= %s
    """, (inicio, fim))
    count, total = cur.fetchone()
    print(f"  {desc:<30} {count:>5} expenses  R$ {float(total):>12,.2f}")

conn.close()
print("=" * 80)
