"""
Script para baixar expenses apenas dos IDs que existem no banco
Usa o endpoint /v2/expenses/{id} para buscar cada expense individualmente
"""
import subprocess
import json
import sqlite3
import time
import os

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"

# Ler IDs do banco
print("Lendo IDs do banco...")
conn = sqlite3.connect('data/spreadsheets.db')
cur = conn.execute('SELECT id_da_despesa FROM controle_base_prestacoes WHERE id_da_despesa IS NOT NULL')
db_ids = [int(float(row[0])) for row in cur.fetchall() if row[0]]
conn.close()

print(f"Total de IDs no banco: {len(db_ids):,}")

# Remover duplicatas
db_ids = list(set(db_ids))
print(f"IDs únicos: {len(db_ids):,}")

all_expenses = []
errors = []

for i, expense_id in enumerate(db_ids):
    if (i + 1) % 100 == 0:
        print(f"Progresso: {i+1}/{len(db_ids)} ({(i+1)/len(db_ids)*100:.1f}%) - Baixados: {len(all_expenses)}")
    
    url = f"{BASE_URL}/v2/expenses/{expense_id}?include=user,costs_center,payment_method,expense_type,report,apportionment"
    
    response = subprocess.run(
        ["curl.exe", "-s", "-H", f"Authorization: {API_KEY}", "-H", "Accept: application/json", url],
        capture_output=True,
        text=True
    )
    
    if response.returncode != 0:
        errors.append((expense_id, f"HTTP error: {response.stderr}"))
        time.sleep(0.5)
        continue
    
    try:
        data = json.loads(response.stdout)
    except json.JSONDecodeError as e:
        errors.append((expense_id, f"JSON error: {e}"))
        time.sleep(0.5)
        continue
    
    if not data.get('success'):
        errors.append((expense_id, f"API error: {data.get('message', 'N/A')}"))
        time.sleep(0.5)
        continue
    
    if 'data' in data and data['data']:
        expense = data['data']
        
        # Extrair dados de dentro da chave 'data' dos includes
        if expense.get('user') and expense['user'].get('data'):
            expense['user'] = expense['user']['data']
        if expense.get('costs_center') and expense['costs_center'].get('data'):
            expense['costs_center'] = expense['costs_center']['data']
        if expense.get('payment_method') and expense['payment_method'].get('data'):
            expense['payment_method'] = expense['payment_method']['data']
        if expense.get('expense_type') and expense['expense_type'].get('data'):
            expense['expense_type'] = expense['expense_type']['data']
        if expense.get('report') and expense['report'].get('data'):
            expense['report'] = expense['report']['data']
        
        all_expenses.append(expense)
    
    # Pequena pausa para evitar rate limiting
    time.sleep(0.2)

print(f"\n--- Resumo ---")
print(f"IDs processados: {len(db_ids):,}")
print(f"Expenses baixados: {len(all_expenses):,}")
print(f"Erros: {len(errors)}")

if errors:
    print(f"\n--- Primeiros 10 erros ---")
    for expense_id, error in errors[:10]:
        print(f"  ID {expense_id}: {error}")

print(f"\n--- Salvando {len(all_expenses):,} expenses ---")
output = {"data": all_expenses}
with open('data/expenses.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

file_size = os.path.getsize('data/expenses.json')
print(f"Arquivo salvo: {file_size:,} bytes ({file_size/1024/1024:.2f} MB)")
print("Concluído!")
