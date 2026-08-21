import requests
import time

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
headers = {"Authorization": API_KEY, "Accept": "application/json"}

# Get reports first
print("Fetching reports...", flush=True)
resp = requests.get(f"{API_URL}/v2/reports?include=user", headers=headers, timeout=60)
all_reports = resp.json().get("data", [])

def is_fatura(name):
    n = (name or "").upper()
    return "FATURA" in n or "CARTAO" in n or "CARTÃO" in n

def is_aprovado(status):
    s = (status or "").upper()
    return "APROVADO" in s or "ENVIADO" in s

# Get filtered user_ids
filtered_user_ids = set()
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
    filtered_user_ids.add(user_data.get("id"))

print(f"Filtered unique user IDs: {len(filtered_user_ids)}", flush=True)

# Test 1: Search by user_id (single)
test_uid = list(filtered_user_ids)[0]
print(f"\nTest 1: search by user_id={test_uid}...", flush=True)
params = {
    "search": f"user_id:{test_uid}",
    "searchFields": "user_id:=",
    "paginate": "true",
    "page": "1",
    "per_page": "100",
}
r = requests.get(f"{API_URL}/v2/expenses", headers=headers, params=params, timeout=30)
print(f"  Status: {r.status_code}", flush=True)
if r.status_code == 200:
    expenses = r.json().get("data", [])
    print(f"  Expenses: {len(expenses)}", flush=True)
else:
    print(f"  Body: {r.text[:200]}", flush=True)

# Test 2: Search by user_id + date range
print(f"\nTest 2: user_id={test_uid} + date range...", flush=True)
params = {
    "search": f"user_id:{test_uid};date:2025-01-01,2026-12-31",
    "searchFields": "user_id:=;date:between",
    "paginate": "true",
    "page": "1",
    "per_page": "100",
}
r = requests.get(f"{API_URL}/v2/expenses", headers=headers, params=params, timeout=30)
print(f"  Status: {r.status_code}", flush=True)
if r.status_code == 200:
    expenses = r.json().get("data", [])
    print(f"  Expenses: {len(expenses)}", flush=True)
    if expenses:
        print(f"  Sample: id={expenses[0].get('id')}, expense_id={expenses[0].get('expense_id')}, pmid={expenses[0].get('payment_method_id')}", flush=True)
else:
    print(f"  Body: {r.text[:200]}", flush=True)

# Test 3: Search by multiple user_ids with date range
print(f"\nTest 3: 10 user_ids + date range...", flush=True)
test_uids = list(filtered_user_ids)[:10]
search = ";".join([f"user_id:{uid}" for uid in test_uids])
search_fields = ";".join(["user_id:="] * len(test_uids))
params = {
    "search": f"{search};date:2025-01-01,2026-12-31",
    "searchFields": f"{search_fields};date:between",
    "searchJoin": "or",
    "paginate": "true",
    "page": "1",
    "per_page": "100",
}
r = requests.get(f"{API_URL}/v2/expenses", headers=headers, params=params, timeout=30)
print(f"  Status: {r.status_code}", flush=True)
if r.status_code == 200:
    expenses = r.json().get("data", [])
    print(f"  Expenses: {len(expenses)} for 10 users", flush=True)
else:
    print(f"  Body: {r.text[:200]}", flush=True)

# Test 4: Search by user_id with date range, paginate=false
print(f"\nTest 4: user_id={test_uid}, paginate=false...", flush=True)
params = {
    "search": f"user_id:{test_uid}",
    "searchFields": "user_id:=",
    "paginate": "false",
    "per_page": "1000",
}
r = requests.get(f"{API_URL}/v2/expenses", headers=headers, params=params, timeout=60)
print(f"  Status: {r.status_code}", flush=True)
if r.status_code == 200:
    expenses = r.json().get("data", [])
    print(f"  Expenses: {len(expenses)} (all for user)", flush=True)
else:
    print(f"  Body: {r.text[:200]}", flush=True)
