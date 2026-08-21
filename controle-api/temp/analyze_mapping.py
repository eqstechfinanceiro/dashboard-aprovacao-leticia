import sqlite3
import json

conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

# Ver todas as tabelas
tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
print("TABELAS:", [t['name'] for t in tables])
print()

# Ver colunas da planilha de carga quinzenal
info = conn.execute("SELECT * FROM spreadsheet_info WHERE table_name LIKE '%carga%' OR table_name LIKE '%1qz%'").fetchall()
for s in info:
    print(f"SHEET: {s['sheet_name']} | TABLE: {s['table_name']} | FILE: {s['file_name']}")
    cols = conn.execute("SELECT column_letter, column_name, table_column_name, is_formula, formula_sample FROM column_info WHERE spreadsheet_id=? ORDER BY col_order", (s['id'],)).fetchall()
    for c in cols:
        marker = "FORMULA" if c['is_formula'] else "DATA"
        print(f"  [{marker}] {c['column_letter']}: {c['column_name']} -> {c['table_column_name']}")
        if c['formula_sample']:
            print(f"    formula: {c['formula_sample'][:100]}")
print()

# Ver uma amostra dos dados da carga quinzenal
carga_tables = [t['name'] for t in tables if 'carga' in t['name'].lower() or '1qz' in t['name'].lower()]
for ct in carga_tables:
    print(f"\n=== AMOSTRA: {ct} ===")
    rows = conn.execute(f'SELECT * FROM "{ct}" LIMIT 3').fetchall()
    if rows:
        print("COLUNAS:", list(rows[0].keys()))
        for r in rows[:2]:
            print(dict(r))
