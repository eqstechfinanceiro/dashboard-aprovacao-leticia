import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
cursor = conn.cursor()

tables = [
    'controle_painel',
    'controle_saldo_cartao',
    'controle_saldo_cartao_resumo',
    'controle_adicional_itau',
    'controle_adicionais',
    'controle_quinzenas',
    'controle_saldos_adm',
    'controle_extrato',
    'controle_base_prestacoes',
    'controle_reembolso',
    'controle_estorno_saque',
    'controle_detalhes1',
    'controle_detalhes2',
    'controle_detalhes3'
]

print('Análise das tabelas controle:\n')
for table in tables:
    cursor.execute(f'PRAGMA table_info({table})')
    cols = cursor.fetchall()
    cursor.execute(f'SELECT COUNT(*) FROM {table}')
    count = cursor.fetchone()[0]
    
    print(f'{table}:')
    print(f'  Colunas: {len(cols)}')
    print(f'  Linhas: {count}')
    print(f'  Colunas principais: {", ".join([c[1] for c in cols[:5]])}...')
    print()

conn.close()
