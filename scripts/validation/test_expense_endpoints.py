import requests
import json

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
headers = {"Authorization": API_KEY, "Accept": "application/json"}

# Try different endpoints for expenses per report
REPORT_ID = 11073774  # ADAN's CAIXA 07/2026

endpoints = [
    f"/v2/reports/{REPORT_ID}/expenses",
    f"/v2/expenses?report_id={REPORT_ID}",
    f"/v2/expenses?search=report_id:{REPORT_ID}&searchFields=report_id:=&paginate=false&per_page=1000",
    f"/v2/expenses?search=report_id:{REPORT_ID}&searchFields=report_id:=&paginate=true&per_page=100&page=1",
    f"/v2/reports/{REPORT_ID}?include=expenses",
    f"/v2/reports/{REPORT_ID}?include=expenses.user",
]

for ep in endpoints:
    url = f"{API_URL}{ep}"
    print(f"\nGET {ep[:80]}...", flush=True)
    try:
        r = requests.get(url, headers=headers, timeout=30)
        print(f"  Status: {r.status_code}", flush=True)
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, dict):
                if 'data' in data:
                    d = data['data']
                    if isinstance(d, list):
                        print(f"  Items: {len(d)}", flush=True)
                        if d:
                            print(f"  First item keys: {list(d[0].keys())[:10]}", flush=True)
                    elif isinstance(d, dict):
                        print(f"  Dict keys: {list(d.keys())[:10]}", flush=True)
                        if 'expenses' in d:
                            print(f"  Expenses: {len(d['expenses'].get('data', []))}", flush=True)
                else:
                    print(f"  Keys: {list(data.keys())[:10]}", flush=True)
            else:
                print(f"  Type: {type(data)}", flush=True)
        else:
            print(f"  Body: {r.text[:200]}", flush=True)
    except Exception as e:
        print(f"  Error: {e}", flush=True)

# Also try: get expenses with report_id filter using search
print(f"\n--- Try search with report_id ---", flush=True)
params = {
    "search": f"report_id:{REPORT_ID}",
    "searchFields": "report_id:=",
    "paginate": "true",
    "per_page": "50",
    "page": "1",
}
r = requests.get(f"{API_URL}/v2/expenses", headers=headers, params=params, timeout=30)
print(f"  Status: {r.status_code}", flush=True)
if r.status_code == 200:
    expenses = r.json().get("data", [])
    print(f"  Expenses: {len(expenses)}", flush=True)
    if expenses:
        print(f"  First: {json.dumps(expenses[0], indent=2, default=str)[:300]}", flush=True)
else:
    print(f"  Body: {r.text[:300]}", flush=True)
