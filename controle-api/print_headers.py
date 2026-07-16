import openpyxl, os, sys
ROOT = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test'
CARGA_FILE = os.path.join(ROOT, 'data', '01 - JANEIRO', '1QZ JANEIRO 2026 - VEXPENSES.xlsx')
wb = openpyxl.load_workbook(CARGA_FILE, data_only=True, read_only=True)
ws = wb["1 QZ VEXPENSES 01_2026"]
out = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\controle-api\headers_output.txt'
with open(out, 'w', encoding='utf-8') as f:
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        rn = i + 1
        if rn == 6:
            f.write(f"=== Row 6 (headers) ===\n")
            for j in range(min(25, len(row))):
                f.write(f"  Col {j}: {repr(row[j])}\n")
        elif rn == 7:
            f.write(f"\n=== Row 7 (first data) ===\n")
            for j in range(min(25, len(row))):
                f.write(f"  Col {j}: {repr(row[j])}\n")
        elif rn > 7:
            name = str(row[1] or "").strip() if len(row) > 1 else ""
            if "CHARLES NEVES" in name.upper():
                f.write(f"\n=== CHARLES NEVES (row {rn}) ===\n")
                for j in range(min(25, len(row))):
                    f.write(f"  Col {j}: {repr(row[j])}\n")
                break
wb.close()
print("Done")
