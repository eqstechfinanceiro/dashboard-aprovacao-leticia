#!/usr/bin/env python3
"""
1. Re-sync all 60 'reports only in Neon' from VExpenses API (current status + expense count)
2. Simulate filters to see impact on the gap analysis
"""
import os, requests, time, json, re, unicodedata
import openpyxl
from dotenv import load_dotenv
from pathlib import Path
from collections import Counter

load_dotenv(Path(__file__).parent / ".env")
API_KEY = os.getenv("VEXPENSES_API_KEY", "")
BASE_URL = os.getenv("VEXPENSES_BASE_URL", "https://api.vexpenses.com")
HEADERS = {"Authorization": API_KEY, "Accept": "application/json"}

# Read the gap file
xlsx_path = Path(r"C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\controle-api\data\gap entre referencia e neon ahahahahaah.xlsx")
wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
ws = wb["REPORTS SO NO NEON"]
rows = list(ws.iter_rows(values_only=True))
wb.close()

reports = []
for row in rows[1:]:
    if row[0] is None:
        continue
    reports.append({
        "report_id": row[0], "name": row[1], "user": row[2],
        "status_db": row[4], "n_exp_db": row[5],
        "total_db": float(row[6]) if row[6] else 0,
    })

print(f"Total reports to check: {len(reports)}")
print()

# 1. Re-sync from API
print("="*100)
print("RE-SYNC FROM VEXPENSES API")
print("="*100)
print(f"{'RID':<12} {'Name':<35} {'DB Status':<12} {'API Status':<12} {'DB Exp':>6} {'API Exp':>6} {'DB Total':>12} {'API Total':>12} {'Changed?'}")
print("-"*130)

api_data = {}
for r in reports:
    rid = r["report_id"]
    time.sleep(0.3)
    try:
        resp = requests.get(f"{BASE_URL}/v2/reports/{rid}?include=expenses", headers=HEADERS, timeout=30)
        if resp.status_code != 200:
            print(f"{rid:<12} {str(r['name'])[:34]:<35} {str(r['status_db']):<12} ERROR {resp.status_code}")
            continue
        data = resp.json().get("data", {})
        api_status = data.get("status", "")
        api_total = float(data.get("total_value", 0) or 0)
        expenses = data.get("expenses", {}).get("data", [])
        api_n_exp = len(expenses)

        changed = api_status != r["status_db"] or api_n_exp != r["n_exp_db"] or abs(api_total - r["total_db"]) > 0.01

        api_data[rid] = {
            "status": api_status, "n_exp": api_n_exp, "total": api_total,
            "expenses": expenses,
        }

        change_marker = "*** CHANGED ***" if changed else ""
        print(f"{rid:<12} {str(r['name'])[:34]:<35} {str(r['status_db']):<12} {api_status:<12} {r['n_exp_db']:>6} {api_n_exp:>6} R$ {r['total_db']:>10.2f} R$ {api_total:>10.2f} {change_marker}")
    except Exception as e:
        print(f"{rid:<12} {str(r['name'])[:34]:<35} ERROR: {e}")

# Summary of changes
print()
print("="*100)
print("CHANGES SUMMARY")
print("="*100)
status_changes = []
expense_changes = []
total_changes = []
for rid, api in api_data.items():
    db = next((r for r in reports if r["report_id"] == rid), None)
    if not db:
        continue
    if api["status"] != db["status_db"]:
        status_changes.append((rid, db["name"], db["status_db"], api["status"], db["total_db"]))
    if api["n_exp"] != db["n_exp_db"]:
        expense_changes.append((rid, db["name"], db["n_exp_db"], api["n_exp"]))
    if abs(api["total"] - db["total_db"]) > 0.01:
        total_changes.append((rid, db["name"], db["total_db"], api["total"]))

print(f"\nStatus changes: {len(status_changes)}")
for rid, name, old, new, total in status_changes:
    print(f"  rid={rid} | {name} | {old} -> {new} | R$ {total:.2f}")

print(f"\nExpense count changes: {len(expense_changes)}")
for rid, name, old, new in expense_changes:
    print(f"  rid={rid} | {name} | {old} -> {new} exp")

print(f"\nTotal value changes: {len(total_changes)}")
for rid, name, old, new in total_changes:
    print(f"  rid={rid} | {name} | R$ {old:.2f} -> R$ {new:.2f} (diff: R$ {new-old:.2f})")

# 2. Simulate filters
print()
print("="*100)
print("FILTER SIMULATION")
print("="*100)

def normalize(s):
    return unicodedata.normalize('NFKD', s or "").encode('ascii', 'ignore').decode('utf-8').upper()

def is_fatura_or_cartao_name(name):
    n = normalize(name)
    keywords = ["FATURA", "FARTURA", "FATUTA", "FARURA", "FATUTRA",
                "CARTAO", "CAIXA ITAU", "COMPLEMENTAR FATURA",
                "DESPESAS FATURA", "RELATORIO DOLAR"]
    if any(kw in n for kw in keywords):
        return True
    if "ITAU" in n and "CAIXA ITAU" not in n:
        return True
    return False

