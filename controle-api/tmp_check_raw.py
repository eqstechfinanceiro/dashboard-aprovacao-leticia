#!/usr/bin/env python3
"""Check raw_data fields for BASE PREST mapping."""
import os, json
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path

BASE = Path(__file__).parent
load_dotenv(BASE / ".env")
NEON_URL = os.getenv("NEON_DATABASE_URL")

conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Sample expense raw_data
cur.execute("""
    SELECT e.id, e.report_id, e.value, e.date, e.description, e.status, e.raw_data,
           r.name as report_name, r.status as report_status, r.user_name, r.user_cpf
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON e.report_id = r.id
    WHERE e.raw_data IS NOT NULL
    LIMIT 3
""")
for r in cur.fetchall():
    print("=== Expense {} ===".format(r["id"]))
    print("  report_id={}, report_name={}".format(r["report_id"], r["report_name"]))
    print("  value={}, date={}, desc={}".format(r["value"], r["date"], r["description"]))
    print("  status={}, user_name={}, user_cpf={}".format(r["report_status"], r["user_name"], r["user_cpf"]))
    rd = r["raw_data"]
    if rd:
        for k in sorted(rd.keys()):
            print("  raw.{} = {}".format(k, repr(rd[k])[:80]))
    print()

# Sample report raw_data
cur.execute("""
    SELECT id, name, status, user_name, user_cpf, raw_data
    FROM prestacao_reports
    WHERE raw_data IS NOT NULL
    LIMIT 2
""")
for r in cur.fetchall():
    print("=== Report {} ===".format(r["id"]))
    print("  name={}, status={}, user={}, cpf={}".format(r["name"], r["status"], r["user_name"], r["user_cpf"]))
    rd = r["raw_data"]
    if rd:
        for k in sorted(rd.keys()):
            print("  raw.{} = {}".format(k, repr(rd[k])[:80]))
    print()

# Count expenses with and without raw_data, by status
cur.execute("""
    SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE e.raw_data IS NOT NULL) as has_raw,
        COUNT(*) FILTER (WHERE e.raw_data IS NULL) as no_raw
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON e.report_id = r.id
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND TRIM(r.name) !~* '^(fatu|farur|cart)'
      AND TRIM(r.name) !~* '(fatura|fatuar|fatut|farur)'
""")
r = cur.fetchone()
print("BASE PREST eligible: total={}, has_raw={}, no_raw={}".format(r["total"], r["has_raw"], r["no_raw"]))

conn.close()
