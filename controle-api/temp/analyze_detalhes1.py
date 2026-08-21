import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
cursor = conn.cursor()

print('=== ANÁLISE DETALHADA: controle_detalhes1 ===\n')

cursor.execute('PRAGMA table_info(controle_detalhes1)')
cols = cursor.fetchall()
print(f'Total de colunas: {len(cols)}\n')
print('Colunas:')
for i, col in enumerate(cols, 1):
    print(f'  {i:2d}. {col[1]:30s} ({col[2]})')

print('\n=== DADOS DE AMOSTRA ===\n')
cursor.execute('SELECT * FROM controle_detalhes1 LIMIT 3')
rows = cursor.fetchall()
col_names = [c[1] for c in cols]

for i, row in enumerate(rows, 1):
    print(f'Linha {i}:')
    for j, val in enumerate(row):
        print(f'  {col_names[j]:30s}: {val}')
    print()

conn.close()
