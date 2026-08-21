import sqlite3
import json
from collections import defaultdict

# Conectar ao banco
conn = sqlite3.connect('data/spreadsheets.db')

# Buscar todos os CPFs, diretores regionais e centro de custo do banco
cur = conn.execute('SELECT DISTINCT cpf, diretor_regional, centro_de_custo FROM controle_reembolso WHERE diretor_regional IS NOT NULL')
db_data = {}
for row in cur.fetchall():
    cpf, director, cc = row
    if cpf not in db_data:
        db_data[cpf] = set()
    db_data[cpf].add((director, cc))

# Carregar team members
with open('data/team_members.json', 'r', encoding='utf-8-sig') as f:
    members_data = json.load(f)
members = members_data['data']

# Criar mapeamento de CPF para approval_flow_id
cpf_to_flow = {m['cpf']: m['approval_flow_id'] for m in members if m.get('cpf')}

# Criar mapeamento de centro de custo para diretor
cc_to_director = defaultdict(set)
for cpf in db_data:
    if cpf in cpf_to_flow:
        flow_id = cpf_to_flow[cpf]
        for director, cc in db_data[cpf]:
            cc_to_director[cc].add(director)

print("Mapeamento de Centro de Custo para Diretores (formato Python):")
print("=" * 80)
print("cc_to_director = {")
for cc, directors in sorted(cc_to_director.items()):
    if len(directors) == 1:
        director = list(directors)[0]
        print(f'    "{cc}": "{director}",')
    else:
        # Para centros com múltiplos diretores, usar o mais comum
        from collections import Counter
        director_counts = Counter()
        for cpf in db_data:
            if cpf in cpf_to_flow:
                for director, c in db_data[cpf]:
                    if c == cc:
                        director_counts[director] += 1
        most_common = director_counts.most_common(1)[0][0]
        print(f'    "{cc}": "{most_common}",  # {", ".join(sorted(directors))}')
print("}")

conn.close()
