"""
Compara: colunas reais da planilha vs checks definidos no REGISTRY.
Identifica onde o badge 100% é falso (checks=0 yellow mas colunas sem check).
"""
import sqlite3, sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.checks import REGISTRY

conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

sheets = conn.execute('SELECT id, sheet_name, table_name FROM spreadsheet_info ORDER BY id').fetchall()

print(f"{'TABLE':<45} {'COLS_PLAN':>9} {'CHECKS':>7} {'YELLOW':>7} {'UNCHECKED':>10} {'STATUS'}")
print("-" * 90)
for s in sheets:
    tn = s['table_name']
    cols_count = conn.execute('SELECT COUNT(*) as cnt FROM column_info WHERE spreadsheet_id=?', (s['id'],)).fetchone()['cnt']
    checks = REGISTRY.get(tn, [])
    n_checks = len(checks)
    n_yellow = sum(1 for c in checks if type(c).__name__ == '_YellowCheck')
    unchecked_cols = cols_count - n_checks
    
    if n_checks == 0:
        status = "SEM CHECKS"
    elif n_yellow == 0 and unchecked_cols == 0:
        status = "✅ 100% REAL"
    elif n_yellow == 0 and unchecked_cols > 0:
        status = "⚠️  BADGE FALSO"
    elif n_yellow > 0:
        status = f"PARCIAL ({n_yellow} yellow)"
    else:
        status = "?"
    
    print(f"{tn:<45} {cols_count:>9} {n_checks:>7} {n_yellow:>7} {unchecked_cols:>10}   {status}")

print()
print("=== DETALHE: quais colunas NÃO têm check? ===")
for s in sheets:
    tn = s['table_name']
    checks = REGISTRY.get(tn, [])
    checked_cols = {c.column for c in checks}
    all_cols = conn.execute('SELECT table_column_name, column_name FROM column_info WHERE spreadsheet_id=? ORDER BY col_order', (s['id'],)).fetchall()
    unchecked = [c for c in all_cols if c['table_column_name'] not in checked_cols]
    if unchecked:
        print(f"\n{tn} ({len(unchecked)} sem check):")
        for c in unchecked:
            print(f"  - {c['table_column_name']} ({c['column_name']})")
