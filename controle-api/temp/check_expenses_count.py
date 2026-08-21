import json
import os

# Verificar tamanho e quantidade de expenses
file_size = os.path.getsize('data/expenses.json')
print(f"Tamanho do arquivo: {file_size:,} bytes ({file_size/1024/1024:.2f} MB)")

with open('data/expenses.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)
    expenses = data['data']
    print(f"Total de expenses: {len(expenses):,}")
