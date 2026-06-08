import sqlite3
import json

# Verificar overlap de IDs de agosto 2025
conn = sqlite3.connect('data/spreadsheets.db')
cur = conn.execute('SELECT id_da_despesa FROM controle_base_prestacoes WHERE data LIKE "%/08/2025"')
db_august_ids = [str(int(float(row[0]))) if row[0] else '' for row in cur.fetchall()]

print(f"Total de IDs no banco de agosto 2025: {len(db_august_ids)}")

with open('data/expenses.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)
    expenses = data.get('data', [])
    expense_ids = set(str(e['id']) for e in expenses)

print(f"Total de expenses no arquivo: {len(expenses)}")

overlap = set(db_august_ids) & expense_ids
print(f"IDs em comum: {len(overlap)}")
print(f"Porcentagem do banco de agosto coberta: {len(overlap)/len(db_august_ids)*100:.1f}%")

# Mostrar exemplos
print(f"\nExemplos de IDs do banco de agosto:")
for db_id in db_august_ids[:10]:
    if db_id in expense_ids:
        print(f"  {db_id}: ✓ encontrado")
    else:
        print(f"  {db_id}: ✗ não encontrado")

conn.close()
