import sqlite3
import json

# Conectar ao banco
conn = sqlite3.connect('data/spreadsheets.db')

# Casos específicos de divergência
cases = [
    "MARCIO CAMPOS RIBEIRO",
    "EDUARDO ANDREY VENSON SILVA",
    "GABRIELA DALLA VECHIA MONTEIRO",
    "ROBERTO ALIAGA",
    "JORGE NEGRI NETO"
]

# Carregar team members
with open('data/team_members.json', 'r', encoding='utf-8-sig') as f:
    members_data = json.load(f)
members = members_data['data']

print("Investigando casos específicos de divergência:")
print("=" * 80)

for case in cases:
    cur = conn.execute('SELECT cpf, colaborador, diretor_regional, centro_de_custo FROM controle_reembolso WHERE colaborador = ?', (case,))
    rows = cur.fetchall()
    
    for row in rows:
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
            
            # Buscar flow description
            flow_id = user.get('approval_flow_id')
            with open('data/approval_flows.json', 'r', encoding='utf-8-sig') as f:
                flows_data = json.load(f)
            flow = next((f for f in flows_data['data'] if f['id'] == flow_id), None)
            if flow:
                print(f"  Flow Description: {flow['description']}")

conn.close()
