"""Verifica situacao/status dos 5 CPFs com CP=0 inesperado."""
import openpyxl
from pathlib import Path

BASE = Path(__file__).parent.parent
wb = openpyxl.load_workbook(BASE / "data" / "CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx", read_only=True, data_only=True)
ws = wb["Planilha1"]
cpfs = {"37377394803", "39297665829", "02988581428", "04252409160", "71318758130"}
for row in ws.iter_rows(min_row=7, values_only=True):
    if row[1] is None:
        continue
    cpf = str(row[1]).strip().replace(".", "").replace("-", "").zfill(11)
    if cpf in cpfs:
        # col0=COLABORADOR col1=CPF col2=SITUACAO col9=1QZ col12=CP col14=CF col16=STATUS_CARTAO
        print(f"{cpf} {str(row[0])[:22]:<22} sit={row[2]} status={row[16]} QZ={row[9]} CP={row[12]} CF={row[14]}")
wb.close()
