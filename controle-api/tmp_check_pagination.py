import os, json, requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
k = os.getenv("VEXPENSES_API_KEY", "")

params = {
    "search": "date:2025-04-10,2025-04-24",
    "searchFields": "date:between",
    "paginate": "true",
    "page": "1",
    "per_page": "100",
}

r1 = requests.get("https://api.vexpenses.com/v2/expenses",
    headers={"Authorization": k, "Accept": "application/json"},
    params=params, timeout=20)
d1 = r1.json()
i1 = [e["id"] for e in d1.get("data", [])]

params["page"] = "2"
r2 = requests.get("https://api.vexpenses.com/v2/expenses",
    headers={"Authorization": k, "Accept": "application/json"},
    params=params, timeout=20)
d2 = r2.json()
i2 = [e["id"] for e in d2.get("data", [])]

print(f"Page 1: {len(i1)} expenses, first 5: {i1[:5]}")
print(f"Page 2: {len(i2)} expenses, first 5: {i2[:5]}")
print(f"Same data? {i1 == i2}")
print(f"Overlap: {len(set(i1) & set(i2))} common IDs")
print(f"Meta p1: {json.dumps(d1.get('meta', {}), indent=2)}")
print(f"Meta p2: {json.dumps(d2.get('meta', {}), indent=2)}")

# Also try without paginate
params2 = {
    "search": "date:2025-04-10,2025-04-24",
    "searchFields": "date:between",
    "per_page": "100",
}
r3 = requests.get("https://api.vexpenses.com/v2/expenses",
    headers={"Authorization": k, "Accept": "application/json"},
    params=params2, timeout=20)
d3 = r3.json()
i3 = [e["id"] for e in d3.get("data", [])]
print(f"\nWithout paginate: {len(i3)} expenses, first 5: {i3[:5]}")
print(f"Same as page 1? {i3 == i1}")
