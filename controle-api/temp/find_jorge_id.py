import json
import sys

# Buscar JORGE ANTONIO pelo CPF
cpf_alvo = "01063690080"
nome_alvo = "JORGE ANTONIO"

data = json.load(sys.stdin)

for user in data['data']:
    if user['cpf'] == cpf_alvo or nome_alvo in user['name'].upper():
        print(f"ID: {user['id']}")
        print(f"Nome: {user['name']}")
        print(f"CPF: {user['cpf']}")
        print(f"Email: {user['email']}")
        print(f"Active: {user['active']}")
        break
