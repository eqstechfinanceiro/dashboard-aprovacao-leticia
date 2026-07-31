#!/usr/bin/env python3
"""Fetch payment methods from API and map them to expenses."""
import os, requests, json, time
from dotenv import load_dotenv
from pathlib import Path
from collections import Counter

load_dotenv(Path(__file__).parent / ".env")
API_KEY = os.getenv("VEXPENSES_API_KEY", "")
BASE_URL = os.getenv("VEXPENSES_BASE_URL", "https://api.vexpenses.com")
HEADERS = {"Authorization": API_KEY, "Accept": "application/json"}

# 1. Fetch payment methods
print("=== Fetching payment methods ===")
resp = requests.get(f"{BASE_URL}/v2/payment-methods", headers=HEADERS, timeout=30)
print(f"Status: {resp.status_code}")
if resp.status_code == 200:
    pm_data = resp.json().get("data", [])
    pm_map = {}
    for pm in pm_data:
        pm_map[pm["id"]] = pm.get("name", pm.get("description", ""))
        print(f"  id={pm['id']} | name={pm.get('name', '')} | description={pm.get('description', '')}")
else:
    print(f"  Error: {resp.text[:300]}")
    pm_map = {}

# 2. Check expense types
print("\n=== Fetching expense types ===")
resp2 = requests.get(f"{BASE_URL}/v2/expense-types", headers=HEADERS, timeout=30)
print(f"Status: {resp2.status_code}")
if resp2.status_code == 200:
    et_data = resp2.json().get("data", [])
    et_map = {}
    for et in et_data[:20]:
        et_map[et["id"]] = et.get("name", et.get("description", ""))
        print(f"  id={et['id']} | name={et.get('name', '')}")
    if len(et_data) > 20:
        print(f"  ... and {len(et_data)-20} more")
else:
    et_map = {}

# 3. Now check Jackson's report expenses with payment method names
print("\n=== Jackson's report (7841173) expenses with payment method names ===")
rid = 7841173
resp3 = requests.get(f"{BASE_URL}/v2/reports/{rid}?include=expenses", headers=HEADERS, timeout=30)
data = resp3.json().get("data", {})
expenses = data.get("expenses", {}).get("data", [])
pm_counter = Counter()
et_counter = Counter()
for e in expenses:
    pm_id = e.get("payment_method_id")
    et_id = e.get("expense_type_id")
    pm_name = pm_map.get(pm_id, f"UNKNOWN({pm_id})")
    et_name = et_map.get(et_id, f"UNKNOWN({et_id})")
    pm_counter[pm_name] += 1
    et_counter[et_name] += 1

print(f"Payment methods:")
for name, cnt in pm_counter.most_common():
    print(f"  {name}: {cnt}")
print(f"Expense types:")
for name, cnt in et_counter.most_common():
    print(f"  {name}: {cnt}")

# 4. Check a few more reports for payment methods
print("\n=== Checking payment methods for all 60 reports ===")
import openpyxl
xlsx_path = Path(r"C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\controle-api\data\gap entre referencia e neon ahahahahaah.xlsx")
wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
ws = wb["REPORTS SO NO NEON"]
rows = list(ws.iter_rows(values_only=True))
wb.close()

reports = []
for row in rows[1:]:
    if row[0] is None:
        continue
    reports.append({"report_id": row[0], "name": row[1], "user": row[2], "total": float(row[6]) if row[6] else 0})

all_pm = Counter()
report_pm = {}
for r in reports:
    rid = r["report_id"]
    time.sleep(0.3)
    try:
        resp = requests.get(f"{BASE_URL}/v2/reports/{rid}?include=expenses", headers=HEADERS, timeout=30)
        if resp.status_code != 200:
            continue
        data = resp.json().get("data", {})
        expenses = data.get("expenses", {}).get("data", [])
        pm_ids = Counter()
        for e in expenses:
            pm_id = e.get("payment_method_id")
            pm_name = pm_map.get(pm_id, f"UNKNOWN({pm_id})")
            pm_ids[pm_name] += 1
            all_pm[pm_name] += 1
        report_pm[rid] = dict(pm_ids)
    except:
        continue

print(f"\nOverall payment method distribution across all 60 reports:")
for name, cnt in all_pm.most_common():
    print(f"  {name}: {cnt} expenses")

# 5. Show reports with Itau
print(f"\n=== Reports with Itau payment method ===")
itau_reports = []
for rid, pms in report_pm.items():
    r = next((x for x in reports if x["report_id"] == rid), None)
    if not r:
        continue
    has_itau = any("itau" in str(k).lower() or "itaú" in str(k).lower() for k in pms.keys())
    if has_itau:
        itau_reports.append((rid, r["name"], r["total"], pms))
        print(f"  rid={rid} | {r['name']} | R$ {r['total']:.2f} | {pms}")

if not itau_reports:
    print("  NONE found")
    # Show all unique payment method names to understand what's available
    print(f"\n  All unique payment method names found:")
    for name in all_pm.keys():
        print(f"    {name}")
