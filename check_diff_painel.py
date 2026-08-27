import openpyxl
import warnings
warnings.filterwarnings('ignore')

wb = openpyxl.load_workbook('COMPARACAO_BANCO_PLANILHA_v3.xlsx', read_only=True, data_only=True)
ws = wb['Diff_PAINEL']

target_cpfs = {
    '02027745203', '08247635992', '11178519740', '00041171071',
    '72756284220', '02299450076', '47514649816',
}

rows = ws.iter_rows(min_row=1, values_only=True)
# Skip header rows until we find CPF-like data
for h in range(5):
    header = next(rows)
    print(f"Row {h+1}: {header}")
    if header[0] and str(header[0]).replace('.','').replace('-','').isdigit():
        # This is data, not header - process it
        break

for row in rows:
    if row is None:
        continue
    cpf = str(row[0] or '').strip()
    # Check tarifa diff (column 10) and carga diff (column 4)
    tarifa_diff = float(row[10]) if row[10] else 0
    carga_diff = float(row[4]) if row[4] else 0
    
    if cpf in target_cpfs:
        print(f"\n{cpf} {row[1]}:")
        print(f"  carga: plan={row[2]}, banco={row[3]}, diff={carga_diff}")
        print(f"  reembolso: plan={row[5]}, banco={row[6]}, diff={row[7]}")
        print(f"  tarifa: plan={row[8]}, banco={row[9]}, diff={tarifa_diff}")
        print(f"  somase: plan={row[11]}, banco={row[12]}, diff={row[13]}")
        print(f"  saldo_prest: plan={row[14]}, banco={row[15]}, diff={row[16]}")
        print(f"  saldo_final: plan={row[17]}, banco diff={row[18] if len(row)>18 else 'N/A'}")

# Count tarifa-only diffs
print("\n\n--- All rows with tarifa diff != 0 ---")
tarifa_diff_count = 0
for row in rows:
    pass  # already consumed

# Re-read
ws2 = wb['Diff_PAINEL']
rows2 = ws2.iter_rows(min_row=5, values_only=True)
tarifa_diff_count = 0
for row in rows2:
    if row is None or row[0] is None:
        continue
    try:
        tarifa_diff = float(row[10]) if row[10] is not None else 0
    except (ValueError, TypeError):
        continue
    if abs(tarifa_diff) > 0.01:
        tarifa_diff_count += 1
        print(f"  {row[0]} {row[1]}: tarifa plan={row[8]}, banco={row[9]}, diff={tarifa_diff}")

print(f"\nTotal tarifa diffs: {tarifa_diff_count}")
