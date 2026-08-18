import json
import sqlite3

# Load expenses
with open('data/expenses.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)
    expenses = data.get('data', [])
    expense_ids = set(str(e['id']) for e in expenses)
    print(f"Total de expenses no arquivo: {len(expenses)}")
    print(f"Range de IDs: {min(expense_ids)} a {max(expense_ids)}")

# Check database
conn = sqlite3.connect('data/spreadsheets.db')
cur = conn.execute('SELECT id_da_despesa, data FROM controle_base_prestacoes')
db_data = cur.fetchall()
db_ids = [str(int(float(row[0]))) if row[0] else '' for row in db_data]
print(f"\nTotal de IDs no banco: {len(db_ids)}")
print(f"Range de IDs: {min(db_ids) if db_ids else 'N/A'} a {max(db_ids) if db_ids else 'N/A'}")

# Check date range in database
dates = [row[1] for row in db_data if row[1]]
if dates:
    print(f"Range de datas no banco: {min(dates)} a {max(dates)}")

# Check overlap
overlap = set(db_ids) & expense_ids
print(f"\nIDs em comum: {len(overlap)}")

# Check if DB IDs are in the range
db_ids_int = [int(id) for id in db_ids if id]
expense_ids_int = [int(id) for id in expense_ids]
print(f"DB IDs min/max: {min(db_ids_int)} / {max(db_ids_int)}")
print(f"Expense IDs min/max: {min(expense_ids_int)} / {max(expense_ids_int)}")

# Check specific IDs
print(f"\nVerificando IDs específicos do banco:")
for db_id in db_ids[:10]:
    if db_id in expense_ids:
        print(f"  {db_id}: ✓ encontrado")
    else:
        print(f"  {db_id}: ✗ não encontrado")

conn.close()
