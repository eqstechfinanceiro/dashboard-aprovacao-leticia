import json
import sys

# Analisar especificamente expenses com payment_method_id: 627508 (Cartão VExpenses)
# que possam representar adições/cargas ao saldo
data = json.load(sys.stdin)

expenses = data.get('data', [])

print("Buscando expenses com Cartão VExpenses (ID 627508) que possam ser adições:")
print("=" * 60)

keywords = ['carga', 'adição', 'adicao', 'recarga', 'deposito', 'depósito', 'transferencia', 'transferência', 'quinzena', 'crédito', 'credit']

found = []
for exp in expenses:
    # Filtrar apenas Cartão VExpenses
    pm_data = exp.get('payment_method', {}).get('data')
    if isinstance(pm_data, list):
        pm_id = pm_data[0].get('id') if pm_data else None
    else:
        pm_id = pm_data.get('id') if pm_data else None
    
    if pm_id != 627508:
        continue
    
    title = (exp.get('title') or '').lower()
    observation = (exp.get('observation') or '').lower()
    
    for keyword in keywords:
        if keyword in title or keyword in observation:
            found.append({
                'id': exp.get('id'),
                'title': exp.get('title'),
                'observation': exp.get('observation'),
                'value': exp.get('value'),
                'date': exp.get('date'),
                'payment_method': exp.get('payment_method', {}).get('data', {}).get('description'),
                'user_id': exp.get('user_id'),
                'reimbursable': exp.get('reimbursable', 'N/A')
            })
            break

if found:
    print(f"Encontrados {len(found)} expenses com Cartão VExpenses + palavras-chave de adição:")
    for item in found:
        print(f"\nID: {item['id']}")
        print(f"  Título: {item['title']}")
        print(f"  Observação: {item['observation']}")
        print(f"  Valor: R$ {item['value']}")
        print(f"  Data: {item['date']}")
        print(f"  User ID: {item['user_id']}")
        print(f"  Reembolsável: {item.get('reimbursable', 'N/A')}")
else:
    print("Nenhum expense encontrado com Cartão VExpenses + palavras-chave de adição")

# Contar total de expenses com Cartão VExpenses
vexpenses_count = 0
for exp in expenses:
    pm_data = exp.get('payment_method', {}).get('data')
    if isinstance(pm_data, list):
        pm_id = pm_data[0].get('id') if pm_data else None
    else:
        pm_id = pm_data.get('id') if pm_data else None
    if pm_id == 627508:
        vexpenses_count += 1
print(f"\nTotal de expenses com Cartão VExpenses: {vexpenses_count}")
print(f"Total de expenses analisados: {len(expenses)}")
