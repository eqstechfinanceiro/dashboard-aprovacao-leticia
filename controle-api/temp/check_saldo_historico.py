import sqlite3, datetime
conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

# Testa reconstrução de saldo do extrato para ABNER até ABRIL 2026
# saldo_cartao = soma de CARGA + TARIFA + TRANSFERÊNCIA até o mês
# Compara com saldo_cartao atual do controle_saldo_cartao

cpf = '02027745203'

# Acumulado de transações por mês
rows = conn.execute("""
    SELECT [mês], ano, SUM(CAST(valor AS FLOAT)) as total, COUNT(*) as cnt
    FROM controle_extrato
    WHERE cpf=?
    GROUP BY ano, [mês]
    ORDER BY ano, [mês]
""", (cpf,)).fetchall()

print('=== Extrato acumulado por mês (ABNER) ===')
acum = 0
for r in rows:
    acum += r['total']
    print(f"  {r['mês']} {r['ano']}: delta={r['total']:.2f}  acumulado={acum:.2f}  ({r['cnt']} transações)")

# Saldo cartão histórico
print('\n=== Saldo cartão histórico ===')
rows = conn.execute("""
    SELECT data, [mês], valor FROM controle_saldo_cartao WHERE cpf=? ORDER BY data
""", (cpf,)).fetchall()
for r in rows:
    serial = float(r['data'] or 0)
    dt = datetime.date(1899, 12, 30) + datetime.timedelta(days=int(serial))
    print(f"  {dt} ({r['mês']}): saldo_cartao={r['valor']}")

# Prestações por mês (base_prestacoes)
print('\n=== Prestações por mês (ABNER) ===')
rows = conn.execute("""
    SELECT [mês], SUM(CAST(valor AS FLOAT)) as total
    FROM controle_base_prestacoes
    WHERE cpf=?
    GROUP BY [mês]
    ORDER BY [mês]
""", (cpf,)).fetchall()
for r in rows:
    print(f"  {r['mês']}: prestações={r['total']:.2f}")

# Painel atual
print('\n=== Painel atual ===')
row = conn.execute("SELECT saldo_final, carga, transferencia, tarifa, [prestação_de_contas], saldo_cartao FROM controle_painel WHERE cpf=?", (cpf,)).fetchone()
if row: print(dict(row))

conn.close()
