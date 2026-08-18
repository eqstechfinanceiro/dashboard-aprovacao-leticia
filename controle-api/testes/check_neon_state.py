"""Verifica estado atual do Neon para planejamento do pipeline automatico."""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import psycopg2

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor()

cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
print("Tabelas:", [r[0] for r in cur.fetchall()])

cur.execute("SELECT MIN(data), MAX(data), COUNT(*), COUNT(*) FILTER(WHERE is_snapshot) FROM extrato_movimentacao")
print("Extrato:", cur.fetchone())

cur.execute("SELECT DISTINCT quinzena FROM somase_snapshots ORDER BY quinzena")
print("somase quinzenas:", [r[0] for r in cur.fetchall()])

cur.execute("SELECT year, month, quinzena, COUNT(*) FROM quinzena_controle_snapshot GROUP BY year, month, quinzena ORDER BY year, month, quinzena")
print("controle_snapshot:", cur.fetchall())

cur.execute("SELECT MIN(data), MAX(data) FROM extrato_movimentacao WHERE tipo='Transferência' AND valor > 0")
print("Extrato CARGA range:", cur.fetchone())

cur.execute("""
    SELECT is_snapshot, tipo, COUNT(*), SUM(valor)
    FROM extrato_movimentacao
    WHERE data BETWEEN '2026-04-26' AND '2026-05-10'
    GROUP BY is_snapshot, tipo ORDER BY is_snapshot, tipo
""")
print("\nExtrato 1QZ MAIO (26abr-10mai):")
for r in cur.fetchall():
    print(f"  is_snap={r[0]} tipo={r[1]} count={r[2]} sum={r[3]}")

cur.execute("""
    SELECT is_snapshot, tipo, COUNT(*), SUM(valor)
    FROM extrato_movimentacao
    WHERE data BETWEEN '2026-05-11' AND '2026-05-25'
    GROUP BY is_snapshot, tipo ORDER BY is_snapshot, tipo
""")
print("\nExtrato 2QZ MAIO (11mai-25mai):")
for r in cur.fetchall():
    print(f"  is_snap={r[0]} tipo={r[1]} count={r[2]} sum={r[3]}")

conn.close()
