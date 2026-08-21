import openpyxl, os
ROOT = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test'
CARGA_FILE = os.path.join(ROOT, 'data', '01 - JANEIRO', '1QZ JANEIRO 2026 - VEXPENSES.xlsx')
wb = openpyxl.load_workbook(CARGA_FILE, data_only=True, read_only=True)
ws = wb["1 QZ VEXPENSES 01_2026"]
out = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\controle-api\reembolso_check.txt'
with open(out, 'w', encoding='utf-8') as f:
    f.write("Name|Col8_SR|Col9_SF|Col10_CQ|Col11_SC|Col12_AD|Col13_CP|Col14_RE|Col15_CFSR|Col16_CFR\n")
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        rn = i + 1
        if rn < 7:
            continue
        name = str(row[1] or "").strip() if len(row) > 1 else ""
        if not name:
            continue
        sr = row[7] if len(row) > 7 else None  # Col 8: SALDO REEMBOLSAR
        sf = row[8] if len(row) > 8 else None  # Col 9: SALDO FINAL
        cq = row[9] if len(row) > 9 else None  # Col 10: 1QZ
        sc = row[10] if len(row) > 10 else None  # Col 11: SALDO CARTAO
        ad = row[11] if len(row) > 11 else None  # Col 12: ADIANTAMENTO
        cp = row[12] if len(row) > 12 else None  # Col 13: CARGA PARCIAL
        re = row[13] if len(row) > 13 else None  # Col 14: REEMBOLSO
        cfsr = row[14] if len(row) > 14 else None  # Col 15: CARGA FINAL SEM REEMBOLSO
        cfr = row[15] if len(row) > 15 else None  # Col 16: CARGA FINAL REEMBOLSO
        # Only print users with non-zero REEMBOLSO
        if re and abs(float(re)) > 0.01:
            f.write(f"{name[:25]}|{sr}|{sf}|{cq}|{sc}|{ad}|{cp}|{re}|{cfsr}|{cfr}\n")
wb.close()
print("Done")
