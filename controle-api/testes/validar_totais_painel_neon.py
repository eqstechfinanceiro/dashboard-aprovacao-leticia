#!/usr/bin/env python3
"""
TAREFA 5 - Validacao decisiva: reproduzir os totais CARGA/TRANSFERENCIA/TARIFA
da 1a e 2a QZ de maio a partir do extrato_movimentacao (Neon) e comparar com os
valores VALIDADOS em datas_quinzena_validado_final.md.

Mapeamento testado:
  CARGA         = SUM(valor) WHERE tipo='Transferência' AND valor > 0
  TRANSFERENCIA = -SUM(valor) WHERE tipo='Transferência' AND valor < 0   (magnitude)
  TARIFA        = -SUM(valor) WHERE tipo='Taxa'                          (magnitude)
  SALDO         = CARGA - TRANSFERENCIA - TARIFA
"""
import os
from pathlib import Path
from dotenv import load_dotenv
import psycopg2

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor()

GABARITO = {
    "1a QZ (26/04-10/05)": {
        "start": "2026-04-26", "end": "2026-05-10",
        "carga": 360533.50, "transferencia": 50494.94, "tarifa": 2471.59,
        "saldo": 307566.97, "transacoes": 862,
    },
    "2a QZ (11/05-25/05)": {
        "start": "2026-05-11", "end": "2026-05-25",
        "carga": 2060.51, "transferencia": 560.00, "tarifa": 7.00,
        "saldo": 1493.51, "transacoes": 12,
    },
}

def fmt(v):
    return f"R$ {v:>13,.2f}"

for nome, g in GABARITO.items():
    print("=" * 80)
    print(f"  {nome}")
    print("=" * 80)

    # CARGA = transferencia positiva
    cur.execute("""
        SELECT COALESCE(SUM(valor),0), COUNT(*) FROM extrato_movimentacao
        WHERE tipo='Transferência' AND valor > 0 AND data BETWEEN %s AND %s
    """, (g["start"], g["end"]))
    carga, n_carga = cur.fetchone()
    carga = float(carga)

    # TRANSFERENCIA = transferencia negativa (magnitude)
    cur.execute("""
        SELECT COALESCE(SUM(valor),0), COUNT(*) FROM extrato_movimentacao
        WHERE tipo='Transferência' AND valor < 0 AND data BETWEEN %s AND %s
    """, (g["start"], g["end"]))
    transf, n_transf = cur.fetchone()
    transf = -float(transf)

    # TARIFA = Taxa (magnitude)
    cur.execute("""
        SELECT COALESCE(SUM(valor),0), COUNT(*) FROM extrato_movimentacao
        WHERE tipo='Taxa' AND data BETWEEN %s AND %s
    """, (g["start"], g["end"]))
    tarifa, n_tarifa = cur.fetchone()
    tarifa = -float(tarifa)

    saldo = carga - transf - tarifa

    # total de transacoes (nao-snapshot)
    cur.execute("""
        SELECT COUNT(*) FROM extrato_movimentacao
        WHERE NOT is_snapshot AND data BETWEEN %s AND %s
    """, (g["start"], g["end"]))
    n_trans_total = cur.fetchone()[0]

    def linha(label, calc, esperado):
        diff = calc - esperado
        ok = "OK" if abs(diff) < 0.05 else f"DIFF {diff:+,.2f}"
        print(f"  {label:16} | calc={fmt(calc)} | gab={fmt(esperado)} | {ok}")

    linha("CARGA", carga, g["carga"])
    linha("TRANSFERENCIA", transf, g["transferencia"])
    linha("TARIFA", tarifa, g["tarifa"])
    linha("SALDO", saldo, g["saldo"])
    print(f"  {'transacoes':16} | calc={n_trans_total:>6} (carga+={n_carga}, transf-={n_transf}, taxa={n_tarifa}) | gab={g['transacoes']}")
    print()

cur.close(); conn.close()
