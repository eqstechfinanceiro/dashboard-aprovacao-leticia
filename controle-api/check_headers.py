import openpyxl, os
ROOT = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test'
CARGA_FILE = os.path.join(ROOT, 'data', '01 - JANEIRO', '1QZ JANEIRO 2026 - VEXPENSES.xlsx')
wb = openpyxl.load_workbook(CARGA_FILE, data_only=True, read_only=True)
ws = wb["1 QZ VEXPENSES 01_2026"]
out = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\controle-api\headers_jan_qz1.txt'
with open(out, 'w', encoding='utf-8') as f:
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        rn = i + 1
        if rn > 8:
            break
        f.write(f"\n=== Row {rn} ===\n")
        for j in range(min(25, len(row))):
            f.write(f"  [{j}] (Col {chr(65+j) if j<26 else 'A'+chr(65+j-26)}): {repr(row[j])}\n")
wb.close()
print("Done")
