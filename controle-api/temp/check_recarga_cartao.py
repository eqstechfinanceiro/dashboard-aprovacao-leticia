import json
import sys

# Analisar especificamente expenses com "RECARGA CARTAO"
data = json.load(sys.stdin)

expenses = data.get('data', [])

print("Buscando expenses com 'RECARGA CARTAO' ou similares:")
print("=" * 60)

keywords = ['recarga cartao', 'recarga cartão', 'carga cartao', 'carga cartão', 'adição cartao', 'adição cartão']

found = []
for exp in expenses:
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
                'payment_method_id': exp.get('payment_method', {}).get('data', {}).get('id'),
                'user_id': exp.get('user_id'),
                'reimbursable': exp.get('reimbursable')
            })
            break

if found:
    print(f"Encontrados {len(found)} expenses com recarga de cartão:")
    for item in found:
        print(f"\nID: {item['id']}")
        print(f"  Título: {item['title']}")
        print(f"  Observação: {item['observation']}")
        print(f"  Valor: R$ {item['value']}")
        print(f"  Data: {item['date']}")
        print(f"  Payment Method: {item['payment_method']} (ID: {item['payment_method_id']})")
        print(f"  User ID: {item['user_id']}")
        print(f"  Reembolsável: {item['reimbursable']}")
else:
    print("Nenhum expense encontrado com recarga de cartão VExpenses")

print(f"\nTotal de expenses analisados: {len(expenses)}")
