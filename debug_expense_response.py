import requests
import json

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
headers = {"Authorization": API_KEY, "Accept": "application/json"}

REPORT_ID = 11073774  # ADAN's CAIXA 07/2026

resp = requests.get(f"{API_URL}/v2/reports/{REPORT_ID}?include=expenses.user", headers=headers, timeout=60)
print(f"Status: {resp.status_code}")
data = resp.json()

# The response has a 'data' wrapper
report_data = data.get('data', data)

# Print all top-level keys
print(f"\nTop-level keys: {list(data.keys())}")
print(f"Report data keys: {list(report_data.keys())}")

# Check expenses structure
expenses = report_data.get('expenses', {})
print(f"\nExpenses type: {type(expenses)}")
if isinstance(expenses, dict):
    print(f"Expenses keys: {list(expenses.keys())}")
    exp_data = expenses.get('data', [])
    print(f"Expenses data count: {len(exp_data)}")
    if exp_data:
        print(f"First expense keys: {list(exp_data[0].keys())}")
        print(f"First expense: {json.dumps(exp_data[0], indent=2, default=str)[:500]}")
elif isinstance(expenses, list):
    print(f"Expenses list count: {len(expenses)}")
    if expenses:
        print(f"First expense: {json.dumps(expenses[0], indent=2, default=str)[:500]}")

# Also check if expenses are nested differently
for key in data:
    val = data[key]
    if isinstance(val, dict) and 'data' in val:
        inner = val['data']
        if isinstance(inner, list) and len(inner) > 0:
            print(f"\nKey '{key}' has {len(inner)} items in .data")
    elif isinstance(val, list) and len(val) > 0:
        print(f"\nKey '{key}' is a list with {len(val)} items")
