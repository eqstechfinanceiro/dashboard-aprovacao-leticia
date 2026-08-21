import json

# Verificar se os includes estão sendo retornados corretamente
with open('data/expenses.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)
    expenses = data['data']

print("Verificando includes nos expenses:")
print(f"Total de expenses: {len(expenses)}")

# Contar quantos expenses têm cada include preenchido
user_count = sum(1 for e in expenses if e.get('user') and e['user'].get('name'))
costs_center_count = sum(1 for e in expenses if e.get('costs_center') and e['costs_center'].get('name'))
payment_method_count = sum(1 for e in expenses if e.get('payment_method') and e['payment_method'].get('name'))
expense_type_count = sum(1 for e in expenses if e.get('expense_type') and e['expense_type'].get('name'))
report_count = sum(1 for e in expenses if e.get('report') and e['report'].get('name'))

print(f"\nExpenses com user preenchido: {user_count} ({user_count/len(expenses)*100:.1f}%)")
print(f"Expenses com costs_center preenchido: {costs_center_count} ({costs_center_count/len(expenses)*100:.1f}%)")
print(f"Expenses com payment_method preenchido: {payment_method_count} ({payment_method_count/len(expenses)*100:.1f}%)")
print(f"Expenses com expense_type preenchido: {expense_type_count} ({expense_type_count/len(expenses)*100:.1f}%)")
print(f"Expenses com report preenchido: {report_count} ({report_count/len(expenses)*100:.1f}%)")

# Mostrar exemplos de expenses com includes preenchidos
print(f"\n--- EXEMPLOS DE EXPENSES COM INCLUDES PREENCHIDOS ---")
for i, e in enumerate(expenses):
    if e.get('user') and e['user'].get('name'):
        print(f"\nExpense ID: {e.get('id')}")
        print(f"  User: {e['user'].get('name')}")
        if e.get('costs_center'):
            print(f"  Costs Center: {e['costs_center'].get('name')}")
        if e.get('payment_method'):
            print(f"  Payment Method: {e['payment_method'].get('name')}")
        if e.get('expense_type'):
            print(f"  Expense Type: {e['expense_type'].get('name')}")
        if e.get('report'):
            print(f"  Report: {e['report'].get('name')} (ID: {e['report'].get('id')})")
        break
