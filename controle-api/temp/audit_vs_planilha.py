import sqlite3, urllib.request, json
conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

# Pega o que a API retorna para MAIO 2026 1QZ
with urllib.request.urlopen('http://localhost:3000/api/carga-qz?mes=MAIO&ano=2026&quinzena=1%C2%AA%20QZ') as r:
    api_data = {x['cpf']: x for x in json.loads(r.read())['data']}

# Pega a planilha real importada
real_data = {r['cpf']: dict(r) for r in conn.execute('SELECT * FROM carga_1qz_planilha1').fetchall()}

def sf(v):
    try: return float(v) if v not in (None, '', 'None') else 0.0
    except: return 0.0

print(f"{'CPF':<14} {'Coluna':<20} {'API':>12} {'PLANILHA':>12} {'DIFF':>10}")
print("-"*72)

cols_check = [
    ('saldo_reembolsar', 'saldoReembolsar'),
    ('saldo_final', 'saldoFinal'),
    ('saldo_cartao', 'saldoCartao'),
    ('col_1ª_qz', 'col1qz'),
    ('carga_final', 'cargaFinal'),
]

divergencias = 0
for cpf, real in real_data.items():
    api = api_data.get(cpf)
    if not api:
        continue
    for col_real, col_api in cols_check:
        vr = sf(real.get(col_real))
        va = api.get(col_api, 0) or 0
        diff = va - vr
        if abs(diff) > 0.1:
            nome = real.get('colaborador', '')[:20]
            print(f"{cpf:<14} {col_real:<20} {va:>12.2f} {vr:>12.2f} {diff:>+10.2f}  {nome}")
            divergencias += 1

print(f"\nTotal divergências > R$0.10: {divergencias}")

# Resumo por coluna
print("\n=== Match % por coluna ===")
for col_real, col_api in cols_check:
    ok = sum(1 for cpf, real in real_data.items()
             if cpf in api_data and abs((api_data[cpf].get(col_api) or 0) - sf(real.get(col_real))) <= 0.1)
    total = sum(1 for cpf in real_data if cpf in api_data)
    print(f"  {col_real:<22}: {ok}/{total} = {ok/total*100:.1f}%")

conn.close()
