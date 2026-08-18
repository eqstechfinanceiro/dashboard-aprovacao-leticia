import sqlite3
from datetime import datetime

# Verificar range real de datas no banco
conn = sqlite3.connect('data/spreadsheets.db')
cur = conn.execute('SELECT MIN(data), MAX(data), COUNT(*) FROM controle_base_prestacoes WHERE data IS NOT NULL')
min_date, max_date, count = cur.fetchone()

print(f"Range de datas no banco:")
print(f"  Data mínima: {min_date}")
print(f"  Data máxima: {max_date}")
print(f"  Total de registros com data: {count:,}")

# Tentar converter as datas para entender o formato
try:
    # Formato brasileiro DD/MM/YYYY
    if min_date:
        parts = min_date.split('/')
        if len(parts) == 3:
            day, month, year = parts
            print(f"\n  Data mínima parseada: dia={day}, mês={month}, ano={year}")
    if max_date:
        parts = max_date.split('/')
        if len(parts) == 3:
            day, month, year = parts
            print(f"  Data máxima parseada: dia={day}, mês={month}, ano={year}")
except Exception as e:
    print(f"Erro ao parsear datas: {e}")

conn.close()