def has_itau_expense(expenses):
    """Check if any expense uses Cartao Itau"""
    for exp in expenses:
        pm = exp.get("payment_method", {})
        if isinstance(pm, dict):
            pm_name = pm.get("name", "").lower()
        elif isinstance(pm, str):
            pm_name = pm.lower()
        else:
            pm_name = ""
        if "itau" in pm_name or "itaú" in pm_name:
            return True
        desc = (str(exp.get("description", "")) + " " + str(exp.get("title", ""))).lower()
        if "cartao itau" in desc or "cartão itaú" in desc:
            return True
    return False

# Scenario 1: Current API status only (re-sync)
print("\n--- Scenario 1: Current API status only (re-sync, no filters) ---")
api_aprovado = []
api_enviado = []
api_other = []
for rid, api in api_data.items():
    db = next((r for r in reports if r["report_id"] == rid), None)
    if not db:
        continue
    if api["status"] == "APROVADO":
        api_aprovado.append((rid, db["name"], db["total_db"]))
    elif api["status"] == "ENVIADO":
        api_enviado.append((rid, db["name"], db["total_db"]))
    else:
        api_other.append((rid, db["name"], api["status"], db["total_db"]))

print(f"  APROVADO (would stay in analysis): {len(api_aprovado)} reports, R$ {sum(t for _,_,t in api_aprovado):.2f}")
print(f"  ENVIADO (would be excluded - not approved): {len(api_enviado)} reports, R$ {sum(t for _,_,t in api_enviado):.2f}")
print(f"  Other status: {len(api_other)} reports, R$ {sum(t for _,_,_,t in api_other):.2f}")
if api_other:
    for rid, name, st, total in api_other:
        print(f"    rid={rid} | {name} | {st} | R$ {total:.2f}")

# Scenario 2: FATURA/CARTAO filter (name + expense-level)
print("\n--- Scenario 2: FATURA/CARTAO filter (name + expense payment method) ---")
filtered_fatura = []
remaining_after_fatura = []
for rid, api in api_data.items():
    db = next((r for r in reports if r["report_id"] == rid), None)
    if not db:
        continue
    name_match = is_fatura_or_cartao_name(db["name"])
    expense_match = has_itau_expense(api.get("expenses", []))
    if name_match or expense_match:
        filtered_fatura.append((rid, db["name"], db["total_db"], "NAME" if name_match else "EXPENSE"))
    else:
        remaining_after_fatura.append((rid, db["name"], api["status"], db["total_db"]))

print(f"  Filtered by FATURA/CARTAO: {len(filtered_fatura)} reports, R$ {sum(t for _,_,t,_ in filtered_fatura):.2f}")
for rid, name, total, reason in filtered_fatura:
    print(f"    rid={rid} | {name} | R$ {total:.2f} | via {reason}")

# Scenario 3: API status + FATURA filter combined
print("\n--- Scenario 3: API status (re-sync) + FATURA/CARTAO filter ---")
final_included = [r for r in remaining_after_fatura if r[2] == "APROVADO"]
final_excluded = [r for r in remaining_after_fatura if r[2] != "APROVADO"]
print(f"  Would be INCLUDED (APROVADO, non-FATURA): {len(final_included)} reports, R$ {sum(t for _,_,_,t in final_included):.2f}")
print(f"  Would be EXCLUDED: {len(final_excluded)} reports, R$ {sum(t for _,_,_,t in final_excluded):.2f}")

print(f"\n  Included reports:")
for rid, name, st, total in sorted(final_included, key=lambda x: -x[3]):
    print(f"    rid={rid} | {name} | R$ {total:.2f}")

print(f"\n  Excluded reports:")
for rid, name, st, total in sorted(final_excluded, key=lambda x: -x[3]):
    print(f"    rid={rid} | {name} | {st} | R$ {total:.2f}")

# Overall impact
print()
print("="*100)
print("OVERALL IMPACT ON GAP ANALYSIS")
print("="*100)
original_total = sum(r["total_db"] for r in reports)
excluded_fatura_total = sum(t for _,_,t,_ in filtered_fatura)
excluded_enviado_total = sum(t for _,_,_,t in [r for r in remaining_after_fatura if r[2] != "APROVADO"])
remaining_total = sum(t for _,_,_,t in final_included)

print(f"  Original gap (60 reports): R$ {original_total:.2f}")
print(f"  Excluded by FATURA/CARTAO filter: R$ {excluded_fatura_total:.2f} ({len(filtered_fatura)} reports)")
print(f"  Excluded by non-APROVADO status (after re-sync): R$ {excluded_enviado_total:.2f} ({len(final_excluded)} reports)")
print(f"  REMAINING gap (APROVADO, non-FATURA): R$ {remaining_total:.2f} ({len(final_included)} reports)")
print(f"  Reduction: R$ {original_total - remaining_total:.2f} ({(1 - remaining_total/original_total)*100:.1f}%)")
