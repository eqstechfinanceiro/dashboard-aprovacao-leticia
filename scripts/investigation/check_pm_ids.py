import requests
import json

API_URL = "https://api.vexpenses.com"
TOKEN = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
headers = {"Authorization": TOKEN, "Accept": "application/json"}

# Check what payment_method_id 627401 and 627721 are
# Look at the include=expenses.user response more carefully for one expense
resp = requests.get(f"{API_URL}/v2/reports/7628615?include=expenses.user,expenses.payment_method", headers=headers, timeout=60)
if resp.status_code == 200:
    data = resp.json().get('data', {})
    expenses = data.get('expenses', {}).get('data', [])
    if expenses:
        e = expenses[0]
        print(f"Expense id={e['id']}")
        print(f"  payment_method_id: {e.get('payment_method_id')}")
        pm = e.get('payment_method', {})
        print(f"  payment_method raw: {json.dumps(pm, indent=2)[:500]}")
else:
    print(f"ERROR: {resp.status_code}")

# Also try the other report with include
resp2 = requests.get(f"{API_URL}/v2/reports/9234647?include=expenses.user,expenses.payment_method", headers=headers, timeout=60)
if resp2.status_code == 200:
    data = resp2.json().get('data', {})
    expenses = data.get('expenses', {}).get('data', [])
    if expenses:
        e = expenses[0]
        print(f"\nFATURA Expense id={e['id']}")
        print(f"  payment_method_id: {e.get('payment_method_id')}")
        pm = e.get('payment_method', {})
        print(f"  payment_method raw: {json.dumps(pm, indent=2)[:500]}")
else:
    print(f"ERROR: {resp2.status_code}")

# Check the DB for payment_method_id values
import psycopg2
NEON_URL = "postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"
conn = psycopg2.connect(NEON_URL)
cur = conn.cursor()

print("\n\nPayment method IDs in DB:")
cur.execute("""
    SELECT raw_data->>'payment_method_id' as pm_id, raw_data->>'payment_method_name' as pm_name, count(*) as cnt
    FROM prestacao_expenses
    WHERE raw_data->>'payment_method_id' IS NOT NULL
    GROUP BY raw_data->>'payment_method_id', raw_data->>'payment_method_name'
    ORDER BY cnt DESC
""")
for row in cur.fetchall():
    print(f"  pm_id={row[0]:10s} | pm_name={row[1] or 'NULL':30s} | count={row[2]}")

# Also check how many expenses have NO payment_method_id in raw_data
cur.execute("""
    SELECT count(*) FROM prestacao_expenses WHERE raw_data->>'payment_method_id' IS NULL
""")
no_pm = cur.fetchone()[0]
cur.execute("SELECT count(*) FROM prestacao_expenses")
total = cur.fetchone()[0]
print(f"\nExpenses with no payment_method_id: {no_pm}/{total}")

cur.close()
conn.close()
