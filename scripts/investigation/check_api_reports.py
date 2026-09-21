import requests
import json

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
headers = {"Authorization": API_KEY, "Accept": "application/json"}

# Get all reports
print("Fetching all reports...", flush=True)
resp = requests.get(f"{API_URL}/v2/reports?include=user", headers=headers, timeout=120)
all_reports = resp.json().get("data", [])
print(f"Total reports: {len(all_reports)}", flush=True)

# Find reports for our 4 users
TARGET_USERS = {
    923558: "ADAN",
    895985: "ANDRE",
    896018: "CARLOS",
    896053: "DHIEGO",
}

def is_fatura(name):
    n = (name or "").upper()
    return "FATURA" in n or "CARTAO" in n or "CARTÃO" in n

user_reports = {}
for r in all_reports:
    user = r.get("user", {})
    user_data = user.get("data", {}) if isinstance(user, dict) else {}
    uid = user_data.get("id")
    if uid not in TARGET_USERS:
        continue
    if is_fatura(r.get("description") or r.get("name")):
        continue
    if uid not in user_reports:
        user_reports[uid] = []
    user_reports[uid].append(r)

for uid, reports in user_reports.items():
    name = TARGET_USERS[uid]
    print(f"\n{name} (userId={uid}): {len(reports)} reports")
    for r in reports:
        print(f"  id={r['id']:8d} | status={r.get('status',''):10s} | name={r.get('name','') or r.get('description',''):30s} | total={r.get('total_value',0)}")

# Test: fetch expenses for a specific report
print(f"\n--- Testing expenses per report ---", flush=True)
# Pick ADAN's CAIXA 07/2026 report
adan_reports = user_reports.get(923558, [])
for r in adan_reports:
    rname = (r.get('name','') or r.get('description','')).upper()
    if '07/2026' in rname or '08/2026' in rname:
        rid = r['id']
        print(f"\n  Fetching expenses for report {rid} ({r.get('name','')})...", flush=True)
        resp = requests.get(f"{API_URL}/v2/reports/{rid}/expenses", headers=headers, timeout=60)
        print(f"  Status: {resp.status_code}", flush=True)
        if resp.status_code == 200:
            expenses = resp.json().get("data", [])
            print(f"  Expenses: {len(expenses)}", flush=True)
            for e in expenses[:5]:
                print(f"    id={e['id']} | date={e.get('date','')} | value={e.get('value',0)} | converted={e.get('converted_value',0)}")
        else:
            print(f"  Body: {resp.text[:200]}", flush=True)

# Also check ANDRE's missing reports (May/Jun/Jul 2026)
print(f"\n--- ANDRE reports check ---", flush=True)
andre_reports = user_reports.get(895985, [])
for r in andre_reports:
    rname = (r.get('name','') or r.get('description','')).upper()
    print(f"  id={r['id']:8d} | status={r.get('status',''):10s} | name={rname:30s} | total={r.get('total_value',0)}")
