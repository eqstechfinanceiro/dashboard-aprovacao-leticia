#!/usr/bin/env python3
"""Tipos distintos no extrato Neon + sinal de Transferencia + comparar com CONTROLE EXTRATO."""
import os
from pathlib import Path
from dotenv import load_dotenv
import psycopg2

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor()

print("=" * 70)
print("TIPOS DISTINTOS no extrato_movimentacao (Neon) - maio/2026")
print("=" * 70)
cur.execute("""
    SELECT COALESCE(tipo, '(SNAPSHOT)') AS tipo,
           COUNT(*) AS qtd,
           SUM(valor) AS soma,
           SUM(CASE WHEN valor > 0 THEN valor ELSE 0 END) AS soma_positiva,
           SUM(CASE WHEN valor < 0 THEN valor ELSE 0 END) AS soma_negativa
    FROM extrato_movimentacao
    WHERE data BETWEEN '2026-05-01' AND '2026-05-31'
    GROUP BY tipo ORDER BY qtd DESC
""")
print(f"{'TIPO':18} | {'QTD':>5} | {'SOMA':>12} | {'POS':>12} | {'NEG':>12}")
for tipo, qtd, soma, pos, neg in cur.fetchall():
    print(f"{tipo:18} | {qtd:>5} | {float(soma):>12.2f} | {float(pos):>12.2f} | {float(neg):>12.2f}")

print("\n" + "=" * 70)
print("DESCRICOES de Transferencia (amostra) - p/ ver se ha CARGA")
print("=" * 70)
cur.execute("""
    SELECT descricao, COUNT(*), SUM(valor)
    FROM extrato_movimentacao
    WHERE tipo = 'Transferência' AND data BETWEEN '2026-05-01' AND '2026-05-31'
    GROUP BY descricao ORDER BY COUNT(*) DESC LIMIT 15
""")
for desc, qtd, soma in cur.fetchall():
    print(f"  {qtd:>4}x | R$ {float(soma):>10.2f} | {(desc or '')[:50]}")

print("\n" + "=" * 70)
print("ABNER: extrato maio (p/ entender CARGA vs saldo)")
print("=" * 70)
cur.execute("""
    SELECT data, hora, tipo, valor, descricao
    FROM extrato_movimentacao
    WHERE usuario ILIKE '%Abner Andrade Cavalcante%'
      AND data BETWEEN '2026-05-01' AND '2026-05-15'
    ORDER BY data, hora
""")
for data, hora, tipo, valor, desc in cur.fetchall():
    print(f"  {data} {hora or '--':>8} | {(tipo or 'SNAP'):14} | R$ {float(valor):>9.2f} | {(desc or '')[:35]}")

cur.close(); conn.close()
