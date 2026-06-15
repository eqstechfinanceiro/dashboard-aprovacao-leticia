import sqlite3
conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

# Quais períodos distintos existem em controle_quinzenas?
print("=== Períodos distintos em controle_quinzenas ===")
rows = conn.execute("""
    SELECT ano, [mês], quinzena, COUNT(*) as qtd
    FROM controle_quinzenas
    GROUP BY ano, [mês], quinzena
    ORDER BY ano, [mês], quinzena
""").fetchall()
for r in rows:
    print(f"  ano={r['ano']}  mes={r['mês']}  quinzena={r['quinzena']}  registros={r['qtd']}")

# Quantos CPFs têm valor em cada período?
print("\n=== Total de CPFs com valor > 0 por período ===")
rows2 = conn.execute("""
    SELECT ano, [mês], quinzena, COUNT(*) as qtd, SUM(CAST(valor AS FLOAT)) as total
    FROM controle_quinzenas
    WHERE CAST(valor AS FLOAT) > 0
    GROUP BY ano, [mês], quinzena
    ORDER BY ano, [mês], quinzena
""").fetchall()
for r in rows2:
    print(f"  {r['mês']} {r['ano']} {r['quinzena']}: {r['qtd']} CPFs, total={r['total']:.0f}")

# O valor da col_1ª_qz da planilha (manual) — de onde veio?
print("\n=== carga_1qz_planilha1: de onde vem col_1ª_qz? ===")
print("Amostra de 5 colaboradores com col_1ª_qz > 0:")
rows3 = conn.execute("""
    SELECT cpf, colaborador, [col_1ª_qz]
    FROM carga_1qz_planilha1
    WHERE CAST([col_1ª_qz] AS FLOAT) > 0
    LIMIT 5
""").fetchall()
for r in rows3:
    cpf = r['cpf']
    col1qz_planilha = r['col_1ª_qz']
    # Verifica se existe em controle_quinzenas para MAIO 2026 1QZ
    qz = conn.execute("""
        SELECT valor FROM controle_quinzenas
        WHERE cpf=? AND ano='2026.0' AND [mês]='MAIO' AND quinzena='1ª QZ'
    """, (cpf,)).fetchone()
    print(f"  {r['colaborador'][:30]}: planilha={col1qz_planilha}  quinzenas_db={qz['valor'] if qz else 'NÃO EXISTE'}")

# Verifica a planilha controle_quinzenas — ela tem mesmo as colunas corretas?
print("\n=== colunas de controle_quinzenas ===")
cols = [r['name'] for r in conn.execute('PRAGMA table_info(controle_quinzenas)').fetchall()]
print(cols)
row = conn.execute("SELECT * FROM controle_quinzenas LIMIT 1").fetchone()
print("Amostra:", dict(row))

conn.close()
