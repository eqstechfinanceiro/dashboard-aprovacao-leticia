import json
import sys

# Buscar usuários de referência
cpfs_alvo = ["01063690080", "69071934004"]  # JORGE ANTONIO, JOSE MARCOS
nomes_alvo = ["JORGE ANTONIO", "JOSE MARCOS"]

data = json.load(sys.stdin)

print("Buscando usuários de referência:")
print("=" * 50)

for user in data['data']:
    if user['cpf'] in cpfs_alvo or any(nome in user['name'].upper() for nome in nomes_alvo):
        print(f"ID: {user['id']}")
        print(f"Nome: {user['name']}")
        print(f"CPF: {user['cpf']}")
        print(f"Email: {user['email']}")
        print(f"Active: {user['active']}")
        print("-" * 30)
