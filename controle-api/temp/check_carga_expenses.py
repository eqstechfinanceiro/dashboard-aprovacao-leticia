import json
import sys

# Analisar expenses para encontrar padrões de carga/adição
data = json.load(sys.stdin)

expenses = data.get('data', [])

print("Buscando expenses com palavras-chave de carga/adição:")
print("=" * 60)

keywords = ['carga', 'adição', 'adicao', 'recarga', 'deposito', 'depósito', 'transferencia', 'transferência', 'quinzena']

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
                'user_id': exp.get('user_id')
            })
            break

if found:
    print(f"Encontrados {len(found)} expenses com palavras-chave de carga:")
    for item in found[:10]:  # Mostrar primeiros 10
        print(f"\nID: {item['id']}")
        print(f"  Título: {item['title']}")
        print(f"  Observação: {item['observation']}")
        print(f"  Valor: R$ {item['value']}")
        print(f"  Data: {item['date']}")
        print(f"  Payment Method: {item['payment_method']}")
        print(f"  User ID: {item['user_id']}")
else:
    print("Nenhum expense encontrado com palavras-chave de carga/adição")

print(f"\nTotal de expenses analisados: {len(expenses)}")
