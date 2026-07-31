#!/usr/bin/env python3
"""Check Neon DB expense raw_data for payment method info, and check report raw_data for total_value."""
import os, psycopg2, psycopg2.extras, json
from dotenv import load_dotenv
from pathlib import Path
from collections import Counter

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# 1. Check expense raw_data structure for payment methods
print("=== Expense raw_data payment method info ===")
cur.execute("""
    SELECT id, raw_data FROM prestacao_expenses 
    WHERE report_id = 7841173 
    LIMIT 5
""")
rows = cur.fetchall()
pm_counter = Counter()
for row in rows:
    raw = row["raw_data"]
    if isinstance(raw, str):
        raw = json.loads(raw)
    if not raw:
        continue
    # Check for payment_method field
    pm = raw.get("payment_method")
    pm_id = raw.get("payment_method_id")
    pm_name = raw.get("payment_method_name")
    print(f"  exp_id={row['id']} | payment_method={pm} | payment_method_id={pm_id} | payment_method_name={pm_name}")
    # Print all keys that might be payment-related
    for k, v in raw.items():
        if any(word in k.lower() for word in ["pay", "method", "card", "forma", "cartao"]):
            print(f"    {k}: {v}")

# 2. Check ALL unique payment_method_id values across all 60 reports' expenses
print("\n=== All payment_method_ids across 60 reports ===")
import openpyxl
xlsx_path = Path(r"C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\controle-api\data\gap entre referencia e neon ahahahahaah.xlsx")
wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
ws = wb["REPORTS SO NO NEON"]
report_rows = list(ws.iter_rows(values_only=True))
wb.close()

rids = []
for row in report_rows[1:]:
    if row[0] is not None:
        rids.append(row[0])

# Query all expenses for these reports
cur.execute("""
    SELECT report_id, raw_data FROM prestacao_expenses 
    WHERE report_id = ANY(%s)
""", (rids,))
all_expenses = cur.fetchall()
print(f"Total expenses in DB for 60 reports: {len(all_expenses)}")

pm_id_counter = Counter()
pm_name_counter = Counter()
for row in all_expenses:
    raw = row["raw_data"]
    if isinstance(raw, str):
        raw = json.loads(raw)
    if not raw:
        continue
    pm_id = raw.get("payment_method_id")
    pm = raw.get("payment_method")
    pm_name = raw.get("payment_method_name")
    pm_id_counter[pm_id] += 1
    if pm:
        if isinstance(pm, dict):
            pm_name_counter[pm.get("name", str(pm))] += 1
        else:
            pm_name_counter[str(pm)] += 1
    elif pm_name:
        pm_name_counter[str(pm_name)] += 1

print(f"\nPayment method IDs:")
for pm_id, cnt in pm_id_counter.most_common():
    print(f"  {pm_id}: {cnt} expenses")

print(f"\nPayment method names (from raw_data):")
for name, cnt in pm_name_counter.most_common():
    print(f"  {name}: {cnt} expenses")

# 3. Check report raw_data for total_value
print("\n=== Report raw_data total_value for key reports ===")
for rid in [7841173, 10372756, 9823077, 7511074]:
    cur.execute("SELECT name, status, total_value, raw_data FROM prestacao_reports WHERE id = %s", (rid,))
    row = cur.fetchone()
    if row:
        raw = row["raw_data"]
        if isinstance(raw, str):
            raw = json.loads(raw)
        tv = raw.get("total_value") if raw else None
        desc = raw.get("description") if raw else None
        print(f"  rid={rid} | name={row['name']} | status={row['status']} | DB total={row['total_value']} | raw total_value={tv} | raw description={desc}")

# 4. Check what payment_method_id maps to - try fetching from API with different endpoints
print("\n=== Trying to fetch payment methods from team-members (user-level) ===")
cur.execute("""
    SELECT DISTINCT raw_data->'payment_method_id' as pm_id, raw_data->'payment_method' as pm
    FROM prestacao_expenses 
    WHERE report_id = ANY(%s) AND raw_data->'payment_method' IS NOT NULL
    LIMIT 10
""", (rids,))
for row in cur.fetchall():
    print(f"  pm_id={row['pm_id']} | pm={row['pm']}")

conn.close()
