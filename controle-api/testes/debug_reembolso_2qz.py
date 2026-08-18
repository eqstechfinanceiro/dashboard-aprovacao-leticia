"""Verifica quantos casos na 2QZ tem REEMBOLSO > 0 e qual a regra."""
import openpyxl
from pathlib import Path

BASE = Path(__file__).parent.parent
wb = openpyxl.load_workbook(
    BASE / "data" / "CARGA 2 QZ MAIO 26 VEXPENSES EQS (1).xlsx",
    read_only=True, data_only=True
)
ws = wb["2 QZ DE MAIO 26"]

casos_reem = []
for row in ws.iter_rows(min_row=5, values_only=True):
    if row[2] is None:
        continue
    cpf = str(row[2]).strip().replace(".", "").replace("-", "").zfill(11)
    try:
        reem = float(row[14] or 0)
        cf   = float(row[15] or 0)
        sp   = float(row[7] or 0)   # SALDO PENDENTE PARCIAL
        c1qz = float(row[8] or 0)   # CARGA 1 QZ
        sf   = float(row[9] or 0)   # SALDO FINAL
        qz2  = float(row[10] or 0)  # 2a QZ
        sc   = float(row[11] or 0)  # SALDO CARTAO
        cp   = float(row[13] or 0)  # CARGA PARCIAL
    except (TypeError, ValueError):
        continue
    if reem > 0.01:
        casos_reem.append((cpf, str(row[1])[:25], sp, c1qz, sf, qz2, sc, cp, reem, cf))

print(f"Casos com REEMBOLSO > 0 na 2QZ: {len(casos_reem)}")
print(f"\n{'CPF':<14} {'Nome':<25} {'SP':>8} {'C1QZ':>8} {'SF':>8} {'2QZ':>6} {'SC':>6} {'CP':>8} {'Reem':>8} {'CF':>8}")
print("-"*100)
for r in sorted(casos_reem, key=lambda x: x[8], reverse=True):
    print(f"{r[0]:<14} {r[1]:<25} {r[2]:>8.2f} {r[3]:>8.2f} {r[4]:>8.2f} {r[5]:>6.2f} {r[6]:>6.2f} {r[7]:>8.2f} {r[8]:>8.2f} {r[9]:>8.2f}")

wb.close()
