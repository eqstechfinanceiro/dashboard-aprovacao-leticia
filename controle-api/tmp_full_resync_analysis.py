#!/usr/bin/env python3
"""
Full analysis: re-sync all 60 reports from API with payment method names,
then simulate filters (FATURA/CARTAO + status) to measure impact.
"""
import os, requests, json, time, re, unicodedata
import psycopg2, psycopg2.extras
import openpyxl
from dotenv import load_dotenv
from pathlib import Path
from collections import Counter, defaultdict

load_dotenv(Path(__file__).parent / ".env")
API_KEY = os.getenv("VEXPENSES_API_KEY", "")
BASE_URL = os.getenv("VEXPENSES_BASE_URL", "https://api.vexpenses.com")
HEADERS = {"Authorization": API_KEY, "Accept": "application/json"}

# Payment method ID -> name mapping (discovered from API)
PM_MAP = {
    627401: "Cartão Corporativo Itaú",
    627721: "Unknown (need to check)",
}

# First, find what 627721 maps to
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
cur.execute("""
    SELECT e.id FROM prestacao_expenses e
    WHERE e.raw_data->'payment_method_id' = '627721'
    LIMIT 1
""")
row = cur.fetchone()
if row:
    exp_id = row["id"]
    try:
        resp = requests.get(f"{BASE_URL}/v2/expenses/{exp_id}?include=payment_method", headers=HEADERS, timeout=30)
        if resp.status_code == 200:
            data = resp.json().get("data", {})
            pm = data.get("payment_method", {}).get("data", {})
            PM_MAP[627721] = pm.get("description", "Unknown")
    except:
        pass

print(f"Payment method mapping: {PM_MAP}")
print()

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

print(f"Total reports: {len(reports)}")

# Get all expenses from DB for these reports
rids = [r["report_id"] for r in reports]
cur.execute("""
    SELECT report_id, id, value, raw_data FROM prestacao_expenses
    WHERE report_id = ANY(%s)
""", (rids,))
db_expenses = defaultdict(list)
for row in cur.fetchall():
    raw = row["raw_data"]
    if isinstance(raw, str):
        raw = json.loads(raw)
    pm_id = raw.get("payment_method_id") if raw else None
    db_expenses[row["report_id"]].append({
        "exp_id": row["id"],
        "value": float(row["value"] or 0),
        "pm_id": pm_id,
    })

conn.close()

# Now fetch all 60 reports from API with current status
print("="*100)
print("RE-SYNC FROM API + PAYMENT METHOD ANALYSIS")
print("="*100)

api_data = {}
for r in reports:
    rid = r["report_id"]
    time.sleep(0.4)
    try:
        resp = requests.get(f"{BASE_URL}/v2/reports/{rid}?include=expenses.payment_method", headers=HEADERS, timeout=30)
        if resp.status_code != 200:
            print(f"  ERROR rid={rid}: {resp.status_code}")
            continue
        data = resp.json().get("data", {})
        api_status = data.get("status", "")
        expenses = data.get("expenses", {}).get("data", [])
        
        # Map payment methods
        pm_counter = Counter()
        api_total = 0
        for exp in expenses:
            api_total += float(exp.get("value", 0) or 0)
            pm = exp.get("payment_method", {})
            if isinstance(pm, dict):
                pm_data = pm.get("data", {})
                pm_name = pm_data.get("description", f"ID:{exp.get('payment_method_id')}")
            else:
                pm_name = f"ID:{exp.get('payment_method_id')}"
            pm_counter[pm_name] += 1
        
        api_data[rid] = {
            "status": api_status,
            "n_exp": len(expenses),
            "total": api_total,
            "pm_counter": pm_counter,
        }
        
        changed = api_status != r["status_db"]
        marker = " *** STATUS CHANGED ***" if changed else ""
        pm_str = ", ".join(f"{k}: {v}" for k, v in pm_counter.most_common())
        print(f"  rid={rid:<12} | {str(r['name'])[:34]:<35} | DB:{str(r['status_db']):<10} -> API:{api_status:<10}{marker}")
        if pm_counter:
            print(f"           PM: {pm_str}")
    except Exception as e:
        print(f"  ERROR rid={rid}: {e}")

# Summary
print()
print("="*100)
print("SUMMARY")
print("="*100)

# Status changes
status_changes = []
for rid, api in api_data.items():
    db = next((r for r in reports if r["report_id"] == rid), None)
    if db and api["status"] != db["status_db"]:
        status_changes.append((rid, db["name"], db["status_db"], api["status"], db["total_db"]))

print(f"\nStatus changes: {len(status_changes)}")
for rid, name, old, new, total in status_changes:
    print(f"  {rid} | {name} | {old} -> {new} | R$ {total:.2f}")

# Payment method distribution
print(f"\nPayment method distribution across all 60 reports:")
all_pm = Counter()
for rid, api in api_data.items():
    for pm, cnt in api["pm_counter"].items():
        all_pm[pm] += cnt
for name, cnt in all_pm.most_common():
    print(f"  {name}: {cnt} expenses")

# Reports with Itaú
print(f"\nReports with Cartão Corporativo Itaú:")
itau_reports = []
for rid, api in api_data.items():
    db = next((r for r in reports if r["report_id"] == rid), None)
    if not db:
        continue
    has_itau = any("itau" in str(k).lower() or "itaú" in str(k).lower() for k in api["pm_counter"].keys())
    if has_itau:
        itau_count = sum(v for k, v in api["pm_counter"].items() if "itau" in str(k).lower() or "itaú" in str(k).lower())
        itau_reports.append((rid, db["name"], api["status"], db["total_db"], itau_count, api["pm_counter"]))
        print(f"  rid={rid} | {db['name']} | {api['status']} | R$ {db['total_db']:.2f} | {itau_count} Itaú expenses | {dict(api['pm_counter'])}")

