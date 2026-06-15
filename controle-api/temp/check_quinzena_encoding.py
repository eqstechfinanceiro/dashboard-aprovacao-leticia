import sqlite3
conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

# Mostra os valores EXATOS de quinzena no banco (bytes)
rows = conn.execute("SELECT DISTINCT quinzena FROM controle_quinzenas").fetchall()
for r in rows:
    v = r['quinzena']
    print(repr(v), '->', v.encode('utf-8'))

conn.close()
