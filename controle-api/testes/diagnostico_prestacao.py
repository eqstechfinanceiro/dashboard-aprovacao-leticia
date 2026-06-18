#!/usr/bin/env python3
"""Diagnóstico dos dados de prestação no Neon"""
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
print("  DIAGNÓSTICO DOS DADOS DE PRESTAÇÃO")
print("=" * 80)

# 1. Verificar se existem expenses
print("\n1. Total de expenses na tabela:")
cur.execute("SELECT COUNT(*) FROM prestacao_expenses")
print(f"   {cur.fetchone()[0]} expenses")

# 2. Verificar estrutura da tabela
print("\n2. Estrutura da tabela prestacao_expenses:")
cur.execute("""
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'prestacao_expenses'
    ORDER BY ordinal_position
""")
for col, dtype in cur.fetchall():
    print(f"   {col}: {dtype}")

# 3. Verificar se report_id existe e está correto
print("\n3. Verificando relacionamento report_id:")
cur.execute("""
    SELECT e.report_id, COUNT(*) 
    FROM prestacao_expenses e
    GROUP BY e.report_id
    ORDER BY COUNT(*) DESC
    LIMIT 5
""")
print("   Top 5 reports com mais expenses:")
for rid, count in cur.fetchall():
    print(f"   Report {rid}: {count} expenses")

# 4. Verificar se os reports do período existem
print("\n4. Reports no período 11-25/05/2026:")
cur.execute("""
    SELECT COUNT(*) FROM prestacao_reports
    WHERE created_at >= '2026-05-11' AND created_at <= '2026-05-25'
""")
print(f"   {cur.fetchone()[0]} reports")

# 5. Verificar se os reports do período têm expenses
print("\n5. Verificando se reports do período têm expenses:")
cur.execute("""
    SELECT r.id, r.created_at, r.status, COUNT(e.id) as qtd_expenses
    FROM prestacao_reports r
    LEFT JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.created_at >= '2026-05-11' AND r.created_at <= '2026-05-25'
    GROUP BY r.id, r.created_at, r.status
    ORDER BY qtd_expenses DESC
    LIMIT 10
""")
print("   Top 10 reports do período:")
for rid, created_at, status, qtd in cur.fetchall():
    print(f"   Report {rid} | {created_at} | status={status} | {qtd} expenses")

# 6. Verificar formato da data created_at
print("\n6. Amostra de created_at:")
cur.execute("SELECT created_at FROM prestacao_reports WHERE created_at IS NOT NULL LIMIT 5")
for (created_at,) in cur.fetchall():
    print(f"   {created_at} (tipo: {type(created_at)})")

# 7. Verificar se expenses têm valor
print("\n7. Amostra de expenses:")
cur.execute("SELECT id, report_id, value, date FROM prestacao_expenses LIMIT 5")
for eid, rid, value, date in cur.fetchall():
    print(f"   ID={eid}, report_id={rid}, value={value}, date={date}")

print("\n" + "=" * 80)
conn.close()
