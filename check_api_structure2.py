import requests
import json

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
headers = {"Authorization": API_KEY, "Accept": "application/json"}

resp = requests.get(f"{API_URL}/v2/reports?include=user", headers=headers, timeout=300)
data = resp.json()
reports = data.get("data", [])

r = reports[0]
print("=== Full first report ===")
print(json.dumps(r, indent=2, default=str)[:3000])

# Check user structure
print("\n=== user field ===")
print(json.dumps(r.get("user"), indent=2, default=str)[:1000])

# Check a second report to see if structure varies
print("\n=== Report 2 ===")
r2 = reports[1]
print(f"  id={r2.get('id')}")
print(f"  description={r2.get('description')}")
print(f"  status={r2.get('status')}")
user2 = r2.get("user")
if isinstance(user2, dict):
    print(f"  user keys: {list(user2.keys())}")
    if "data" in user2:
        ud = user2["data"]
        if isinstance(ud, dict):
            print(f"  user.data keys: {list(ud.keys())}")
            print(f"  user.data.cpf={ud.get('cpf')}")
            print(f"  user.data.name={ud.get('name')}")
        elif isinstance(ud, list) and ud:
            print(f"  user.data is list of {len(ud)}")
            print(f"  user.data[0] keys: {list(ud[0].keys()) if isinstance(ud[0], dict) else ud[0]}")
