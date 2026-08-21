import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
cursor = conn.cursor()

# Verificar amostra de payment_method no banco
cursor.execute('SELECT id, payment_method_id, payment_method_name FROM expenses LIMIT 10')
print("Amostra de payment_method no banco:")
for row in cursor.fetchall():
    print(row)

# Contar quantos têm payment_method_name vazio
cursor.execute('SELECT COUNT(*) FROM expenses WHERE payment_method_name IS NULL OR payment_method_name = ""')
print(f"\nPayment method name vazio: {cursor.fetchone()[0]:,}")

# Contar quantos têm payment_method_id
cursor.execute('SELECT COUNT(*) FROM expenses WHERE payment_method_id IS NOT NULL')
print(f"Payment method ID preenchido: {cursor.fetchone()[0]:,}")

# Verificar valores únicos de payment_method_id
cursor.execute('SELECT DISTINCT payment_method_id FROM expenses WHERE payment_method_id IS NOT NULL LIMIT 10')
print("\nPayment method IDs únicos (amostra):")
for row in cursor.fetchall():
    print(row)

conn.close()
