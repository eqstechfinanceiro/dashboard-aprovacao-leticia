import sqlite3
conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

casos = [
    ('12609931670', 'TULIO'),
    ('99114160030', 'WALTER'),
    ('09246793790', 'JUSTINO'),
    ('68746458204', 'MOISES'),
    ('07646535630', 'HUGO'),
    ('02027745203', 'ABNER'),
    ('01932662537', 'ADAN'),
]

print(f"{'Nome':<12} {'resumo':>10} {'hist_recente':>14} {'planilha_real':>14}")
print("-"*56)
for cpf, nome in casos:
    resumo = conn.execute('SELECT valor, data FROM controle_saldo_cartao_resumo WHERE cpf=? ORDER BY data DESC LIMIT 1', (cpf,)).fetchone()
    hist = conn.execute('SELECT valor, data FROM controle_saldo_cartao WHERE cpf=? ORDER BY data DESC LIMIT 1', (cpf,)).fetchone()
    real = conn.execute('SELECT saldo_cartao FROM carga_1qz_planilha1 WHERE cpf=?', (cpf,)).fetchone()
    vr = resumo['valor'] if resumo else 'N/A'
    vh = hist['valor'] if hist else 'N/A'
    vp = real['saldo_cartao'] if real else 'N/A'
    print(f"{nome:<12} {str(vr):>10} {str(vh):>14} {str(vp):>14}")

# Quantos CPFs da planilha real têm match com resumo vs historico
print("\n=== Match resumo vs planilha real ===")
real_rows = conn.execute('SELECT cpf, saldo_cartao FROM carga_1qz_planilha1').fetchall()
ok_resumo = ok_hist = total = 0
for r in real_rows:
    cpf = r['cpf']
    vp = float(r['saldo_cartao'] or 0)
    resumo = conn.execute('SELECT valor FROM controle_saldo_cartao_resumo WHERE cpf=? ORDER BY data DESC LIMIT 1', (cpf,)).fetchone()
    hist = conn.execute('SELECT valor FROM controle_saldo_cartao WHERE cpf=? ORDER BY data DESC LIMIT 1', (cpf,)).fetchone()
    vr = float(resumo['valor'] or 0) if resumo else 0
    vh = float(hist['valor'] or 0) if hist else 0
    total += 1
    if abs(vr - vp) <= 0.1: ok_resumo += 1
    if abs(vh - vp) <= 0.1: ok_hist += 1

print(f"resumo match: {ok_resumo}/{total} = {ok_resumo/total*100:.1f}%")
print(f"hist_recente match: {ok_hist}/{total} = {ok_hist/total*100:.1f}%")

# Estrutura do resumo
print("\n=== controle_saldo_cartao_resumo colunas e amostra ===")
cols = [r['name'] for r in conn.execute('PRAGMA table_info(controle_saldo_cartao_resumo)').fetchall()]
print("Colunas:", cols)
rows = conn.execute('SELECT * FROM controle_saldo_cartao_resumo WHERE cpf=? ORDER BY data DESC LIMIT 3', ('02027745203',)).fetchall()
for row in rows: print(dict(row))

conn.close()
