"""
Mostra quais colunas NÃO-VAZIAS das planilhas detalhes1/2/3 ainda não têm check definido.
"""
import sqlite3, sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.checks import REGISTRY

conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

for table in ['controle_detalhes1', 'controle_detalhes2', 'controle_detalhes3']:
    sid = conn.execute("SELECT id FROM spreadsheet_info WHERE table_name=?", (table,)).fetchone()['id']
    all_cols = conn.execute(
        "SELECT table_column_name, column_name FROM column_info WHERE spreadsheet_id=? ORDER BY col_order",
        (sid,)
    ).fetchall()

    # Colunas vazias
    empty_cols = set()
    for c in all_cols:
        col = c['table_column_name']
        cnt = conn.execute(
            f"SELECT COUNT(*) FROM [{table}] WHERE [{col}] IS NOT NULL"
            f" AND TRIM(CAST([{col}] AS TEXT)) != ''"
            f" AND CAST([{col}] AS TEXT) != '0'"
            f" AND CAST([{col}] AS TEXT) != '0.0'"
        ).fetchone()[0]
        if cnt == 0:
            empty_cols.add(col)

    checked_cols = {c.column for c in REGISTRY.get(table, [])}

    print(f"\n{'='*60}")
    print(f"{table}")
    print(f"{'='*60}")
    print(f"Total colunas: {len(all_cols)} | Vazias: {len(empty_cols)} | Efetivas: {len(all_cols)-len(empty_cols)} | Com check: {len(checked_cols)}")
    print()
    print("✅ COM CHECK (mapeadas):")
    for c in all_cols:
        col = c['table_column_name']
        if col in checked_cols and col not in empty_cols:
            print(f"   ✅ {c['column_name']} ({col})")

    print()
    print("❌ SEM CHECK (precisam mapear - não vazias):")
    for c in all_cols:
        col = c['table_column_name']
        if col not in checked_cols and col not in empty_cols:
            # Mostra amostra do valor
            sample = conn.execute(
                f"SELECT [{col}] FROM [{table}] WHERE [{col}] IS NOT NULL AND TRIM(CAST([{col}] AS TEXT)) != '' LIMIT 1"
            ).fetchone()
            sample_val = sample[0] if sample else '—'
            print(f"   ❌ {c['column_name']} ({col})  ex: {repr(str(sample_val)[:40])}")

    print()
    print("⬜ VAZIAS (ignoradas):")
    for c in all_cols:
        col = c['table_column_name']
        if col in empty_cols:
            print(f"   ⬜ {c['column_name']}")
