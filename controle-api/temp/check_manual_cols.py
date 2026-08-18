import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

MANUAL_COLS = {
    "carga_1qz_planilha1": ["col_1\u00aaqz", "adiantamento", "obs"],
}
print(repr(MANUAL_COLS["carga_1qz_planilha1"][0]))

# Verificar contra nome real no banco
import sqlite3
conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row
cols = conn.execute(
    "SELECT table_column_name FROM column_info WHERE spreadsheet_id=(SELECT id FROM spreadsheet_info WHERE table_name='carga_1qz_planilha1')"
).fetchall()
real_names = [c['table_column_name'] for c in cols]
print("Nome no banco:", repr(real_names[9]))  # col_1ª_qz é o índice 9
print("Match:", MANUAL_COLS["carga_1qz_planilha1"][0] == real_names[9])
print("Todos os nomes manuais no banco:", [n for n in real_names if n in MANUAL_COLS["carga_1qz_planilha1"]])
