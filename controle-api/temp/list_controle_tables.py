import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
cursor = conn.cursor()

# Get all controle tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'controle%'")
tables = [row[0] for row in cursor.fetchall()]

print("Controle tables:")
for table in tables:
    print(f"  - {table}")
    
# Check which tables have cpf, colaborador/nome, and situação columns
print("\nTables with relevant columns:")
for table in tables:
    cursor.execute(f"PRAGMA table_info({table})")
    columns = {row[1]: row[1] for row in cursor.fetchall()}
    has_cpf = 'cpf' in columns
    has_nome = 'colaborador' in columns or 'nome' in columns or 'portador' in columns
    has_situacao = 'situação' in columns or 'situacao' in columns
    
    if has_cpf or has_nome or has_situacao:
        print(f"\n{table}:")
        if has_cpf:
            print(f"  ✓ cpf")
        if has_nome:
            nome_col = 'colaborador' if 'colaborador' in columns else ('nome' if 'nome' in columns else 'portador')
            print(f"  ✓ {nome_col}")
        if has_situacao:
            situacao_col = 'situação' if 'situação' in columns else 'situacao'
            print(f"  ✓ {situacao_col}")

conn.close()
