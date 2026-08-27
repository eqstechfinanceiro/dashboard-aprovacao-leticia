import openpyxl
import warnings
warnings.filterwarnings('ignore')

PLANILHA = 'CONTROLE - VEXPENSES - AGOSTO 2026.xlsx'

cpfs = {
    '00041171071': 'JAFER',
    '11178519740': 'GUILHERME MOTTA',
    '02027745203': 'ABNER',
}

print("Lendo planilha...")
wb = openpyxl.load_workbook(PLANILHA, read_only=True, data_only=True)

ws = wb['EXTRATO']
rows_iter = ws.iter_rows(min_row=8, values_only=True)
header_row = next(rows_iter)
headers = {str(v).strip().lower(): i for i, v in enumerate(header_row) if v}

tipo_idx = headers.get('tipo', 9)
valor_idx = headers.get('valor', 11)
cpf_idx = headers.get('cpf', 12)
desc_idx = headers.get('descrição', 10)

# Collect all TRANSFERÊNCIA entries for JAFER
for cpf, name in cpfs.items():
    transf_entries = []
    for row in rows_iter:
        if row is None:
            continue
        row_cpf = str(row[cpf_idx] or '').strip() if cpf_idx < len(row) else ''
        if row_cpf != cpf:
            continue
        tipo_val = str(row[tipo_idx] or '').strip() if tipo_idx < len(row) else ''
        if tipo_val != 'TRANSFERÊNCIA':
            continue
        valor_val = float(row[valor_idx] or 0) if valor_idx < len(row) else 0.0
        desc_val = str(row[desc_idx] or '') if desc_idx < len(row) else ''
        transf_entries.append((valor_val, desc_val[:60]))
    
    total = sum(v for v, _ in transf_entries)
    pos = sum(v for v, _ in transf_entries if v > 0)
    neg = sum(v for v, _ in transf_entries if v < 0)
    print(f"\n{name} ({cpf}): {len(transf_entries)} TRANSFERÊNCIA entries")
    print(f"  Total: {total}, Positive (carga): {pos}, Negative (transf): {neg}")
    for v, desc in sorted(transf_entries, key=lambda x: -x[0]):
        print(f"  {v:>10.2f} | {desc}")
