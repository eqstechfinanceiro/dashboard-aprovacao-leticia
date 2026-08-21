"""
Verificar quais IDs da planilha não estão no banco
"""
import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
cursor = conn.cursor()

# IDs na planilha
cursor.execute('SELECT id_da_despesa FROM controle_base_prestacoes WHERE id_da_despesa IS NOT NULL')
spreadsheet_ids = set(int(float(row[0])) for row in cursor.fetchall() if row[0])

# IDs no banco
cursor.execute('SELECT id FROM expenses')
db_ids = set(row[0] for row in cursor.fetchall())

# IDs faltando
missing_ids = spreadsheet_ids - db_ids

print(f"IDs na planilha: {len(spreadsheet_ids):,}")
print(f"IDs no banco: {len(db_ids):,}")
print(f"IDs faltando: {len(missing_ids):,}")

if missing_ids:
    print(f"\nAmostra de IDs faltando (primeiros 20):")
    for i, eid in enumerate(sorted(list(missing_ids))[:20]):
        print(f"  {eid}")
    
    # Verificar range
    print(f"\nRange de IDs faltando:")
    print(f"  Min: {min(missing_ids):,}")
    print(f"  Max: {max(missing_ids):,}")

conn.close()
