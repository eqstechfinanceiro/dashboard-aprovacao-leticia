"""
Identifica colunas que estão completamente vazias/nulas em cada tabela.
Essas colunas não devem ser contadas no denominador do percentual de mapeamento.
"""
import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'controle_%' OR name='carga_1qz_planilha1'").fetchall()]

for table in sorted(tables):
    try:
        # Pega todas as colunas da tabela
        cols = [r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]
        total_rows = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        if total_rows == 0:
            continue
        
        empty_cols = []
        nonempty_cols = []
        for col in cols:
            # Conta valores não nulos e não vazios
            cnt = conn.execute(
                f"SELECT COUNT(*) FROM {table} WHERE [{col}] IS NOT NULL AND TRIM(CAST([{col}] AS TEXT)) != '' AND CAST([{col}] AS TEXT) != '0' AND CAST([{col}] AS TEXT) != '0.0'"
            ).fetchone()[0]
            if cnt == 0:
                empty_cols.append(col)
            else:
                nonempty_cols.append((col, cnt))
        
        if empty_cols:
            print(f"\n{table} ({total_rows} linhas): {len(empty_cols)} colunas vazias de {len(cols)} total")
            print(f"  VAZIAS: {empty_cols}")
    except Exception as e:
        print(f"  ERRO em {table}: {e}")
