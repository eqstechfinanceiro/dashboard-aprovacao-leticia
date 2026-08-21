#!/usr/bin/env python3
"""Check timing issue reports - ENVIADO with updated_at after ref date."""
import os, psycopg2, psycopg2.extras, json
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

rids = [10372756, 9823077, 9823071, 9366952, 11081495, 11080905, 11081343,
        11081001, 11080309, 11080145, 11080573, 10920785, 11080690,
        11081446, 10977210, 10917583, 10984423]

REF_DATE = datetime(2026, 7, 27, 8, 0, 0)

print("=== TIMING ISSUE: ENVIADO reports ===")
print(f"Ref date: {REF_DATE}")
print()
for rid in rids:
    cur.execute("SELECT id, name, status, raw_data FROM prestacao_reports WHERE id = %s", (rid,))
    row = cur.fetchone()
    if not row:
        continue
    raw = row["raw_data"]
    if isinstance(raw, str):
        raw = json.loads(raw)
    ua = raw.get("updated_at", "") if raw else ""
    ad = raw.get("approval_date", "") if raw else ""
    just = raw.get("justification", "") if raw else ""
    name = row["name"]
    status = row["status"]
    print(f"rid={rid} | {name} | {status} | updated={ua} | approval={ad}")
    if just:
        print(f"  justification: {just[:120]}")
    print()

conn.close()
