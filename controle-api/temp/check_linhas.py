import sqlite3
conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

total_planilha = conn.execute('SELECT COUNT(*) as c FROM carga_1qz_planilha1').fetchone()['c']
total_painel = conn.execute("SELECT COUNT(*) as c FROM controle_painel WHERE cpf IS NOT NULL AND cpf != ''").fetchone()['c']
total_qz = conn.execute("SELECT COUNT(DISTINCT cpf) as c FROM controle_quinzenas WHERE [m\u00eas]='MAIO' AND ano='2026.0' AND quinzena='1\u00aa QZ'").fetchone()['c']

print(f"carga_1qz_planilha1: {total_planilha} linhas")
print(f"controle_painel (nao vazios): {total_painel}")
print(f"controle_quinzenas MAIO 2026 1QZ: {total_qz} CPFs distintos")

# Situacoes
rows = conn.execute("SELECT [situa\u00e7\u00e3o], COUNT(*) as cnt FROM controle_painel GROUP BY [situa\u00e7\u00e3o]").fetchall()
print("\nSituacoes no painel:")
for r in rows: print(f"  situacao='{r['situa\u00e7\u00e3o']}': {r['cnt']}")

# Planilha real: quantas linhas tem situacao ATIVO vs outros
rows2 = conn.execute("SELECT [situa\u00e7\u00e3o], COUNT(*) as cnt FROM carga_1qz_planilha1 GROUP BY [situa\u00e7\u00e3o]").fetchall()
print("\nSituacoes na planilha real:")
for r in rows2: print(f"  situacao='{r['situa\u00e7\u00e3o']}': {r['cnt']}")

conn.close()
