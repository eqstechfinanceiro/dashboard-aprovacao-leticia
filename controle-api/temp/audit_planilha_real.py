import sqlite3
conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

print("=== Planilha REAL carga_1qz_planilha1 — top 10 saldo_reembolsar ===")
rows = conn.execute("""
    SELECT cpf, colaborador, saldo_reembolsar, saldo_final, saldo_cartao, [col_1ª_qz], carga_final
    FROM carga_1qz_planilha1
    WHERE saldo_reembolsar > 0
    ORDER BY CAST(saldo_reembolsar AS FLOAT) DESC
    LIMIT 10
""").fetchall()
for r in rows:
    print(dict(r))

print("\n=== Comparação: painel atual vs planilha real para os mesmos CPFs ===")
rows_real = conn.execute("SELECT cpf, saldo_final as sf_real, saldo_reembolsar as reimb_real FROM carga_1qz_planilha1 WHERE saldo_reembolsar > 0 LIMIT 10").fetchall()
cpfs = [r['cpf'] for r in rows_real]
for r in rows_real:
    painel = conn.execute("SELECT saldo_final FROM controle_painel WHERE cpf=?", (r['cpf'],)).fetchone()
    sf_atual = float(painel['saldo_final'] or 0) if painel else None
    print(f"  cpf={r['cpf']} reimb_real={r['reimb_real']}  sf_real={r['sf_real']}  sf_atual={sf_atual}")

print("\n=== Verifica se existe saldo_prestacao ou saldo_periodo na planilha ===")
cols = [r['name'] for r in conn.execute('PRAGMA table_info(carga_1qz_planilha1)').fetchall()]
print("Colunas:", cols)

# Verifica controle_base_prestacoes para entender saldo_reembolsar
print("\n=== controle_base_prestacoes colunas ===")
cols_bp = [r['name'] for r in conn.execute('PRAGMA table_info(controle_base_prestacoes)').fetchall()]
print(cols_bp)
row = conn.execute("SELECT * FROM controle_base_prestacoes LIMIT 1").fetchone()
if row: print(dict(row))

conn.close()
