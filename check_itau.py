import psycopg2
import openpyxl
from collections import defaultdict

DB_CONN = "postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"

# Read planilha IDs
wb = openpyxl.load_workbook('CONTROLE - VEXPENSES - AGOSTO 2026.xlsx', read_only=True, data_only=True)
ws = wb['BASE PREST ']
planilha_ids = set()
for row in ws.iter_rows(min_row=4, values_only=True):
    if row[0] is not None:
        planilha_ids.add(str(row[0]).strip())
wb.close()
print(f"Planilha IDs: {len(planilha_ids)}")

# Read bank expenses
conn = psycopg2.connect(DB_CONN)
cur = conn.cursor()
cur.execute("""
    SELECT id, raw_data::json->>'payment_method_id' as pm_id
    FROM prestacao_expenses
""")
bank_ids = {}
for r in cur.fetchall():
    bank_ids[str(r[0]).strip()] = r[1] or 'SEM_PM'
cur.close()
conn.close()
print(f"Banco IDs: {len(bank_ids)}")

only_bank = set(bank_ids.keys()) - planilha_ids
print(f"IDs apenas no banco: {len(only_bank)}")

# Group by payment_method_id
pm_counts = defaultdict(int)
for eid in only_bank:
    pm_counts[bank_ids[eid]] += 1

print("\nIDs apenas no banco por payment_method_id:")
for pm, c in sorted(pm_counts.items(), key=lambda x: -x[1]):
    print(f"  {pm}: {c}")
