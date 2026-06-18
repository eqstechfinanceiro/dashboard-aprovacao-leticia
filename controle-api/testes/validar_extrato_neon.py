#!/usr/bin/env python3
"""Valida a integridade do extrato no Neon: cobertura por mes + snapshot conhecido."""
import os
from pathlib import Path
from dotenv import load_dotenv
import psycopg2

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor()

print("=" * 70)
print("COBERTURA POR MES")
print("=" * 70)
cur.execute("""
    SELECT EXTRACT(MONTH FROM data)::int AS mes,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE is_snapshot) AS snapshots,
           COUNT(DISTINCT usuario) AS usuarios
    FROM extrato_movimentacao
    GROUP BY mes ORDER BY mes
""")
print(f"{'Mes':>4} | {'Total':>7} | {'Snapshots':>9} | {'Usuarios':>8}")
for mes, total, snaps, users in cur.fetchall():
    print(f"{mes:>4} | {total:>7} | {snaps:>9} | {users:>8}")

print("\n" + "=" * 70)
print("SNAPSHOT CONHECIDO: Jonas Cavalcanti (esperado R$ 15,21 em ~30/04)")
print("=" * 70)
cur.execute("""
    SELECT data, valor FROM extrato_movimentacao
    WHERE usuario ILIKE '%Jonas Cavalcanti%' AND is_snapshot
    AND data BETWEEN '2026-04-28' AND '2026-05-02'
    ORDER BY data
""")
for data, valor in cur.fetchall():
    flag = " <-- MATCH!" if abs(float(valor) - 15.21) < 0.01 else ""
    print(f"  {data} | R$ {float(valor):>10.2f}{flag}")

print("\n" + "=" * 70)
print("AMOSTRA: ultimas movimentacoes de um usuario qualquer")
print("=" * 70)
cur.execute("""
    SELECT data, hora, tipo, valor, descricao FROM extrato_movimentacao
    WHERE usuario ILIKE '%Victor Miguel Palaro%'
    ORDER BY data DESC, hora DESC LIMIT 8
""")
for data, hora, tipo, valor, desc in cur.fetchall():
    tipo_s = tipo or "SNAPSHOT"
    desc_s = (desc or "")[:30]
    print(f"  {data} {hora or '--':>8} | {tipo_s:12} | R$ {float(valor):>9.2f} | {desc_s}")

cur.close()
conn.close()
