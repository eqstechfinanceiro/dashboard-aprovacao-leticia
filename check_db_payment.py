import psycopg2
import json

NEON_URL = "postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"

conn = psycopg2.connect(NEON_URL)
cur = conn.cursor()

# Check the prestacao_expenses table schema
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'prestacao_expenses' ORDER BY ordinal_position")
print("prestacao_expenses columns:")
for row in cur.fetchall():
    print(f"  {row[0]:30s} | {row[1]}")

# Check if raw_data has payment_method info
cur.execute("SELECT id, raw_data FROM prestacao_expenses WHERE raw_data IS NOT NULL LIMIT 3")
rows = cur.fetchall()
print(f"\nExpenses with raw_data: {len(rows)}")
for row in rows:
    raw = row[1] if isinstance(row[1], dict) else (json.loads(row[1]) if row[1] else {})
    print(f"  id={row[0]} | keys={list(raw.keys())[:15]}")
    for k in raw:
        if 'payment' in k.lower() or 'method' in k.lower():
            print(f"    {k}: {raw[k]}")

# Check the prestacao_reports table for ITAU-related reports
print("\n\nReports with ITAU in name:")
cur.execute("SELECT id, name, status, user_name FROM prestacao_reports WHERE name ILIKE '%ITAU%' OR name ILIKE '%CORREÇÃO%'")
for row in cur.fetchall():
    print(f"  id={row[0]} | name={row[1]} | status={row[2]} | user={row[3]}")

# Check expenses for CORREÇÃO ITAU report
print("\nExpenses in CORREÇÃO ITAU report:")
cur.execute("""
    SELECT e.id, e.report_id, e.value, e.date, e.description, e.status, e.raw_data
    FROM prestacao_expenses e
    WHERE e.report_id = 8894343
""")
for row in cur.fetchall():
    raw = row[6] if isinstance(row[6], dict) else (json.loads(row[6]) if row[6] else {})
    pm = raw.get('payment_method', {})
    pm_name = ''
    if isinstance(pm, dict):
        pm_name = pm.get('data', {}).get('name', '') or pm.get('name', '')
    print(f"  id={row[0]} | date={row[3]} | value={row[2]} | desc={row[4]} | status={row[5]} | payment_method={pm_name}")

# Check what columns are available in prestacao_expenses for the API route query
print("\n\nSample expenses for CARLOS (user_id=896018):")
cur.execute("""
    SELECT e.id, e.report_id, e.value, e.date, e.description, e.status, e.raw_data, r.name as report_name
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON e.report_id = r.id
    WHERE r.user_id = 896018
    LIMIT 5
""")
for row in cur.fetchall():
    raw = row[6] if isinstance(row[6], dict) else (json.loads(row[6]) if row[6] else {})
    pm = raw.get('payment_method', {})
    pm_name = ''
    if isinstance(pm, dict):
        pm_name = pm.get('data', {}).get('name', '') or pm.get('name', '')
    print(f"  id={row[0]} | report={row[7]} | date={row[3]} | value={row[2]} | pm={pm_name} | raw_keys={list(raw.keys())[:10] if raw else 'EMPTY'}")

cur.close()
conn.close()
