import sqlite3
conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row
cols = conn.execute(
    "SELECT table_column_name FROM column_info WHERE spreadsheet_id=(SELECT id FROM spreadsheet_info WHERE table_name='carga_1qz_planilha1')"
).fetchall()
real_names = [c['table_column_name'] for c in cols]

MANUAL_COLS = ["col_1\u00aa_qz", "adiantamento", "obs"]
print("manual_cols strings:", MANUAL_COLS)
print("match col_1ª_qz:", MANUAL_COLS[0] == real_names[9])
print("all matches:", [n for n in real_names if n in MANUAL_COLS])
