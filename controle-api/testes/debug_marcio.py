"""Investiga a divergencia do MARCIO CAMPOS RIBEIRO na 2QZ MAIO."""
import os
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
import openpyxl

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor()

cpf = "17427326822"

# Snapshot no Neon
cur.execute("""
    SELECT cpf, colaborador, situacao, status_cartao,
           saldo_prestacao, saldo_cartao, saldo_final,
           col_qz, saldo_reembolsar, saldo_final_carga, saldo_cartao_carga
    FROM quinzena_controle_snapshot
    WHERE year=2026 AND month=5 AND quinzena=2 AND cpf=%s
""", (cpf,))
r = cur.fetchone()
if r:
    print(f"Neon 2QZ: {r[1]} sit={r[2]} status={r[3]}")
    print(f"  saldo_prestacao={r[4]} saldo_cartao={r[5]} saldo_final={r[6]}")
    print(f"  col_qz={r[7]} saldo_reembolsar={r[8]} SF_carga={r[9]} SC_carga={r[10]}")

# Planilha ref 2QZ
wb = openpyxl.load_workbook(
    BASE / "data" / "CARGA 2 QZ MAIO 26 VEXPENSES EQS (1).xlsx",
    read_only=True, data_only=True
)
ws = wb["2 QZ DE MAIO 26"]
for row in ws.iter_rows(min_row=5, values_only=True):
    if row[2] is None:
        continue
    c = str(row[2]).strip().replace(".", "").replace("-", "").zfill(11)
    if c == cpf:
        print(f"\nPlanilha 2QZ: {row[1]}")
        print(f"  SALDO_PEND={row[7]} C1QZ={row[8]} SF={row[9]} 2QZ={row[10]}")
        print(f"  SC={row[11]} Adit={row[12]} CP={row[13]} Reem={row[14]} CF={row[15]}")
        print(f"  status={row[17]}")
wb.close()
conn.close()
