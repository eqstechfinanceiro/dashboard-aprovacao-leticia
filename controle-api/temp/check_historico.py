import sqlite3
conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

tabelas = [
    'controle_painel', 'controle_saldo_cartao', 'controle_saldo_cartao_resumo',
    'controle_extrato', 'controle_saldos_adm', 'controle_base_prestacoes',
    'controle_painel_prestacoes_ativos', 'controle_painel_prestacoes_desativados',
    'controle_adicionais', 'controle_reembolso', 'controle_aux',
]

for t in tabelas:
    try:
        cols = [r['name'] for r in conn.execute(f'PRAGMA table_info({t})').fetchall()]
        cnt = conn.execute(f'SELECT COUNT(*) FROM [{t}]').fetchone()[0]
        # Procura colunas de data/período
        date_cols = [c for c in cols if any(x in c.lower() for x in ['data', 'mes', 'mês', 'quinzena', 'ano', 'período', 'periodo'])]
        print(f'\n{t} ({cnt} linhas)')
        print(f'  Colunas data/período: {date_cols}')
        if date_cols:
            sample = conn.execute(f'SELECT DISTINCT [{date_cols[0]}] FROM [{t}] LIMIT 5').fetchall()
            print(f'  Valores distintos [{date_cols[0]}]: {[r[0] for r in sample]}')
    except Exception as e:
        print(f'{t}: ERRO {e}')

conn.close()
