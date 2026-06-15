import sqlite3
import sys

db_path = "data/spreadsheets.db"

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Estrutura da tabela controle_painel
print("Estrutura da tabela controle_painel:")
print("=" * 60)
cursor.execute("PRAGMA table_info(controle_painel)")
columns = cursor.fetchall()
for col in columns:
    print(f"  {col[1]} ({col[2]})")

# Verificar dados de JORGE ANTONIO em detalhe
print("\nDados completos de JORGE ANTONIO:")
print("=" * 60)
cursor.execute("SELECT * FROM controle_painel WHERE cpf = '01063690080'")
row = cursor.fetchone()
if row:
    for i, col in enumerate(columns):
        print(f"  {col[1]}: {row[i]}")

# Verificar se há colunas que indicam origem dos dados
print("\nColunas que podem indicar origem:")
print("=" * 60)
for col in columns:
    col_name = col[1].lower()
    if any(keyword in col_name for keyword in ['api', 'excel', 'import', 'source', 'origem', 'data']):
        print(f"  {col[1]}")

# Contar total de registros
cursor.execute("SELECT COUNT(*) FROM controle_painel")
total = cursor.fetchone()[0]
print(f"\nTotal de registros em controle_painel: {total}")

# Verificar data de atualização
cursor.execute("SELECT MAX(updated_at) FROM controle_painel" if 'updated_at' in [c[1] for c in columns] else "SELECT MAX(data) FROM controle_painel")
try:
    max_date = cursor.fetchone()[0]
    print(f"Data mais recente: {max_date}")
except:
    pass

conn.close()
