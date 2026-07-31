#!/usr/bin/env python3
"""
Deep analysis of all 60 'reports only in Neon':
- Check expense payment methods (Itaú vs VExpenses)
- Check naming convention (CAIXA XX/YYYY vs other)
- Check approval date relative to ref date (27/07/2026 ~8am)
- Check justification text for reproval clues
- Categorize each report
"""
import os, psycopg2, psycopg2.extras, json, re
import openpyxl
from dotenv import load_dotenv
from pathlib import Path
from collections import Counter
from datetime import datetime

load_dotenv(Path(__file__).parent / ".env")

# 1. Read all 60 reports from the Excel
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
        "report_id": row[0],
        "name": row[1],
        "user": row[2],
        "cpf": row[3],
        "status": row[4],
        "n_expenses": row[5],
        "total": float(row[6]) if row[6] else 0,
    })

# 2. Query Neon for expense raw_data to check payment methods
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Check expense raw_data structure
cur.execute("SELECT raw_data FROM prestacao_expenses LIMIT 1")
sample = cur.fetchone()
if sample and sample["raw_data"]:
    raw = sample["raw_data"]
    if isinstance(raw, str):
        raw = json.loads(raw)
    print(f"Sample expense raw_data keys: {list(raw.keys()) if isinstance(raw, dict) else type(raw)}")
    # Look for payment-related fields
    if isinstance(raw, dict):
        for k, v in raw.items():
            if any(word in k.lower() for word in ["pay", "method", "card", "type", "forma"]):
                print(f"  Payment-related field: {k} = {v}")

print()

REF_DATE = datetime(2026, 7, 27, 8, 0, 0)  # Ref was made ~8am on 27/07/2026

results = []
for r in reports:
    rid = r["report_id"]
    
    # Get report raw_data
    cur.execute("SELECT raw_data FROM prestacao_reports WHERE id = %s", (rid,))
    db_row = cur.fetchone()
    approval_date = None
    justification = None
    updated_at = None
    if db_row and db_row["raw_data"]:
        raw = db_row["raw_data"]
        if isinstance(raw, str):
            raw = json.loads(raw)
        if isinstance(raw, dict):
            ad = raw.get("approval_date")
            if ad:
                try:
                    approval_date = datetime.strptime(str(ad)[:19], "%Y-%m-%d %H:%M:%S")
                except:
                    approval_date = None
            justification = raw.get("justification", "")
            ua = raw.get("updated_at")
            if ua:
                try:
                    updated_at = datetime.strptime(str(ua)[:19], "%Y-%m-%d %H:%M:%S")
                except:
                    updated_at = None
    
    # Check expense payment methods from raw_data
    cur.execute("""
        SELECT raw_data FROM prestacao_expenses WHERE report_id = %s
    """, (rid,))
    all_exp_raw = cur.fetchall()
    payment_methods = Counter()
    for er in all_exp_raw:
        if er["raw_data"]:
            raw = er["raw_data"]
            if isinstance(raw, str):
                raw = json.loads(raw)
            if isinstance(raw, dict):
                # Check various possible field names
                pm = raw.get("payment_method") or raw.get("payment_type") or raw.get("payment") or raw.get("forma_pagamento")
                if pm:
                    payment_methods[str(pm)] += 1
                else:
                    # Check if "payment_method" is nested
                    pm_nested = raw.get("payment_method_data", {})
                    if isinstance(pm_nested, dict):
                        pm_name = pm_nested.get("name") or pm_nested.get("type")
                        if pm_name:
                            payment_methods[str(pm_name)] += 1
                    else:
                        payment_methods["UNKNOWN"] += 1
    
    # Check naming convention
    name = r["name"] or ""
    is_standard_caixa = bool(re.match(r'^CAIXA\s+\d{2}/\d{4}$', name, re.IGNORECASE))
    
    # Determine category
    categories = []
    
    # Check if Itaú card
    has_itau = any("itau" in pm.lower() or "itaú" in pm.lower() for pm in payment_methods.keys())
    has_vexpenses = any("vexpenses" in pm.lower() or "saque" in pm.lower() for pm in payment_methods.keys())
    
    if has_itau and not has_vexpenses:
        categories.append("ITAU_CARD")
    elif has_itau and has_vexpenses:
        categories.append("MIXED_CARD")
    
    if not is_standard_caixa and r["status"] == "APROVADO":
        categories.append("NON_STANDARD_NAME")
    
    # Check timing for ENVIADO reports
    if r["status"] == "ENVIADO":
        # Check if this could be a timing issue (reprovado at ref time, reaberto after)
        if updated_at and updated_at > REF_DATE:
            categories.append("TIMING_ISSUE")
        else:
            categories.append("GENUINE_ENVIADO")
    
    # Check justification for reproval clues
    if justification and "REPROV" in justification.upper() and r["status"] == "APROVADO":
        categories.append("REPROVED_THEN_APPROVED")
    
    # Check if old report (2025)
    if approval_date and approval_date.year == 2025:
        categories.append("OLD_2025")
    
    # Check if approved after ref date (shouldn't happen if ref is a snapshot)
    if approval_date and approval_date > REF_DATE:
        categories.append("APPROVED_AFTER_REF")
    
    if not categories:
        categories.append("UNCATEGORIZED")
    
    results.append({
        "report_id": rid,
        "name": name,
        "user": r["user"],
        "cpf": r["cpf"],
        "status": r["status"],
        "total": r["total"],
        "n_expenses": r["n_expenses"],
        "approval_date": approval_date,
        "justification": justification,
        "payment_methods": dict(payment_methods),
        "is_standard_caixa": is_standard_caixa,
        "categories": categories,
        "updated_at": updated_at,
    })

conn.close()

# 3. Print categorized results
print("="*100)
print("CATEGORY ANALYSIS")
print("="*100)

cat_totals = Counter()
for r in results:
    for c in r["categories"]:
        cat_totals[c] += 1

print("\nCategory counts:")
for cat, cnt in cat_totals.most_common():
    cat_reports = [r for r in results if cat in r["categories"]]
    cat_sum = sum(r["total"] for r in cat_reports)
    print(f"  {cat}: {cnt} reports, R$ {cat_sum:.2f}")

# Print details for each category
for cat in ["ITAU_CARD", "MIXED_CARD", "NON_STANDARD_NAME", "TIMING_ISSUE", "GENUINE_ENVIADO", "REPROVED_THEN_APPROVED", "OLD_2025", "APPROVED_AFTER_REF", "UNCATEGORIZED"]:
    cat_reports = [r for r in results if cat in r["categories"]]
    if not cat_reports:
        continue
    print(f"\n{'='*80}")
    print(f"{cat} ({len(cat_reports)} reports, R$ {sum(r['total'] for r in cat_reports):.2f})")
    print(f"{'='*80}")
    for r in sorted(cat_reports, key=lambda x: -x["total"]):
        apd = r["approval_date"].strftime("%d/%m/%Y %H:%M") if r["approval_date"] else "N/A"
        pm = ", ".join(f"{k}:{v}" for k, v in r["payment_methods"].items()) if r["payment_methods"] else "N/A"
        just = (r["justification"][:80] + "...") if r["justification"] and len(r["justification"]) > 80 else (r["justification"] or "")
        print(f"  rid={r['report_id']} | {r['name']} | {r['user']} | {r['status']} | R$ {r['total']:.2f} | {r['n_expenses']} exp")
        print(f"    approved: {apd} | payments: {pm} | standard_name: {r['is_standard_caixa']}")
        if just:
            print(f"    justification: {just}")
