#!/usr/bin/env python3
"""Ver o que ha de dados de despesas/relatorios ja baixados localmente (SQLite)."""
import sqlite3
from pathlib import Path

BASE = Path(__file__).parent.parent
db = BASE / "data" / "historico_extrato.db"
print(f"DB: {db} ({db.stat().st_size/1e6:.1f} MB)")
con = sqlite3.connect(db)
tabelas = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
print(f"Tabelas: {tabelas}\n")
for t in tabelas:
    try:
        n = con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        cols = [d[1] for d in con.execute(f'PRAGMA table_info("{t}")')]
        print(f"  {t}: {n} linhas | colunas: {cols}")
    except Exception as e:
        print(f"  {t}: erro {e}")
con.close()