# Filter simulation
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

# Scenario 1: Re-sync status only
print("\n--- Scenario 1: Re-sync status only (no filters) ---")
s1_included = [(rid, db, api_data[rid]["status"]) for rid, db in ((r["report_id"], r) for r in reports) if rid in api_data and api_data[rid]["status"] == "APROVADO"]
s1_excluded = [(rid, db, api_data[rid]["status"]) for rid, db in ((r["report_id"], r) for r in reports) if rid in api_data and api_data[rid]["status"] != "APROVADO"]
print(f"  INCLUDED (APROVADO): {len(s1_included)} reports, R$ {sum(r[1]['total_db'] for r in s1_included):.2f}")
print(f"  EXCLUDED (non-APROVADO): {len(s1_excluded)} reports, R$ {sum(r[1]['total_db'] for r in s1_excluded):.2f}")
for rid, db, st in s1_excluded:
    print(f"    {rid} | {db['name']} | {st} | R$ {db['total_db']:.2f}")

# Scenario 2: Re-sync + Itaú expense filter
print("\n--- Scenario 2: Re-sync + Itaú expense filter (exclude reports where ALL expenses are Itaú) ---")
s2_excluded_itau = []
s2_remaining = []
for r in reports:
    rid = r["report_id"]
    if rid not in api_data:
        continue
    api = api_data[rid]
    pm = api["pm_counter"]
    total_exp = sum(pm.values())
    itau_exp = sum(v for k, v in pm.items() if "itau" in str(k).lower() or "itaú" in str(k).lower())
    
    if total_exp > 0 and itau_exp == total_exp:
        # ALL expenses are Itaú
        s2_excluded_itau.append((rid, r, itau_exp))
    else:
        s2_remaining.append((rid, r, api["status"], itau_exp, total_exp))

print(f"  Excluded (100% Itaú): {len(s2_excluded_itau)} reports, R$ {sum(r[1]['total_db'] for r in s2_excluded_itau):.2f}")
for rid, r, cnt in s2_excluded_itau:
    print(f"    {rid} | {r['name']} | {cnt} Itaú expenses | R$ {r['total_db']:.2f}")

# Scenario 3: Re-sync + Itaú filter + name filter
print("\n--- Scenario 3: Re-sync + Itaú expense filter + FATURA/CARTAO name filter ---")
s3_excluded_name = []
s3_remaining2 = []
for rid, r, status, itau_cnt, total_exp in s2_remaining:
    if is_fatura_or_cartao_name(r["name"]):
        s3_excluded_name.append((rid, r))
    else:
        s3_remaining2.append((rid, r, status))

print(f"  Excluded by name filter: {len(s3_excluded_name)} reports, R$ {sum(r[1]['total_db'] for r in s3_excluded_name):.2f}")
for rid, r in s3_excluded_name:
    print(f"    {rid} | {r['name']} | R$ {r['total_db']:.2f}")

# Final: only APROVADO from remaining
s3_included = [(rid, r) for rid, r, st in s3_remaining2 if st == "APROVADO"]
s3_excluded_status = [(rid, r, st) for rid, r, st in s3_remaining2 if st != "APROVADO"]

print(f"\n  FINAL INCLUDED (APROVADO, non-Itaú, non-FATURA name): {len(s3_included)} reports, R$ {sum(r[1]['total_db'] for r in s3_included):.2f}")
print(f"  FINAL EXCLUDED by status: {len(s3_excluded_status)} reports, R$ {sum(r[1]['total_db'] for r in s3_excluded_status):.2f}")
for rid, r, st in s3_excluded_status:
    print(f"    {rid} | {r['name']} | {st} | R$ {r['total_db']:.2f}")

# Overall impact
print()
print("="*100)
print("OVERALL IMPACT")
print("="*100)
original_total = sum(r["total_db"] for r in reports)
final_total = sum(r[1]["total_db"] for r in s3_included)
excluded_itau_total = sum(r[1]["total_db"] for r in s2_excluded_itau)
excluded_name_total = sum(r[1]["total_db"] for r in s3_excluded_name)
excluded_status_total = sum(r[1]["total_db"] for r in s3_excluded_status)

print(f"  Original gap (60 reports): R$ {original_total:.2f}")
print(f"  Excluded by 100% Itaú expenses: R$ {excluded_itau_total:.2f} ({len(s2_excluded_itau)} reports)")
print(f"  Excluded by FATURA/CARTAO name: R$ {excluded_name_total:.2f} ({len(s3_excluded_name)} reports)")
print(f"  Excluded by non-APROVADO status: R$ {excluded_status_total:.2f} ({len(s3_excluded_status)} reports)")
print(f"  REMAINING gap: R$ {final_total:.2f} ({len(s3_included)} reports)")
print(f"  Reduction: R$ {original_total - final_total:.2f} ({(1 - final_total/original_total)*100:.1f}%)")

print(f"\n  Remaining reports (APROVADO, non-Itaú, non-FATURA name):")
for rid, r in sorted(s3_included, key=lambda x: -x[1]["total_db"]):
    print(f"    {rid} | {r['name']} | R$ {r['total_db']:.2f}")
