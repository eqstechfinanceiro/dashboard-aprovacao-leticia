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
for r in all_reports:
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

print(f"Filtered reports: {len(filtered_report_ids)}", flush=True)

# 2. Sample first 3 pages of dense chunk
print("\nSampling 2025-04-23..2025-04-29 (first 3 pages only)...", flush=True)
sample_expenses = []
for page in range(1, 4):
    params = {
        "search": "date:2025-04-23,2025-04-29",
        "searchFields": "date:between",
        "paginate": "true",
        "page": str(page),
        "per_page": "100",
    }
    r = requests.get(f"{API_URL}/v2/expenses", headers=headers, params=params, timeout=(10, 30))
    if r.status_code != 200:
        print(f"  page {page}: status {r.status_code}", flush=True)
        break
    expenses = r.json().get("data", [])
    if not expenses:
        break
    sample_expenses.extend(expenses)
    print(f"  page {page}: {len(expenses)} expenses", flush=True)

print(f"  Sample total: {len(sample_expenses)} expenses", flush=True)

# 3. Check match rate
matched = 0
unmatched = 0
unmatched_report_ids = set()
for e in sample_expenses:
    rid = e.get("expense_id")
    if rid in filtered_report_ids:
        matched += 1
    else:
        unmatched += 1
        unmatched_report_ids.add(rid)

pct = matched / len(sample_expenses) * 100 if sample_expenses else 0
print(f"\n  Matched (will use): {matched} ({pct:.1f}%)", flush=True)
print(f"  Unmatched (discarded): {unmatched} ({100-pct:.1f}%)", flush=True)
print(f"  Unique unmatched reports: {len(unmatched_report_ids)}", flush=True)

# Check what these unmatched reports are
report_map = {r["id"]: r for r in all_reports}
print(f"\n  Unmatched report breakdown:", flush=True)
for rid in list(unmatched_report_ids)[:20]:
    r = report_map.get(rid)
    if r:
        status = r.get("status", "?")
        desc = r.get("description", "?")
        print(f"    {rid}: status={status}, desc={desc[:40]}", flush=True)
    else:
        print(f"    {rid}: NOT IN REPORTS LIST", flush=True)
