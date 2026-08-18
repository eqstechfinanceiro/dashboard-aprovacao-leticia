import openpyxl

wb = openpyxl.load_workbook('CARGA 1 QZ AGOSTO 26 VEXPENSES EQS.xlsx', read_only=True, data_only=True)
ws = wb.active

print(f"Sheet name: {ws.title}")

# Print first 15 rows to understand structure
for i, row in enumerate(ws.iter_rows(min_row=1, max_row=15, values_only=True)):
    vals = [str(v)[:20] if v is not None else '' for v in row]
    print(f"Row {i+1}: {vals}")
