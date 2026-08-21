import sqlite3
conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

# Estrutura do controle_saldo_cartao (histórico)
cols = [r['name'] for r in conn.execute('PRAGMA table_info(controle_saldo_cartao)').fetchall()]
print('Colunas controle_saldo_cartao:', cols)

# Datas distintas (serial Excel → converter)
rows = conn.execute('SELECT DISTINCT data, [mês] FROM controle_saldo_cartao ORDER BY data').fetchall()
print('\nDatas distintas:')
for r in rows:
    # Serial Excel: 45000 ≈ 2023. 45819 = 1 jun 2025
    serial = float(r['data'] or 0)
    import datetime
    if serial > 0:
        dt = datetime.date(1899, 12, 30) + datetime.timedelta(days=int(serial))
    else:
        dt = None
    print(f"  serial={r['data']} → {dt}  mes={r['mês']}")

# Amostra para um CPF específico
print('\nHistórico ABNER (02027745203):')
rows = conn.execute(
    'SELECT data, [mês], valor FROM controle_saldo_cartao WHERE cpf=? ORDER BY data',
    ('02027745203',)
).fetchall()
for r in rows:
    serial = float(r['data'] or 0)
    import datetime
    dt = datetime.date(1899, 12, 30) + datetime.timedelta(days=int(serial)) if serial > 0 else None
    print(f"  {dt} ({r['mês']}): valor={r['valor']}")

conn.close()
