import requests
import json

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
headers = {"Authorization": API_KEY, "Accept": "application/json"}

# Try bulk expenses endpoint
for endpoint in ["/v2/expenses", "/v2/expenses?include=report", "/v2/expenses?per_page=5"]:
    try:
        r = requests.get(f"{API_URL}{endpoint}", headers=headers, timeout=15)
        print(f"{endpoint}: status={r.status_code}")
        if r.status_code == 200:
            data = r.json()
            d = data.get("data", [])
            print(f"  count={len(d)}")
            if d:
                print(f"  keys={list(d[0].keys())[:15]}")
                e = d[0]
                print(f"  sample: id={e.get('id')}, value={e.get('value')}, title={e.get('title')}")
                print(f"  expense_id={e.get('expense_id')}, payment_method_id={e.get('payment_method_id')}")
                # Check pagination
                meta = data.get("meta", {})
                print(f"  meta={json.dumps(meta, default=str)[:500]}")
    except Exception as e:
        print(f"{endpoint}: error={e}")
