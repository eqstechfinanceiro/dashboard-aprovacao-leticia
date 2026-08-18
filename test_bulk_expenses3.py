import requests
import json
import time

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
headers = {"Authorization": API_KEY, "Accept": "application/json"}

def fetch_expenses_by_date(start, end, per_page=200):
    all_expenses = []
    page = 1
    t0 = time.time()
    while True:
        params = {
            "search": f"date:{start},{end}",
            "searchFields": "date:between",
            "paginate": "true",
            "page": str(page),
            "per_page": str(per_page),
        }
        r = requests.get(f"{API_URL}/v2/expenses", headers=headers, params=params, timeout=120)
        if r.status_code != 200:
            print(f"  page {page}: status {r.status_code}, body={r.text[:200]}")
            break
        data = r.json()
        expenses = data.get("data", [])
        if not expenses:
            break
        all_expenses.extend(expenses)
        if len(expenses) < per_page:
            break
        page += 1
    print(f"  {start} to {end}: {len(all_expenses)} expenses in {time.time()-t0:.1f}s")
    return all_expenses

# Test month
fetch_expenses_by_date("2026-07-01", "2026-07-31")

# Test 15 days
fetch_expenses_by_date("2026-07-01", "2026-07-15")

# Test 7 days
fetch_expenses_by_date("2026-07-01", "2026-07-07")
