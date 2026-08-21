import openpyxl, os
ROOT = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test'
CARGA_FILE = os.path.join(ROOT, 'data', '01 - JANEIRO', '1QZ JANEIRO 2026 - VEXPENSES.xlsx')
wb = openpyxl.load_workbook(CARGA_FILE, data_only=True, read_only=True)
ws = wb["1 QZ VEXPENSES 01_2026"]
out = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\controle-api\daniel_sheet.txt'
with open(out, 'w', encoding='utf-8') as f:
    # Find DANIEL and CHARLES
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        rn = i + 1
        if rn < 7:
            continue
        name = str(row[1] or "").strip() if len(row) > 1 else ""
        if "DANIEL SANTOS DE ASSUN" in name.upper() or "CHARLES NEVES" in name.upper():
            f.write(f"\n=== {name} (row {rn}) ===\n")
            for j in range(min(20, len(row))):
                f.write(f"  Col {j}: {repr(row[j])}\n")
wb.close()
print("Done")
