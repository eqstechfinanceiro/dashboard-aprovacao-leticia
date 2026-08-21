import sqlite3
conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row
cols = conn.execute(
    "SELECT table_column_name FROM column_info WHERE spreadsheet_id=(SELECT id FROM spreadsheet_info WHERE table_name='carga_1qz_planilha1')"
).fetchall()
for c in cols:
    print(repr(c['table_column_name']))
