import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
cursor = conn.cursor()

print('=== RECOMENDAÇÃO DE TABELA PARA INÍCIO ===\n')

# Análise das principais tabelas candidatas
candidates = {
    'controle_detalhes1': {'linhas': 12, 'cols': 29, 'tipo': 'Detalhes de despesas específicas'},
    'controle_base_prestacoes': {'linhas': 60317, 'cols': 31, 'tipo': 'Base principal de prestações'},
    'controle_extrato': {'linhas': 17477, 'cols': 12, 'tipo': 'Extrato de transações'},
    'controle_painel': {'linhas': 721, 'cols': 27, 'tipo': 'Painel de controle geral'},
    'controle_quinzenas': {'linhas': 11065, 'cols': 9, 'tipo': 'Dados por quinzena'},
}

print('Tabelas candidatas:\n')
for table, info in candidates.items():
    print(f'{table}:')
    print(f'  Linhas: {info["linhas"]:,}')
    print(f'  Colunas: {info["cols"]}')
    print(f'  Tipo: {info["tipo"]}')
    print()

print('=== ANÁLISE DA controle_detalhes1 ===\n')
cursor.execute('PRAGMA table_info(controle_detalhes1)')
cols = cursor.fetchall()

# Colunas que podem ser verificadas via API VExpenses
api_verifiable = [
    'nome_do_membro_de_equipe',  # team-members.name
    'cpf',                        # team-members.cpf
    'cpf_cnpj',                   # team-members.cpf
    'centro_de_custos',           # team-members.costsCenters
    'status',                     # expense.status
    'id_da_despesa',              # expenses.id
    'id_do_relatório',            # reports.id
    'valor',                      # expense.amount
]

print('Colunas verificáveis via API VExpenses:')
for col in api_verifiable:
    if col in [c[1] for c in cols]:
        print(f'  ✓ {col}')
    else:
        print(f'  ✗ {col} (não encontrada)')

print('\n=== DADOS ÚNICOS NA TABELA ===\n')
cursor.execute('SELECT COUNT(DISTINCT cpf) FROM controle_detalhes1')
print(f'CPFs únicos: {cursor.fetchone()[0]}')

cursor.execute('SELECT COUNT(DISTINCT id_da_despesa) FROM controle_detalhes1')
print(f'IDs de despesa únicos: {cursor.fetchone()[0]}')

cursor.execute('SELECT COUNT(DISTINCT id_do_relatório) FROM controle_detalhes1')
print(f'IDs de relatório únicos: {cursor.fetchone()[0]}')

cursor.execute('SELECT COUNT(DISTINCT centro_de_custos) FROM controle_detalhes1')
print(f'Centros de custo únicos: {cursor.fetchone()[0]}')

conn.close()

print('\n=== RECOMENDAÇÃO ===\n')
print('A tabela **controle_detalhes1** é ideal para começar porque:')
print('  1. Poucas linhas (12) - fácil de testar e validar')
print('  2. Estrutura rica com dados de despesas')
print('  3. Tem campos que podem ser verificados via API:')
print('     - nome_do_membro_de_equipe → team-members.name')
print('     - cpf → team-members.cpf')
print('     - centro_de_custos → team-members.costsCenters')
print('     - id_da_despesa → expenses.id')
print('     - id_do_relatório → reports.id')
print('     - status → expense.status')
print('     - valor → expense.amount')
print('\nApós validar em Detalhes1, podemos escalar para controle_base_prestações (60k linhas)')
