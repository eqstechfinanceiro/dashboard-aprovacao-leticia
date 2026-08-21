#!/usr/bin/env python3
"""Investigar por que a planilha tem valor maior que a API"""
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
print("  INVESTIGAÇÃO DA DIFERENÇA")
print("=" * 80)

# 1. Verificar se há reports criados antes de 11/05 mas aprovados no período
print("\n1. Reports criados ANTES de 11/05 mas com expenses em 11-25/05:")
cur.execute("""
    SELECT COUNT(*), COALESCE(SUM(e.value), 0)
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.created_at < '2026-05-11'
      AND e.date >= '2026-05-11' AND e.date <= '2026-05-25'
""")
count, total = cur.fetchone()
print(f"   {count} expenses, R$ {float(total):,.2f}")

# 2. Verificar reports criados em 11-25/05 mas com expenses em outras datas
print("\n2. Reports criados em 11-25/05 mas com expenses em OUTRAS datas:")
cur.execute("""
    SELECT COUNT(*), COALESCE(SUM(e.value), 0)
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.created_at >= '2026-05-11' AND r.created_at <= '2026-05-25'
      AND (e.date < '2026-05-11' OR e.date > '2026-05-25')
""")
count, total = cur.fetchone()
print(f"   {count} expenses, R$ {float(total):,.2f}")

# 3. Verificar total de expenses SEM data (NULL)
print("\n3. Expenses sem data (NULL):")
cur.execute("""
    SELECT COUNT(*), COALESCE(SUM(value), 0)
    FROM prestacao_expenses
    WHERE date IS NULL
""")
count, total = cur.fetchone()
print(f"   {count} expenses, R$ {float(total):,.2f}")

# 4. Verificar total de expenses por status do report
print("\n4. Total por status (reports criados em 11-25/05):")
cur.execute("""
    SELECT r.status, COUNT(e.id), COALESCE(SUM(e.value), 0)
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.created_at >= '2026-05-11' AND r.created_at <= '2026-05-25'
    GROUP BY r.status
    ORDER BY SUM(e.value) DESC
""")
for status, count, total in cur.fetchall():
    print(f"   {status:<15} {count:>5} expenses  R$ {float(total):>12,.2f}")

# 5. Verificar se há colaboradores na planilha que não estão na API
print("\n5. Verificar colaboradores específicos da planilha:")
colaboradores_planilha = [
    "RAFAEL AMORIM VELLO",
    "ABNER ANDRADE CAVALCANTE", 
    "ANDRE ARANHA MEISTER",
    "JUSTINO NOGUEIRA PEIXOTO JUNIOR"
]

for nome in colaboradores_planilha:
    cur.execute("""
        SELECT COUNT(*), COALESCE(SUM(e.value), 0)
        FROM prestacao_reports r
        JOIN prestacao_expenses e ON e.report_id = r.id
        WHERE r.created_at >= '2026-05-11' AND r.created_at <= '2026-05-25'
          AND r.user_name ILIKE %s
    """, (f"%{nome}%",))
    count, total = cur.fetchone()
    print(f"   {nome:<40} {count:>3} expenses  R$ {float(total):>10,.2f}")

conn.close()
print("=" * 80)
