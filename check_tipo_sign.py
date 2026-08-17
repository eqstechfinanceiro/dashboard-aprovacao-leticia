import openpyxl
from collections import Counter

wb = openpyxl.load_workbook('CONTROLE - VEXPENSES - AGOSTO 2026.xlsx', read_only=True, data_only=True)
ws = wb['EXTRATO']

tipo_sign = {}
for row in ws.iter_rows(min_row=9, values_only=True):
    tipo = str(row[9]).strip() if row[9] else ''
    valor = float(row[11]) if row[11] is not None else 0
    if tipo:
        if tipo not in tipo_sign:
            tipo_sign[tipo] = {'pos': 0, 'neg': 0, 'pos_sum': 0, 'neg_sum': 0}
        if valor > 0:
            tipo_sign[tipo]['pos'] += 1
            tipo_sign[tipo]['pos_sum'] += valor
        elif valor < 0:
            tipo_sign[tipo]['neg'] += 1
            tipo_sign[tipo]['neg_sum'] += valor

for t, s in sorted(tipo_sign.items()):
    print(f"{t}: pos={s['pos']} (sum={s['pos_sum']:.2f}), neg={s['neg']} (sum={s['neg_sum']:.2f})")
