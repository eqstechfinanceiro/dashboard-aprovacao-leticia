import requests
import json
import time

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
headers = {"Authorization": API_KEY, "Accept": "application/json"}

# Test 1: reports with per_page=1 and expenses include
print("=== Test 1: reports?include=expenses,user&per_page=1 ===")
r = requests.get(f"{API_URL}/v2/reports?include=expenses,user&per_page=1", headers=headers, timeout=60)
print(f"Status: {r.status_code}")
if r.status_code == 200:
    data = r.json()
    d = data.get("data", [])
    if d:
        r0 = d[0]
        print(f"Report: {r0.get('description')}")
        print(f"Keys: {list(r0.keys())}")
        if "expenses" in r0:
            exp = r0["expenses"]
            if isinstance(exp, dict):
                ed = exp.get("data", [])
                print(f"EXPENSES: {len(ed)}")
                if ed:
                    print(f"  sample keys: {list(ed[0].keys())[:10]}")
            elif isinstance(exp, list):
                print(f"EXPENSES: {len(exp)}")
        else:
            print("NO expenses in bulk")
    meta = data.get("meta", {})
    print(f"Meta: {json.dumps(meta, default=str)[:300]}")
else:
    print(f"Body: {r.text[:300]}")

time.sleep(2)

# Test 2: Check meta/pagination from regular reports call
print("\n=== Test 2: reports?include=user (check pagination) ===")
r2 = requests.get(f"{API_URL}/v2/reports?include=user&per_page=1", headers=headers, timeout=60)
print(f"Status: {r2.status_code}")
if r2.status_code == 200:
    data2 = r2.json()
    meta2 = data2.get("meta", {})
    print(f"Meta: {json.dumps(meta2, default=str)[:500]}")

time.sleep(2)

# Test 3: Try expenses endpoint with POST (maybe it needs POST with body)
print("\n=== Test 3: POST /v2/expenses ===")
r3 = requests.post(f"{API_URL}/v2/expenses", headers={**headers, "Content-Type": "application/json"}, json={"user_id": 895944}, timeout=15)
print(f"Status: {r3.status_code}")
print(f"Body: {r3.text[:300]}")

time.sleep(2)

# Test 4: Try /v2/expenses with filter parameters that match report structure
print("\n=== Test 4: expenses with various filter combos ===")
for params in [
    "?expense_id=7603397&user_id=895944",
    "?report_id=7603397&user_id=895944",
    "?user_id=895944&company_id=1825947",
    "?paying_company_id=1861279&user_id=895944",
    "?user_id=895944&date_start=2025-01-01&date_end=2026-12-31",
]:
    r4 = requests.get(f"{API_URL}/v2/expenses{params}", headers=headers, timeout=15)
    print(f"  {params}: {r4.status_code} -> {r4.text[:150]}")
    time.sleep(1)
