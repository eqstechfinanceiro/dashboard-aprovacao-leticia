import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
cursor = conn.cursor()

# Total
cursor.execute('SELECT COUNT(*) FROM controle_extrato')
print(f"Total: {cursor.fetchone()[0]:,}")

# Sample data
cursor.execute('SELECT * FROM controle_extrato LIMIT 3')
print("\nAmostra:")
for row in cursor.fetchall():
    print(row)

# Unique CPFs
cursor.execute('SELECT COUNT(DISTINCT cpf) FROM controle_extrato WHERE cpf IS NOT NULL')
print(f"\nCPFs únicos: {cursor.fetchone()[0]:,}")

conn.close()
