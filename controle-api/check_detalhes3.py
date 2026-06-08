import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
cursor = conn.cursor()

# Verificar estrutura da tabela
cursor.execute('PRAGMA table_info(controle_detalhes3)')
columns = cursor.fetchall()
print("Colunas da tabela controle_detalhes3:")
for col in columns:
    print(f"  {col[1]} ({col[2]})")

# Verificar quantidade de dados
cursor.execute('SELECT COUNT(*) FROM controle_detalhes3')
print(f"\nTotal de registros: {cursor.fetchone()[0]}")

# Verificar amostra de dados
cursor.execute('SELECT * FROM controle_detalhes3 LIMIT 3')
print("\nAmostra de dados:")
for row in cursor.fetchall():
    print(row)

conn.close()
