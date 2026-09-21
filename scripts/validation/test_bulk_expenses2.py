import requests
import json
import time

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
headers = {"Authorization": API_KEY, "Accept": "application/json"}

# Test smaller date range
t0 = time.time()
params = {
    "search": "date:2026-07-01,2026-07-15",
    "searchFields": "date:between",
    "paginate": "true",
    "page": "1",
    "per_page": "200",
    "include": "user,expense_type",
}

r = requests.get(f"{API_URL}/v2/expenses", headers=headers, params=params, timeout=120)
print(f"Status: {r.status_code} ({time.time()-t0:.1f}s)")
if r.status_code == 200:
    data = r.json()
    expenses = data.get("data", [])
    meta = data.get("meta", {})
    print(f"Expenses: {len(expenses)}")
    print(f"Meta: {json.dumps(meta, default=str, indent=2)[:500]}")
    if expenses:
        e = expenses[0]
        print(f"Sample keys: {list(e.keys())[:15]}")
        print(f"Sample: id={e.get('id')}, value={e.get('value')}, title={e.get('title')}")
        print(f"  report_id/expense_id={e.get('expense_id')}, payment_method_id={e.get('payment_method_id')}")
        print(f"  user: {e.get('user')}")
else:
    print(f"Body: {r.text[:500]}")
