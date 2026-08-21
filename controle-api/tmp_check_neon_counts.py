#!/usr/bin/env python3
"""Check expense counts and totals in Neon vs PDF for the 4 reports."""
import os, psycopg2, psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

report_ids = [10372756, 9823077, 9823071, 7841173]

print("=== Neon DB: expense counts and totals ===")
for rid in report_ids:
    cur.execute("""
        SELECT count(*) as cnt, sum(value) as total
        FROM prestacao_expenses WHERE report_id = %s
    """, (rid,))
    row = cur.fetchone()
    print(f"rid={rid}: {row['cnt']} expenses, total={row['total']}")

# Also check when these reports were last synced
print("\n=== Report sync info ===")
for rid in report_ids:
    cur.execute("""
        SELECT id, name, status, created_at, updated_at, raw_data
        FROM prestacao_reports WHERE id = %s
    """, (rid,))
    row = cur.fetchone()
    if row:
        import json
        raw = row["raw_data"]
        if isinstance(raw, str):
            raw = json.loads(raw)
        # Check for any status history in raw_data
        status_history = None
        if raw:
            for key in ["status_history", "history", "approvals", "timeline"]:
                if key in raw:
                    status_history = raw[key]
                    break
        print(f"rid={rid}: name={row['name']}, status={row['status']}, created={row['created_at']}, updated={row['updated_at']}")
        if status_history:
            print(f"  history: {json.dumps(status_history, default=str)[:300]}")
        # Check all keys in raw_data
        if raw and isinstance(raw, dict):
            print(f"  raw_data keys: {list(raw.keys())[:20]}")

conn.close()
