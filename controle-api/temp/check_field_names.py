import json

# Verificar nomes dos campos nos includes
with open('data/expenses.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)
    expenses = data['data']

print("Verificando nomes dos campos nos includes:")
print(f"Total de expenses: {len(expenses)}")

# Mostrar estrutura completa dos includes do primeiro expense
first = expenses[0]
print(f"\n--- ESTRUTURA DOS INCLUDES ---")

for key in ['user', 'costs_center', 'payment_method', 'expense_type', 'report']:
    value = first.get(key)
    print(f"\n{key}:")
    if value:
        print(f"  Keys disponíveis: {list(value.keys())}")
        print(f"  Conteúdo: {value}")
    else:
        print(f"  None")

# Mostrar exemplos de diferentes expenses para ver variações
print(f"\n--- EXEMPLOS DE PAYMENT_METHOD ---")
for i, e in enumerate(expenses):
    if e.get('payment_method'):
        print(f"Expense {i}: {e['payment_method']}")
        if i >= 2:
            break

print(f"\n--- EXEMPLOS DE EXPENSE_TYPE ---")
for i, e in enumerate(expenses):
    if e.get('expense_type'):
        print(f"Expense {i}: {e['expense_type']}")
        if i >= 2:
            break

print(f"\n--- EXEMPLOS DE REPORT ---")
for i, e in enumerate(expenses):
    if e.get('report'):
        print(f"Expense {i}: {e['report']}")
        if i >= 2:
            break
