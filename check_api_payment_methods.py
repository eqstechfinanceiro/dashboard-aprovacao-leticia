import requests
import json

API_URL = "https://api.vexpenses.com"
TOKEN = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
headers = {"Authorization": TOKEN, "Accept": "application/json"}

# Check payment methods for FATURA vs CAIXA reports for CARLOS
# FATURA reports
fatura_ids = [9234647, 10143254, 7725344, 7676452, 8171087]
# CAIXA reports
caixa_ids = [7628615, 7848877, 8090604]
# CORREÇÃO ITAU
itau_ids = [8894343]

def check_report(report_id, label):
    resp = requests.get(f"{API_URL}/v2/reports/{report_id}?include=expenses.user", headers=headers, timeout=60)
    if resp.status_code != 200:
        print(f"  {label}: ERROR {resp.status_code}")
        return
    data = resp.json().get('data', {})
    expenses = data.get('expenses', {}).get('data', [])
    print(f"\n  {label} (id={report_id}): {len(expenses)} expenses")
    for e in expenses[:3]:
        pm = e.get('payment_method', {})
        pm_name = ''
        if isinstance(pm, dict):
            pm_name = pm.get('data', {}).get('name', '') or pm.get('name', '')
        pm_id = e.get('payment_method_id', '')
        print(f"    expense id={e['id']} | value={e.get('value')} | payment_method_id={pm_id} | payment_method={pm_name} | desc={e.get('title', e.get('description', ''))}")

print("=" * 60)
print("FATURA reports:")
for rid in fatura_ids:
    check_report(rid, f"FATURA {rid}")

print("\n" + "=" * 60)
print("CAIXA reports:")
for rid in caixa_ids:
    check_report(rid, f"CAIXA {rid}")

print("\n" + "=" * 60)
print("ITAU reports:")
for rid in itau_ids:
    check_report(rid, f"ITAU {rid}")

# Also check what payment methods exist in the API
print("\n" + "=" * 60)
print("Available payment methods:")
resp = requests.get(f"{API_URL}/v2/payment-methods", headers=headers, timeout=30)
if resp.status_code == 200:
    methods = resp.json().get('data', [])
    for m in methods:
        print(f"  id={m.get('id')} | name={m.get('name')} | type={m.get('type', '')}")
else:
    print(f"  ERROR {resp.status_code}: {resp.text[:200]}")
