#!/usr/bin/env python3
import psycopg2
from dotenv import load_dotenv
from pathlib import Path
import os

BASE = Path(__file__).parent
load_dotenv(BASE / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor()

# Latest snapshot dates
cur.execute("""
    SELECT data, COUNT(*) 
    FROM extrato_movimentacao 
    WHERE is_snapshot = TRUE AND data >= '2026-06-20'
    GROUP BY data 
    ORDER BY data DESC
""")
print("Recent snapshot dates:")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]} snapshots")

# Check prestacao data
cur.execute("SELECT COUNT(*) FROM prestacao_reports")
print(f"\nPrestacao reports: {cur.fetchone()[0]}")

cur.execute("SELECT COUNT(*) FROM prestacao_expenses")
print(f"Prestacao expenses: {cur.fetchone()[0]}")

cur.execute("SELECT MAX(created_at) FROM prestacao_reports")
print(f"Latest report date: {cur.fetchone()[0]}")

# Check somase snapshots
cur.execute("SELECT quinzena, COUNT(*) FROM somase_snapshots GROUP BY quinzena ORDER BY quinzena DESC LIMIT 10")
print("\nSomase snapshots:")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]} CPFs")

conn.close()
