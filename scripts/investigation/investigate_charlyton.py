import psycopg2, json, subprocess, os

DB_URL = "postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

# 1. Check when these expenses were inserted into our DB
print("=" * 100)
print("1. WHEN WERE THESE EXPENSES INSERTED INTO OUR DB?")
print("=" * 100)
cur.execute("""
    SELECT id, value, date, description, raw_data->>'created_at' as api_created, raw_data->>'updated_at' as api_updated
    FROM prestacao_expenses
    WHERE id = ANY(%s)
    ORDER BY id
""", ([87188382, 87189813, 87198791, 87198932],))
for row in cur.fetchall():
    print(f"  Expense {row[0]}: R${row[1]} date={row[2]}")
    print(f"    API created_at={row[4]}, API updated_at={row[5]}")

# 2. Check ALL expenses for this report - are there others with similar patterns?
print(f"\n{'=' * 100}")
print("2. ALL EXPENSES FOR REPORT 10912883 - CHECK FOR PATTERNS")
print("=" * 100)
cur.execute("""
    SELECT id, value, date, description, raw_data->>'created_at' as api_created,
           raw_data->>'payment_method_id' as pmid, raw_data->>'reimbursable' as reimbursable,
           raw_data->>'rejected' as rejected
    FROM prestacao_expenses
    WHERE report_id = 10912883
    ORDER BY id
""")
all_expenses = cur.fetchall()
print(f"Total: {len(all_expenses)} expenses")

# Group by created_at date
from collections import Counter
created_dates = Counter()
pmids = Counter()
for e in all_expenses:
    created_dates[e[4][:10] if e[4] else 'unknown'] += 1
    pmids[e[5]] += 1

print(f"\nExpenses by creation date (from API):")
for d, c in sorted(created_dates.items()):
    print(f"  {d}: {c} expenses")

print(f"\nExpenses by payment_method_id:")
for p, c in pmids.items():
    print(f"  pmid={p}: {c} expenses")

# 3. Check if there are expenses with payment_method_id 627721 vs others
print(f"\n{'=' * 100}")
print("3. EXPENSES WITH payment_method_id=627721 vs OTHERS")
print("=" * 100)
cur.execute("""
    SELECT
        CASE WHEN raw_data->>'payment_method_id' = '627721' THEN '627721' ELSE 'other' END as pm_group,
        COUNT(*),
        COALESCE(SUM(value), 0)
    FROM prestacao_expenses
    WHERE report_id = 10912883
    GROUP BY raw_data->>'payment_method_id'
    ORDER BY pm_group
""")
for row in cur.fetchall():
    print(f"  pmid={row[0]}: {row[1]} expenses, R${row[2]:.2f}")

# 4. Check the quinzena-complete API logic - does it filter by payment_method_id?
print(f"\n{'=' * 100}")
print("4. CHECKING QUINZENA-COMPLETE API FILTER LOGIC")
print("=" * 100)

# 5. Now fetch the report expenses directly from VExpenses API
print(f"\n{'=' * 100}")
print("5. FETCHING EXPENSES FROM VEXPENSES API FOR REPORT 10912883")
print("=" * 100)

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
API_URL = "https://api.vexpenses.com"

ps_script = f'''
$headers = @{{ Authorization = "Bearer {API_KEY}" }}
$resp = Invoke-RestMethod -Uri "{API_URL}/v2/reports/10912883/expenses?page=1" -Method GET -Headers $headers
$resp | ConvertTo-Json -Depth 10
'''
result = subprocess.run(['powershell.exe', '-NoProfile', '-Command', ps_script],
                       capture_output=True, text=True, timeout=60)

if result.returncode == 0 and result.stdout.strip():
    try:
        api_resp = json.loads(result.stdout)
        api_expenses = api_resp.get('data', [])
        print(f"VExpenses API returned {len(api_expenses)} expenses")
        print(f"Meta: {api_resp.get('meta', {})}")

        # Check if our 4 expense IDs exist in API response
        api_ids = set(e['id'] for e in api_expenses)
        our_ids = {87188382, 87189813, 87198791, 87198932}
        missing_in_api = our_ids - api_ids
        extra_in_api = api_ids - our_ids

        print(f"\nOur 4 expense IDs in API: {our_ids & api_ids}")
        print(f"Our 4 expense IDs NOT in API: {missing_in_api}")
        print(f"Extra in API not in our DB: {extra_in_api}")

        # Show details of our 4 expenses from API
        for eid in [87188382, 87189813, 87198791, 87198932]:
            match = [e for e in api_expenses if e['id'] == eid]
            if match:
                e = match[0]
                print(f"\n  API Expense {eid}: value={e.get('value')} date={e.get('date')} title='{e.get('title')}' rejected={e.get('rejected')} reimbursable={e.get('reimbursable')}")
            else:
                print(f"\n  API Expense {eid}: NOT FOUND IN API")
    except json.JSONDecodeError as e:
        print(f"JSON parse error: {e}")
        print(f"Raw output (first 500 chars): {result.stdout[:500]}")
else:
    print(f"API call failed. stderr: {result.stderr[:500]}")
    print(f"stdout: {result.stdout[:500]}")

# 6. Check if there's a report history endpoint
print(f"\n{'=' * 100}")
print("6. FETCHING REPORT HISTORY FROM VEXPENSES API")
print("=" * 100)

ps_script2 = f'''
$headers = @{{ Authorization = "Bearer {API_KEY}" }}
try {{
    $resp = Invoke-RestMethod -Uri "{API_URL}/v2/reports/10912883/history?page=1" -Method GET -Headers $headers
    $resp | ConvertTo-Json -Depth 10
}} catch {{
    Write-Output "ERROR: $($_.Exception.Message)"
    if ($_.Exception.Response) {{
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Output $reader.ReadToEnd()
    }}
}}
'''
result2 = subprocess.run(['powershell.exe', '-NoProfile', '-Command', ps_script2],
                        capture_output=True, text=True, timeout=60)
print(f"History response: {result2.stdout[:2000] if result2.stdout else 'empty'}")
if result2.stderr:
    print(f"stderr: {result2.stderr[:500]}")

# 7. Check report details from API
print(f"\n{'=' * 100}")
print("7. FETCHING REPORT DETAILS FROM VEXPENSES API")
print("=" * 100)

ps_script3 = f'''
$headers = @{{ Authorization = "Bearer {API_KEY}" }}
$resp = Invoke-RestMethod -Uri "{API_URL}/v2/reports/10912883" -Method GET -Headers $headers
$resp | ConvertTo-Json -Depth 10
'''
result3 = subprocess.run(['powershell.exe', '-NoProfile', '-Command', ps_script3],
                        capture_output=True, text=True, timeout=60)
if result3.returncode == 0 and result3.stdout.strip():
    try:
        report_data = json.loads(result3.stdout)
        rd = report_data.get('data', report_data)
        print(f"Report status: {rd.get('status')}")
        print(f"Report total_value: {rd.get('total_value')}")
        print(f"Report updated_at: {rd.get('updated_at')}")
        print(f"Report approval_date: {rd.get('approval_date')}")
        print(f"Report expense_count (if available): {rd.get('expense_count')}")
    except:
        print(f"Raw: {result3.stdout[:1000]}")

cur.close()
conn.close()
