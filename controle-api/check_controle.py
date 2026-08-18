import pyxlsb, os
ROOT = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test'
CONTROLE = os.path.join(ROOT, 'data', 'CONTROLE - VEXPENSES - JULHO 2026.xlsb')
out = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\controle-api\controle_charles.txt'

# PAINEL header at row 11, data starts at row 12
# Col 1: colaborador, Col 2: CPF, Col 3: ?, Col 4: situacao, Col 5: status_cartao
# Col 8: regional, Col 9: centro_custo, Col 10: gestor, Col 11: diretor
# Need to find SALDO CARTAO and SALDO PRESTAÇÃO columns

with open(out, 'w', encoding='utf-8') as f:
    with pyxlsb.open_workbook(CONTROLE) as wb:
        with wb.get_sheet("PAINEL") as ws:
            # Print header row (row 11) to find column names
            for i, row in enumerate(ws.rows()):
                rn = i + 1
                if rn == 11:
                    f.write("=== Header row 11 ===\n")
                    for j, c in enumerate(row):
                        if c.v is not None:
                            f.write(f"  Col {j}: {repr(c.v)}\n")
                elif rn == 12:
                    f.write("\n=== First data row 12 ===\n")
                    for j, c in enumerate(row):
                        if c.v is not None:
                            f.write(f"  Col {j}: {repr(c.v)}\n")
                    break

            # Find CHARLES
            with wb.get_sheet("PAINEL") as ws2:
                for i, row in enumerate(ws2.rows()):
                    rn = i + 1
                    if rn < 12:
                        continue
                    name = str(row[1].v or "").strip() if len(row) > 1 else ""
                    if "CHARLES NEVES" in name.upper():
                        f.write(f"\n=== CHARLES NEVES (row {rn}) ===\n")
                        for j, c in enumerate(row):
                            if c.v is not None:
                                f.write(f"  Col {j}: {repr(c.v)}\n")
                        break

print("Done")
