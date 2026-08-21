"""Investiga os 5 CPFs com col_qz divergente (ref=0, calc>0)."""
import os
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
import openpyxl

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor()

cpfs = ['37377394803', '39297665829', '02988581428', '04252409160', '71318758130']

cur.execute("""
    SELECT cpf, colaborador, col_qz, saldo_final_carga, saldo_cartao_carga, saldo_reembolsar
    FROM quinzena_controle_snapshot
    WHERE year=2026 AND month=5 AND quinzena=1 AND cpf = ANY(%s)
""", (cpfs,))
print("Neon snapshot 1QZ:")
for r in cur.fetchall():
    print(f"  {r[0]} {r[1][:25]:<25} col_qz={r[2]} SF={r[3]} SC={r[4]} SR={r[5]}")

# Verificar na planilha ref
print("\nPlanilha ref 1QZ:")
wb = openpyxl.load_workbook(BASE / "data" / "CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx", read_only=True, data_only=True)
ws = wb["Planilha1"]
for row in ws.iter_rows(min_row=7, values_only=True):
    if row[1] is None: continue
    cpf = str(row[1]).strip().replace(".","").replace("-","").zfill(11)
    if cpf in cpfs:
        print(f"  {cpf} {str(row[0])[:25]:<25} QZ={row[9]} SF={row[8]} SC={row[10]} SR={row[7]} CP={row[12]} CF={row[14]}")
wb.close()
conn.close()
