import requests
import time

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
headers = {"Authorization": API_KEY, "Accept": "application/json"}

# 1. Get all reports, build filtered set
print("Fetching reports...", flush=True)
resp = requests.get(f"{API_URL}/v2/reports?include=user", headers=headers, timeout=60)
all_reports = resp.json().get("data", [])

def is_fatura(name):
    n = (name or "").upper()
    return "FATURA" in n or "CARTAO" in n or "CARTÃO" in n

def is_aprovado(status):
    s = (status or "").upper()
    return "APROVADO" in s or "ENVIADO" in s

filtered_report_ids = set()
all_report_ids = set()
for r in all_reports:
    all_report_ids.add(r["id"])
    user = r.get("user", {})
    user_data = user.get("data", {}) if isinstance(user, dict) else {}
    cpf = user_data.get("cpf", "")
    if not cpf:
        continue
    if not is_aprovado(r.get("status")):
        continue
    if is_fatura(r.get("description")):
        continue
    filtered_report_ids.add(r["id"])

print(f"Total reports: {len(all_report_ids)}", flush=True)
print(f"Filtered reports (APROVADO/ENVIADO, no FATURA, has CPF): {len(filtered_report_ids)}", flush=True)

# 2. Fetch expenses for the dense chunk (Apr 23-29) and check how many match
print("\nFetching expenses for 2025-04-23..2025-04-29...", flush=True)
all_expenses = []
page = 1
t0 = time.time()
while True:
    params = {
        "search": "date:2025-04-23,2025-04-29",
        "searchFields": "date:between",
        "paginate": "true",
        "page": str(page),
        "per_page": "100",
    }
    r = requests.get(f"{API_URL}/v2/expenses", headers=headers, params=params, timeout=60)
    if r.status_code != 200:
        print(f"  page {page}: status {r.status_code}", flush=True)
        break
    expenses = r.json().get("data", [])
    if not expenses:
        break
    all_expenses.extend(expenses)
    if len(expenses) < 100:
        break
    page += 1

print(f"  Total expenses in chunk: {len(all_expenses)} in {time.time()-t0:.1f}s", flush=True)

# 3. Check how many match filtered reports
matched = 0
unmatched = 0
unmatched_report_ids = set()
for e in all_expenses:
    rid = e.get("expense_id")  # this is the report ID
    if rid in filtered_report_ids:
        matched += 1
    else:
        unmatched += 1
        unmatched_report_ids.add(rid)

print(f"\n  Matched (in filtered reports): {matched} ({matched/len(all_expenses)*100:.1f}%)", flush=True)
print(f"  Unmatched (will be discarded): {unmatched} ({unmatched/len(all_expenses)*100:.1f}%)", flush=True)
print(f"  Unique unmatched report IDs: {len(unmatched_report_ids)}", flush=True)

# Check status of unmatched reports
unmatched_statuses = {}
for r in all_reports:
    if r["id"] in unmatched_report_ids:
        status = r.get("status", "UNKNOWN")
        is_f = is_fatura(r.get("description"))
        key = f"{status}{' (FATURA)' if is_f else ''}"
        unmatched_statuses[key] = unmatched_statuses.get(key, 0) + 1

print(f"\n  Unmatched report breakdown:", flush=True)
for k, v in sorted(unmatched_statuses.items(), key=lambda x: -x[1]):
    print(f"    {k}: {v}", flush=True)
