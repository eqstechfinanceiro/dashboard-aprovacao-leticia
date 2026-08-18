import json
import sqlite3

# Check expenses.json
with open('data/expenses.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)
    expenses = data.get('data', [])
    print(f"Expenses no arquivo: {len(expenses)}")
    if expenses:
        print(f"Primeiro ID: {expenses[0]['id']}")
        print(f"Último ID: {expenses[-1]['id']}")
        print(f"IDs de exemplo: {[e['id'] for e in expenses[:5]]}")

# Check database
conn = sqlite3.connect('data/spreadsheets.db')
cur = conn.execute('SELECT id_da_despesa, data FROM controle_base_prestacoes LIMIT 5')
db_data = cur.fetchall()
print(f"\nDados no banco (primeiros 5):")
for row in db_data:
    print(f"  ID: {row[0]}, Data: {row[1]}")

# Check date range in database
cur = conn.execute('SELECT MIN(data), MAX(data) FROM controle_base_prestacoes WHERE data IS NOT NULL')
date_range = cur.fetchone()
print(f"\nPeríodo de datas no banco: {date_range[0]} a {date_range[1]}")

# Check date range in expenses.json
if expenses:
    dates = [e.get('date') for e in expenses if e.get('date')]
    if dates:
        print(f"Período de datas no expenses.json: {min(dates)} a {max(dates)}")
