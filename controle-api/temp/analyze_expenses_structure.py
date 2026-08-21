import json
import sys

# Analisar estrutura do expenses.json
with open('data/expenses.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

print("=" * 80)
print("ANÁLISE DA ESTRUTURA DO EXPENSES.JSON")
print("=" * 80)

print(f"\nKeys principais: {list(data.keys())}")

if 'data' in data:
    expenses = data['data']
    print(f"\nTotal de expenses: {len(expenses):,}")
    
    if expenses:
        # Analisar primeiro expense
        first = expenses[0]
        print(f"\n--- PRIMEIRO EXPENSE ---")
        print(f"ID: {first.get('id')}")
        print(f"Date: {first.get('date')}")
        print(f"Value: {first.get('value')}")
        print(f"Description: {first.get('description')}")
        print(f"\nKeys do primeiro expense: {list(first.keys())}")
        
        # Analisar includes
        print(f"\n--- INCLUDES ---")
        if 'user' in first:
            print(f"User: {first['user'].get('name')} (ID: {first['user'].get('id')})")
        if 'costs_center' in first:
            print(f"Costs Center: {first['costs_center'].get('name')}")
        if 'payment_method' in first:
            print(f"Payment Method: {first['payment_method'].get('name')}")
        if 'expense_type' in first:
            print(f"Expense Type: {first['expense_type'].get('name')}")
        if 'report' in first:
            print(f"Report: {first['report'].get('name')} (ID: {first['report'].get('id')})")
        
        # Analisar último expense
        last = expenses[-1]
        print(f"\n--- ÚLTIMO EXPENSE ---")
        print(f"ID: {last.get('id')}")
        print(f"Date: {last.get('date')}")
        print(f"Value: {last.get('value')}")
        
        # Analisar range de datas
        dates = [e.get('date') for e in expenses if e.get('date')]
        if dates:
            print(f"\n--- RANGE DE DATAS ---")
            print(f"Data mais antiga: {min(dates)}")
            print(f"Data mais recente: {max(dates)}")
        
        # Analisar range de IDs
        ids = [e.get('id') for e in expenses if e.get('id')]
        if ids:
            print(f"\n--- RANGE DE IDs ---")
            print(f"ID menor: {min(ids):,}")
            print(f"ID maior: {max(ids):,}")
        
        # Contar expenses por data
        from collections import Counter
        date_counts = Counter(dates)
        print(f"\n--- EXPENSES POR DATA (TOP 10) ---")
        for date, count in date_counts.most_common(10):
            print(f"  {date}: {count:,} expenses")

# Tamanho do arquivo
import os
file_size = os.path.getsize('data/expenses.json')
print(f"\n--- TAMANHO DO ARQUIVO ---")
print(f"Tamanho: {file_size:,} bytes ({file_size / 1024 / 1024:.2f} MB)")
print(f"Linhas: {file_size // 100:,} (estimado)")
