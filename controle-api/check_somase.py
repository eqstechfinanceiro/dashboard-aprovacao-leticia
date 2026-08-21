#!/usr/bin/env python3
import psycopg2
from dotenv import load_dotenv
from pathlib import Path
import os

BASE = Path(__file__).parent
load_dotenv(BASE / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor()

# Check somase_snapshots
cur.execute("SELECT COUNT(*) FROM somase_snapshots")
print(f"somase_snapshots: {cur.fetchone()[0]} rows")

cur.execute("SELECT * FROM somase_snapshots LIMIT 5")
for r in cur.fetchall():
    print(f"  {r}")

# Check prestacao_expenses
cur.execute("SELECT COUNT(*) FROM prestacao_expenses")
print(f"\nprestacao_expenses: {cur.fetchone()[0]} rows")

cur.execute("SELECT COUNT(*) FROM prestacao_reports WHERE status = 'Aprovado'")
print(f"Approved reports: {cur.fetchone()[0]}")

conn.close()
