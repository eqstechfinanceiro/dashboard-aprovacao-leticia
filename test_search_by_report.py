import requests
import time

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
headers = {"Authorization": API_KEY, "Accept": "application/json"}

# Test: can we search expenses by expense_id (report_id)?
# Try with a single report_id first
test_rid = 7603397  # a known filtered report

print(f"Testing search by expense_id={test_rid}...", flush=True)
params = {
    "search": f"expense_id:{test_rid}",
    "searchFields": "expense_id:=",
    "paginate": "true",
    "page": "1",
    "per_page": "100",
}
r = requests.get(f"{API_URL}/v2/expenses", headers=headers, params=params, timeout=30)
print(f"  Status: {r.status_code}", flush=True)
if r.status_code == 200:
    data = r.json()
    expenses = data.get("data", [])
    print(f"  Expenses: {len(expenses)}", flush=True)
    if expenses:
        print(f"  Sample: id={expenses[0].get('id')}, expense_id={expenses[0].get('expense_id')}, value={expenses[0].get('value')}", flush=True)
else:
    print(f"  Body: {r.text[:300]}", flush=True)

# Test with multiple report IDs using searchJoin=or
print(f"\nTesting search with multiple expense_ids (OR)...", flush=True)
test_rids = [7603397, 7652117, 7718339, 7785900, 7897474]
search = ";".join([f"expense_id:{rid}" for rid in test_rids])
search_fields = ";".join(["expense_id:="] * len(test_rids))
params = {
    "search": search,
    "searchFields": search_fields,
    "searchJoin": "or",
    "paginate": "true",
    "page": "1",
    "per_page": "100",
}
r = requests.get(f"{API_URL}/v2/expenses", headers=headers, params=params, timeout=30)
print(f"  Status: {r.status_code}", flush=True)
if r.status_code == 200:
    data = r.json()
    expenses = data.get("data", [])
    print(f"  Expenses: {len(expenses)} for {len(test_rids)} reports", flush=True)
    # Check which reports they belong to
    rids_found = set(e.get("expense_id") for e in expenses)
    print(f"  Report IDs found: {rids_found}", flush=True)
else:
    print(f"  Body: {r.text[:300]}", flush=True)

# Test with 50 report IDs
print(f"\nTesting with 50 report IDs...", flush=True)
# First get 50 filtered report IDs
resp = requests.get(f"{API_URL}/v2/reports?include=user", headers=headers, timeout=60)
all_reports = resp.json().get("data", [])

def is_fatura(name):
    n = (name or "").upper()
    return "FATURA" in n or "CARTAO" in n or "CARTÃO" in n

def is_aprovado(status):
    s = (status or "").upper()
    return "APROVADO" in s or "ENVIADO" in s

filtered_rids = []
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
    filtered_rids.append(r["id"])
    if len(filtered_rids) >= 50:
        break

print(f"  Using {len(filtered_rids)} report IDs", flush=True)
search = ";".join([f"expense_id:{rid}" for rid in filtered_rids])
search_fields = ";".join(["expense_id:="] * len(filtered_rids))
params = {
    "search": search,
    "searchFields": search_fields,
    "searchJoin": "or",
    "paginate": "true",
    "page": "1",
    "per_page": "100",
}
t0 = time.time()
r = requests.get(f"{API_URL}/v2/expenses", headers=headers, params=params, timeout=60)
print(f"  Status: {r.status_code} ({time.time()-t0:.1f}s)", flush=True)
if r.status_code == 200:
    data = r.json()
    expenses = data.get("data", [])
    print(f"  Expenses: {len(expenses)} for 50 reports", flush=True)
    if len(expenses) == 100:
        print(f"  (might have more pages)", flush=True)
else:
    print(f"  Body: {r.text[:300]}", flush=True)
