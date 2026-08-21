"""
Estado real: o que já temos vs o que falta para gerar carga_1qz automaticamente.
"""
import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

# Colunas da carga_1qz
cols = conn.execute(
    "SELECT table_column_name FROM column_info WHERE spreadsheet_id=(SELECT id FROM spreadsheet_info WHERE table_name='carga_1qz_planilha1') ORDER BY col_order"
).fetchall()
col_names = [c['table_column_name'] for c in cols]

print("=== COLUNAS DA CARGA QZ ===")
for c in col_names:
    print(f"  {c}")

print()
print("=== AMOSTRA DE 3 LINHAS ===")
rows = conn.execute("SELECT * FROM carga_1qz_planilha1 LIMIT 3").fetchall()
for r in rows:
    for col in col_names:
        print(f"  {col}: {repr(r[col])}")
    print()

# Verificar quais fontes já temos no banco
print("=== TABELAS DISPONÍVEIS NO BANCO ===")
tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
for t in tables:
    cnt = conn.execute(f"SELECT COUNT(*) FROM [{t['name']}]").fetchone()[0]
    print(f"  {t['name']}: {cnt} linhas")
