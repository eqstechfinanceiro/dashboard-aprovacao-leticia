import json

# Verificar estrutura completa dos includes
with open('data/expenses.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)
    expenses = data['data']

print("Verificando estrutura dos includes:")
print(f"Total de expenses: {len(expenses)}")

# Mostrar estrutura completa do primeiro expense
first = expenses[0]
print(f"\n--- ESTRUTURA COMPLETA DO PRIMEIRO EXPENSE ---")
print(f"ID: {first.get('id')}")

for key in ['user', 'costs_center', 'payment_method', 'expense_type', 'report']:
    value = first.get(key)
    print(f"\n{key}:")
    if value:
        print(f"  Tipo: {type(value)}")
        print(f"  Conteúdo: {value}")
    else:
        print(f"  None")

# Contar quantos têm cada campo específico
print(f"\n--- CONTAGEM DE CAMPOS ESPECÍFICOS ---")
user_name_count = sum(1 for e in expenses if e.get('user') and e['user'].get('name'))
cc_name_count = sum(1 for e in expenses if e.get('costs_center') and e['costs_center'].get('name'))
pm_desc_count = sum(1 for e in expenses if e.get('payment_method') and e['payment_method'].get('description'))
pm_name_count = sum(1 for e in expenses if e.get('payment_method') and e['payment_method'].get('name'))
et_desc_count = sum(1 for e in expenses if e.get('expense_type') and e['expense_type'].get('description'))
et_name_count = sum(1 for e in expenses if e.get('expense_type') and e['expense_type'].get('name'))
report_name_count = sum(1 for e in expenses if e.get('report') and e['report'].get('description'))
report_desc_count = sum(1 for e in expenses if e.get('report') and e['report'].get('name'))

print(f"User.name: {user_name_count} ({user_name_count/len(expenses)*100:.1f}%)")
print(f"Costs Center.name: {cc_name_count} ({cc_name_count/len(expenses)*100:.1f}%)")
print(f"Payment Method.description: {pm_desc_count} ({pm_desc_count/len(expenses)*100:.1f}%)")
print(f"Payment Method.name: {pm_name_count} ({pm_name_count/len(expenses)*100:.1f}%)")
print(f"Expense Type.description: {et_desc_count} ({et_desc_count/len(expenses)*100:.1f}%)")
print(f"Expense Type.name: {et_name_count} ({et_name_count/len(expenses)*100:.1f}%)")
print(f"Report.description: {report_desc_count} ({report_desc_count/len(expenses)*100:.1f}%)")
print(f"Report.name: {report_name_count} ({report_name_count/len(expenses)*100:.1f}%)")
