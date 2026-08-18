import json

# Check if expenses.json has pagination info
with open('data/expenses.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)
    print("Estrutura do expenses.json:")
    print(f"Keys: {list(data.keys())}")
    
    if 'meta' in data:
        print(f"\nMeta: {data['meta']}")
    
    if 'data' in data:
        print(f"\nTotal de expenses: {len(data['data'])}")
        if data['data']:
            print(f"Primeiro expense: {data['data'][0]['id']} - {data['data'][0]['date']}")
            print(f"Último expense: {data['data'][-1]['id']} - {data['data'][-1]['date']}")
