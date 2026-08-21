import sqlite3
import sys

db_path = "data/spreadsheets.db"

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Listar tabelas
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = cursor.fetchall()

print("Tabelas no spreadsheets.db:")
for table in tables:
    print(f"  - {table[0]}")

# Buscar JORGE ANTONIO e JOSE MARCOS em controle_painel
print("\nBuscando JORGE ANTONIO e JOSE MARCOS em controle_painel:")
print("=" * 60)

try:
    cursor.execute("SELECT * FROM controle_painel WHERE colaborador LIKE '%JORGE%' OR colaborador LIKE '%JOSE MARCOS%' OR cpf IN ('01063690080', '69071934004') LIMIT 10")
    rows = cursor.fetchall()
    
    if rows:
        # Pegar nomes das colunas
        cursor.execute("PRAGMA table_info(controle_painel)")
        columns = [col[1] for col in cursor.fetchall()]
        
        for row in rows:
            print(f"CPF: {row[columns.index('cpf')] if 'cpf' in columns else 'N/A'}")
            print(f"Nome: {row[columns.index('colaborador')] if 'colaborador' in columns else 'N/A'}")
            print(f"CARGA: {row[columns.index('carga')] if 'carga' in columns else 'N/A'}")
            print(f"TRANSFERENCIA: {row[columns.index('transferencia')] if 'transferencia' in columns else 'N/A'}")
            print(f"TARIFA: {row[columns.index('tarifa')] if 'tarifa' in columns else 'N/A'}")
            print(f"SALDO CARTAO: {row[columns.index('saldo_cartao')] if 'saldo_cartao' in columns else 'N/A'}")
            print("-" * 40)
    else:
        print("Nenhum registro encontrado")
        
except Exception as e:
    print(f"Erro: {e}")

conn.close()
