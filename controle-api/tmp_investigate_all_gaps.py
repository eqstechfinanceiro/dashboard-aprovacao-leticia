#!/usr/bin/env python3
"""
Investigate all 62 'reports only in Neon' from the gap analysis.
Check: timing issue (reprovado at ref time, reaberto after), Itau card, and other patterns.
"""
import os, psycopg2, psycopg2.extras, json
import openpyxl
from dotenv import load_dotenv
from pathlib import Path
from collections import Counter

load_dotenv(Path(__file__).parent / ".env")

# 1. Read all 62 reports from the Excel
xlsx_path = Path(r"C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\controle-api\data\gap entre referencia e neon ahahahahaah.xlsx")
wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
ws = wb["REPORTS SO NO NEON"]
rows = list(ws.iter_rows(values_only=True))
wb.close()

# Headers: Report ID, Report Name, User, CPF, Status, N Expenses, Total Value, ...
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
        "total": row[6],
        "user_note": row[7],  # User's annotation (Reprovado, ????, etc)
        "card_type": row[8],  # Vexpenses, Cartão Itaú, etc
    })

print(f"Total reports only in Neon: {len(reports)}")
print()

# 2. Query Neon DB for each report - get status, raw_data, and expense payment methods
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Check what columns exist in prestacao_expenses
cur.execute("""
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'prestacao_expenses' 
    ORDER BY ordinal_position
""")
exp_cols = [r["column_name"] for r in cur.fetchall()]
print(f"prestacao_expenses columns: {exp_cols}")
print()

# Check if there's a payment method column
has_payment = "payment_method" in exp_cols or "payment" in exp_cols
has_raw_data = "raw_data" in exp_cols

print(f"Has payment_method: {has_payment}")
print(f"Has raw_data: {has_raw_data}")
print()

# 3. For each report, get DB status and expense info
results = []
for r in reports:
    rid = r["report_id"]
    cur.execute("""
        SELECT id, name, status, user_name, user_cpf, total_value, created_at, updated_at, raw_data
        FROM prestacao_reports WHERE id = %s
    """, (rid,))
    db_row = cur.fetchone()
    
    # Get expense count and total from DB
    cur.execute("""
        SELECT count(*) as cnt, sum(value) as total
        FROM prestacao_expenses WHERE report_id = %s
    """, (rid,))
    exp_row = cur.fetchone()
    
    # Get payment methods from expense raw_data if available
    payment_methods = Counter()
    if has_raw_data:
        cur.execute("""
            SELECT raw_data FROM prestacao_expenses WHERE report_id = %s LIMIT 5
        """, (rid,))
        sample_exp = cur.fetchall()
        for se in sample_exp:
            if se["raw_data"]:
                raw = se["raw_data"]
                if isinstance(raw, str):
                    raw = json.loads(raw)
                # Look for payment method in raw_data
                for key in ["payment_method", "payment_type", "payment", "type"]:
                    if key in raw:
                        payment_methods[raw[key]] += 1
                        break
    
    # Parse raw_data of report for approval info
    approval_info = {}
    if db_row and db_row["raw_data"]:
        raw = db_row["raw_data"]
        if isinstance(raw, str):
            raw = json.loads(raw)
        for key in ["approval_date", "approval_user_id", "payment_date", "status", "updated_at", "justification"]:
            if key in raw and raw[key]:
                approval_info[key] = raw[key]
    
    results.append({
        "report_id": rid,
        "name": r["name"],
        "user": r["user"],
        "cpf": r["cpf"],
        "excel_status": r["status"],
        "db_status": db_row["status"] if db_row else "NOT IN DB",
        "n_expenses_excel": r["n_expenses"],
        "n_expenses_db": exp_row["cnt"] if exp_row else 0,
        "total_excel": r["total"],
        "total_db": float(exp_row["total"]) if exp_row and exp_row["total"] else 0,
        "user_note": r["user_note"],
        "card_type": r["card_type"],
        "created_at": db_row["created_at"] if db_row else None,
        "approval_info": approval_info,
        "payment_methods": dict(payment_methods),
    })

conn.close()

# 4. Categorize and print
print("="*100)
print("CATEGORY 1: APROVADO reports (should be in ref unless timing or filter issue)")
print("="*100)
cat1 = [r for r in results if r["excel_status"] == "APROVADO"]
print(f"Count: {len(cat1)}, Total: R$ {sum(r['total_db'] for r in cat1):.2f}")
for r in cat1:
    print(f"  rid={r['report_id']} | {r['name']} | {r['user']} | R$ {r['total_db']:.2f} | {r['n_expenses_db']} exp | note={r['user_note']} | card={r['card_type']}")
    if r["approval_info"]:
        print(f"    approval: {r['approval_info']}")
    if r["payment_methods"]:
        print(f"    payments: {r['payment_methods']}")

print()
print("="*100)
print("CATEGORY 2: ENVIADO reports (not yet approved - shouldn't be in ref)")
print("="*100)
cat2 = [r for r in results if r["excel_status"] == "ENVIADO"]
print(f"Count: {len(cat2)}, Total: R$ {sum(r['total_db'] for r in cat2):.2f}")
for r in cat2:
    print(f"  rid={r['report_id']} | {r['name']} | {r['user']} | R$ {r['total_db']:.2f} | {r['n_expenses_db']} exp | note={r['user_note']} | card={r['card_type']}")

print()
print("="*100)
print("CATEGORY 3: Other status")
print("="*100)
cat3 = [r for r in results if r["excel_status"] not in ("APROVADO", "ENVIADO")]
print(f"Count: {len(cat3)}")
for r in cat3:
    print(f"  rid={r['report_id']} | {r['name']} | {r['user']} | status={r['excel_status']} | R$ {r['total_db']:.2f}")

print()
print("="*100)
print("SUMMARY")
print("="*100)
print(f"APROVADO (potential timing/filter issue): {len(cat1)} reports, R$ {sum(r['total_db'] for r in cat1):.2f}")
print(f"ENVIADO (expected - not approved):        {len(cat2)} reports, R$ {sum(r['total_db'] for r in cat2):.2f}")
print(f"Other:                                     {len(cat3)} reports")
print(f"TOTAL:                                     {len(results)} reports, R$ {sum(r['total_db'] for r in results):.2f}")
