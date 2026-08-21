import openpyxl
import json
from collections import defaultdict

wb = openpyxl.load_workbook('CONTROLE - VEXPENSES - AGOSTO 2026.xlsx', read_only=True, data_only=True)
ws = wb['EXTRATO']

# Get ABNER's TARIFA rows from planilha
planilha_rows = []
for row in ws.iter_rows(min_row=9, values_only=True):
    usuario = str(row[8]).strip().upper() if row[8] else ''
    tipo = str(row[9]).strip() if row[9] else ''
    valor = float(row[11]) if row[11] is not None else 0
    data = str(row[2]).strip() if row[2] else ''  # column C = data
    hora = str(row[3]).strip() if row[3] else ''  # column D = hora
    cod = str(row[5]).strip() if row[5] else ''   # column F = codigo
    if usuario == 'ABNER ANDRADE CAVALCANTE' and tipo == 'TARIFA':
        planilha_rows.append({
            'data': data, 'hora': hora, 'valor': valor, 'cod': cod
        })

print(f"Planilha TARIFA rows for ABNER: {len(planilha_rows)}")
print(f"Planilha TARIFA sum: {sum(r['valor'] for r in planilha_rows):.2f}")
print()

# Print all planilha rows
for r in sorted(planilha_rows, key=lambda x: (x['data'], x['hora'])):
    print(f"  {r['data']} {r['hora']} val={r['valor']:.2f} cod={r['cod'][:16]}...")
