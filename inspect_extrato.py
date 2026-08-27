import openpyxl

wb = openpyxl.load_workbook('CONTROLE - VEXPENSES - AGOSTO 2026.xlsx', read_only=True, data_only=True)

# Check EXTRATO sheet
ws = wb['EXTRATO']
print("EXTRATO sheet - rows 7-12:")
for i, row in enumerate(ws.iter_rows(min_row=7, max_row=12, values_only=True)):
    vals = [str(v)[:20] if v is not None else '' for v in row[:15]]
    print(f"Row {i+7}: {vals}")

# Count rows and get unique tipos
print("\nCounting rows and tipos...")
tipos = {}
total = 0
for row in ws.iter_rows(min_row=10, values_only=True):
    if row[1] is None and row[8] is None:
        continue
    total += 1
    tipo = str(row[9]).strip() if row[9] else 'NULL'
    tipos[tipo] = tipos.get(tipo, 0) + 1

print(f"Total rows: {total}")
print("Tipos:")
for t, c in sorted(tipos.items(), key=lambda x: -x[1]):
    print(f"  {t}: {c}")
