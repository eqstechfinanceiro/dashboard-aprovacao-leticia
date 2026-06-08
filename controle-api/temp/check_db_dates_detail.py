import sqlite3

# Verificar amostras de datas no banco para entender o formato
conn = sqlite3.connect('data/spreadsheets.db')
cur = conn.execute('SELECT data, COUNT(*) as count FROM controle_base_prestacoes WHERE data IS NOT NULL GROUP BY data ORDER BY data LIMIT 20')
rows = cur.fetchall()

print("Amostras de datas no banco (primeiras 20 únicas):")
for date, count in rows:
    print(f"  {date}: {count} registros")

print(f"\nTotal de datas únicas: {len(rows)}")

# Verificar também as datas que parecem estar em 2025
cur = conn.execute('SELECT data, COUNT(*) as count FROM controle_base_prestacoes WHERE data LIKE "%/2025" GROUP BY data ORDER BY data LIMIT 10')
rows_2025 = cur.fetchall()

print(f"\nDatas com ano 2025 (primeiras 10):")
for date, count in rows_2025:
    print(f"  {date}: {count} registros")

conn.close()
