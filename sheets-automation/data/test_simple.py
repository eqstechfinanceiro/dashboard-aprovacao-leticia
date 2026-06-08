import json

print("Teste simples...")
print("Carregando dados...")

with open('../vexpenses-dashboard/planilha-1qz-data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"Dados carregados! Tipo: {type(data)}")
if isinstance(data, list):
    print(f"Total de usuários: {len(data)}")
    print(f"Primeiro usuário: {data[0]}")
    print(f"Chaves do primeiro usuário: {data[0].keys() if isinstance(data[0], dict) else 'N/A'}")
elif isinstance(data, dict):
    print(f"Chaves do dict: {data.keys()}")
print("Teste concluído com sucesso!")