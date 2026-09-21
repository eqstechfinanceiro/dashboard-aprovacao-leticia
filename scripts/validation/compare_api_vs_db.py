import json, subprocess, psycopg2

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
API_URL = "https://api.vexpenses.com"
DB_URL = "postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"

# 1. Fetch current expenses from VExpenses API
print("=" * 100)
print("1. FETCHING CURRENT EXPENSES FROM VEXPENSES API")
print("=" * 100)

ps_script = f'''
$headers = @{{ Authorization = "{API_KEY}"; Accept = "application/json" }}
$resp = Invoke-RestMethod -Uri "{API_URL}/v2/reports/10912883?include=expenses" -Method GET -Headers $headers -TimeoutSec 60
$resp | ConvertTo-Json -Depth 10
'''
result = subprocess.run(['powershell.exe', '-NoProfile', '-Command', ps_script],
                       capture_output=True, text=True, timeout=90)

if result.returncode != 0 or not result.stdout.strip():
    print(f"API call failed: {result.stderr[:500]}")
    exit(1)

api_data = json.loads(result.stdout)
api_expenses = api_data.get('data', {}).get('expenses', {}).get('data', [])
api_report = api_data.get('data', {})

print(f"Report status: {api_report.get('status')}")
print(f"Report total_value: {api_report.get('total_value')}")
print(f"Report updated_at: {api_report.get('updated_at')}")
print(f"API returned {len(api_expenses)} expenses")

api_ids = set(e['id'] for e in api_expenses)
api_total = sum(float(e['value']) for e in api_expenses)
print(f"API total value: R$ {api_total:.2f}")

# 2. Get DB expenses
print(f"\n{'=' * 100}")
print("2. DB EXPENSES FOR REPORT 10912883")
print("=" * 100)

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()
cur.execute("""
    SELECT id, value, date, description, raw_data->>'created_at' as api_created,
           raw_data->>'payment_method_id' as pmid, raw_data->>'rejected' as rejected,
           raw_data->>'reimbursable' as reimbursable
    FROM prestacao_expenses
    WHERE report_id = 10912883
    ORDER BY id
""")
db_rows = cur.fetchall()
db_ids = set(r[0] for r in db_rows)
db_total = sum(float(r[1]) for r in db_rows)
print(f"DB has {len(db_rows)} expenses, total R$ {db_total:.2f}")

# 3. Compare
print(f"\n{'=' * 100}")
print("3. COMPARISON: API vs DB")
print("=" * 100)

in_db_not_api = db_ids - api_ids
in_api_not_db = api_ids - db_ids
in_both = db_ids & api_ids

print(f"In both: {len(in_both)}")
print(f"In DB but NOT in API: {len(in_db_not_api)}")
print(f"In API but NOT in DB: {len(in_api_not_db)}")

if in_db_not_api:
    print(f"\n--- Expenses in DB but NOT in current API response ---")
    for row in db_rows:
        if row[0] in in_db_not_api:
            print(f"  id={row[0]} val=R${row[1]} date={row[2]} desc='{row[3]}' created={row[4]} pmid={row[5]} rejected={row[6]} reimbursable={row[7]}")

if in_api_not_db:
    print(f"\n--- Expenses in API but NOT in DB ---")
    for e in api_expenses:
        if e['id'] in in_api_not_db:
            print(f"  id={e['id']} val=R${e['value']} date={e.get('date')} title='{e.get('title')}' rejected={e.get('rejected')} reimbursable={e.get('reimbursable')}")

# 4. Check if the 4 expenses of interest are in the API
print(f"\n{'=' * 100}")
print("4. ARE THE 4 SUSPECT EXPENSES IN CURRENT API?")
print("=" * 100)
suspect_ids = [87188382, 87189813, 87198791, 87198932]
for sid in suspect_ids:
    match = [e for e in api_expenses if e['id'] == sid]
    if match:
        e = match[0]
        print(f"  {sid}: FOUND in API - val=R${e['value']} rejected={e.get('rejected')} reimbursable={e.get('reimbursable')} pmid={e.get('payment_method_id')}")
    else:
        print(f"  {sid}: NOT in API (deleted from VExpenses?)")

# 5. Check value differences for expenses in both
print(f"\n{'=' * 100}")
print("5. VALUE DIFFERENCES (same ID, different value)")
print("=" * 100)
db_vals = {r[0]: float(r[1]) for r in db_rows}
api_vals = {e['id']: float(e['value']) for e in api_expenses}
diffs = 0
for eid in in_both:
    if abs(db_vals[eid] - api_vals[eid]) > 0.01:
        print(f"  id={eid}: DB=R${db_vals[eid]:.2f} API=R${api_vals[eid]:.2f} diff={db_vals[eid]-api_vals[eid]:+.2f}")
        diffs += 1
if diffs == 0:
    print("  None - all values match")

# 6. Summary
print(f"\n{'=' * 100}")
print("SUMMARY")
print("=" * 100)
print(f"API: {len(api_expenses)} expenses, R$ {api_total:.2f}")
print(f"DB:  {len(db_rows)} expenses, R$ {db_total:.2f}")
print(f"Diff: {len(db_rows) - len(api_expenses)} expenses, R$ {db_total - api_total:+.2f}")
print(f"Extra in DB (not in API): {len(in_db_not_api)} expenses")
if in_db_not_api:
    extra_val = sum(db_vals[eid] for eid in in_db_not_api)
    print(f"  Total value of extra: R$ {extra_val:.2f}")

cur.close()
conn.close()
