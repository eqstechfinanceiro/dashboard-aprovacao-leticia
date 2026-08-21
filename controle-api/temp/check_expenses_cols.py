import sqlite3
conn = sqlite3.connect('data/spreadsheets.db')
# Colunas da tabela expenses
cols = [r[1] for r in conn.execute('PRAGMA table_info(expenses)').fetchall()]
print("Colunas expenses:", cols)
print()
# Amostra de valores relevantes
row = conn.execute("""
    SELECT id, report_name, data, establishment_cpf_cnpj, description, reimbursable,
           notes, costs_center_name, costs_center_description, payment_method_name,
           created_at
    FROM expenses LIMIT 1
""").fetchone()
if row:
    for i, col in enumerate(['id','report_name','data','establishment_cpf_cnpj','description',
                              'reimbursable','notes','costs_center_name','costs_center_description',
                              'payment_method_name','created_at']):
        print(f"  {col}: {repr(row[i])}")
