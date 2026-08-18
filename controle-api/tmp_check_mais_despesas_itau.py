#!/usr/bin/env python3
"""
Check the 22 'MAIS DESPESAS NO NEON' reports — are their extra expenses Itaú?
Also check 'MAIS DESPESAS NO REF' and 'VALOR DIFERENTE'.
"""
import os, requests, json, time
import openpyxl
from dotenv import load_dotenv
from pathlib import Path
from collections import Counter

load_dotenv(Path(__file__).parent / ".env")
API_KEY = os.getenv("VEXPENSES_API_KEY", "")
BASE_URL = os.getenv("VEXPENSES_BASE_URL", "https://api.vexpenses.com")
HEADERS = {"Authorization": API_KEY, "Accept": "application/json"}

PM_ITAU = 627401  # Cartão Corporativo Itaú

# Read MAIS DESPESAS NO NEON from the generated excel
xlsx_path = Path(r"C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\controle-api\data\gap_analysis_itau_detail.xlsx")
wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
ws = wb["MAIS DESPESAS + ITAU"]
mais_neon = []
for row in ws.iter_rows(values_only=True):
    if row[0] is None or row[0] == "Report ID":
        continue
    mais_neon.append({
        "report_id": row[0], "name": row[1], "user": row[2], "status": row[3],
        "ref_count": row[4], "neon_count": row[5], "diff_count": row[6],
        "ref_total": row[7], "neon_total": row[8], "diff_value": row[9],
        "api_status": row[10], "n_itau": row[11], "n_non_itau": row[12], "category": row[13],
    })
wb.close()

print(f"MAIS DESPESAS NO NEON: {len(mais_neon)} reports")
print()

# For each report, fetch ALL expenses from API and check which are Itaú
print("="*120)
print("CHECKING EXTRA EXPENSES IN MAIS DESPESAS REPORTS")
print("="*120)
print(f"{'RID':<12} {'Name':<35} {'Status':<10} {'Ref#':>5} {'Neon#':>6} {'Diff#':>5} {'Diff R$':>10} {'API Itaú':>9} {'API NonItaú':>11} {'Extra Itaú?'}")
print("-"*130)

total_diff_itau = 0
total_diff_non_itau = 0

for r in sorted(mais_neon, key=lambda x: -x["diff_value"]):
    rid = r["report_id"]
    time.sleep(0.4)
    try:
        resp = requests.get(f"{BASE_URL}/v2/reports/{rid}?include=expenses.payment_method", headers=HEADERS, timeout=30)
        if resp.status_code != 200:
            print(f"{rid:<12} {str(r['name'])[:34]:<35} ERROR {resp.status_code}")
            continue
        data = resp.json().get("data", {})
        expenses = data.get("expenses", {}).get("data", [])
        
        itau_count = 0
        non_itau_count = 0
        itau_value = 0
        non_itau_value = 0
        for exp in expenses:
            pm = exp.get("payment_method", {})
            if isinstance(pm, dict):
                pm_data = pm.get("data", {})
                pm_name = pm_data.get("description", "")
            else:
                pm_name = ""
            is_itau = "itau" in pm_name.lower() or "itaú" in pm_name.lower()
            if is_itau:
                itau_count += 1
                itau_value += float(exp.get("value", 0) or 0)
            else:
                non_itau_count += 1
                non_itau_value += float(exp.get("value", 0) or 0)
        
        # The diff is the extra expenses. If all expenses are Itaú, the extras are Itaú too
        diff_count = r["diff_count"] or 0
        diff_value = r["diff_value"] or 0
        
        if itau_count == len(expenses) and len(expenses) > 0:
            extra_itau = "YES (all Itaú)"
            total_diff_itau += diff_value
        elif non_itau_count > 0 and itau_count > 0:
            extra_itau = f"MIXED ({itau_count} Itaú / {non_itau_count} other)"
            total_diff_non_itau += diff_value
        else:
            extra_itau = "NO (all non-Itaú)"
            total_diff_non_itau += diff_value
        
        print(f"{rid:<12} {str(r['name'])[:34]:<35} {str(r['status']):<10} {r['ref_count']:>5} {r['neon_count']:>6} {diff_count:>5} R$ {diff_value:>8.2f} {itau_count:>9} {non_itau_count:>11} {extra_itau}")
    except Exception as e:
        print(f"{rid:<12} {str(r['name'])[:34]:<35} ERROR: {e}")

print()
print("="*120)
print("SUMMARY")
print("="*120)
print(f"  Total MAIS DESPESAS diff value: R$ {sum(r['diff_value'] or 0 for r in mais_neon):.2f}")
print(f"  Diff from 100% Itaú reports: R$ {total_diff_itau:.2f}")
print(f"  Diff from mixed/non-Itaú reports: R$ {total_diff_non_itau:.2f}")
