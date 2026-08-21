#!/usr/bin/env python3
import os, psycopg2, psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")
NEON_URL = os.getenv("NEON_DATABASE_URL")
conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Check if report 11004121 exists in API at all
cur.execute("SELECT id, name, status, user_cpf, user_name, total_value, created_at FROM prestacao_reports WHERE id = 11004121")
r = cur.fetchone()
if r:
    print(f"Found: id={r['id']} name={r['name']} status={r['status']} cpf={r['user_cpf']} user={r['user_name']} total={r['total_value']} created={r['created_at']}")
else:
    print("Report 11004121 NOT FOUND in prestacao_reports")

# Also check by name+cpf
cur.execute("SELECT id, name, status, user_cpf, user_name, total_value FROM prestacao_reports WHERE user_cpf = '17278189705' ORDER BY id")
rows = cur.fetchall()
print(f"\nAll reports for CPF 17278189705 (CLEBER): {len(rows)}")
for r in rows:
    print(f"  id={r['id']} name={r['name']} status={r['status']} total={r['total_value']}")

# Check the 8 CAIXA 04/2026 reports with created_at=NULL
print("\n--- 8 CAIXA 04/2026 ENVIADO reports with created_at=NULL ---")
rids = [11080145, 11080309, 11080573, 11080690, 11081001, 11081343, 11081446, 11081495]
for rid in rids:
    cur.execute("SELECT id, name, status, user_cpf, user_name, total_value, created_at, updated_at FROM prestacao_reports WHERE id = %s", (rid,))
    r = cur.fetchone()
    if r:
        print(f"  id={r['id']} name={r['name']} status={r['status']} user={r['user_name']} cpf={r['user_cpf']} total={r['total_value']} created={r['created_at']} updated={r['updated_at']}")

# Check JOSE CARLOS BATISTA's 3 ENVIADO reports
print("\n--- JOSE CARLOS BATISTA ENVIADO reports ---")
cur.execute("SELECT id, name, status, user_cpf, user_name, total_value, created_at, updated_at FROM prestacao_reports WHERE user_name ILIKE 'JOSE CARLOS BATISTA' ORDER BY id")
rows = cur.fetchall()
for r in rows:
    print(f"  id={r['id']} name={r['name']} status={r['status']} total={r['total_value']} created={r['created_at']} updated={r['updated_at']}")

# Check: what statuses do the 14 missing ref reports have in API?
print("\n--- 14 missing ref reports: do they exist in API with different status? ---")
missing_rids = [7802955, 7853208, 8668668, 8747941, 8820121, 8869646, 8990379, 9085420, 9086108, 9302713, 9424902, 10467383, 10581527, 11004121]
for rid in missing_rids:
    cur.execute("SELECT id, name, status, user_cpf, user_name, total_value FROM prestacao_reports WHERE id = %s", (rid,))
    r = cur.fetchone()
    if r:
        print(f"  EXISTS: id={r['id']} name={r['name']} status={r['status']} user={r['user_name']} total={r['total_value']}")
    else:
        print(f"  NOT IN API: rid={rid}")

conn.close()
