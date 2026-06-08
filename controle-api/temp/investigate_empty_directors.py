import sqlite3
import json

# Conectar ao banco
conn = sqlite3.connect('data/spreadsheets.db')

# Buscar todos os casos com diretor_regional vazio
cur = conn.execute('SELECT cpf, colaborador, diretor_regional, centro_de_custo FROM controle_reembolso WHERE diretor_regional IS NULL OR diretor_regional = ""')
rows = cur.fetchall()

print(f"Encontrados {len(rows)} registros com diretor_regional vazio:")
print("=" * 80)

# Carregar team members
with open('data/team_members.json', 'r', encoding='utf-8-sig') as f:
    members_data = json.load(f)
members = members_data['data']

for row in rows[:10]:
    cpf, colaborador, db_diretor, cc = row
    print(f"\n{colaborador}")
    print(f"  CPF: {cpf}")
    print(f"  DB Diretor: {db_diretor}")
    print(f"  Centro de Custo: {cc}")
    
    # Buscar user na API
    user = next((m for m in members if m['cpf'] == cpf), None)
    if user:
        print(f"  API User: {user['name']}")
        print(f"  Approval Flow ID: {user.get('approval_flow_id')}")

conn.close()
