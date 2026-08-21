import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
cur = conn.execute('SELECT name FROM sqlite_master WHERE type="table"')
print('Tabelas no banco:')
for row in cur.fetchall():
    print(f'  {row[0]}')
conn.close()
