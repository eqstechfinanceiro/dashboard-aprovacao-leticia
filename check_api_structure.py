import requests
import json

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
headers = {"Authorization": API_KEY, "Accept": "application/json"}

resp = requests.get(f"{API_URL}/v2/reports?include=user", headers=headers, timeout=300)
data = resp.json()
reports = data.get("data", [])
print(f"Total reports: {len(reports)}")
if reports:
    r = reports[0]
    print(f"Keys: {list(r.keys())}")
    print(f"Sample report:")
    print(f"  id={r.get('id')}")
    print(f"  name={r.get('name')}")
    print(f"  status={r.get('status')}")
    print(f"  user_cpf={r.get('user_cpf')}")
    print(f"  user_name={r.get('user_name')}")
    user = r.get("user")
    if user:
        if isinstance(user, dict):
            print(f"  user.data keys: {list(user.keys())}")
            print(f"  user.data.cpf={user.get('cpf')}")
            print(f"  user.data.name={user.get('name')}")
        elif isinstance(user, str):
            print(f"  user is string: {user[:100]}")
    # Print first 5 reports
    print("\nFirst 5 reports:")
    for r in reports[:5]:
        print(f"  id={r.get('id')}, name={r.get('name')}, status={r.get('status')}, user_cpf={r.get('user_cpf')}")
        if r.get("user") and isinstance(r["user"], dict):
            print(f"    user.cpf={r['user'].get('cpf')}, user.name={r['user'].get('name')}")
