import openpyxl
import warnings
warnings.filterwarnings('ignore')

PLANILHA = 'CONTROLE - VEXPENSES - AGOSTO 2026.xlsx'

wb = openpyxl.load_workbook(PLANILHA, read_only=True, data_only=True)
ws = wb['EXTRATO']

rows_iter = ws.iter_rows(min_row=8, values_only=True)
header_row = next(rows_iter)
headers = {str(v).strip().lower(): i for i, v in enumerate(header_row) if v}

tipo_idx = headers.get('tipo', 9)
valor_idx = headers.get('valor', 11)
cpf_idx = headers.get('cpf', 12)
cod_idx = headers.get('código de transação', 5)
desc_idx = headers.get('descrição', 10)
data_idx = headers.get('data', 3)
hora_idx = headers.get('hora', 4)

# Find dates for the missing entries
missing_codes = [
    '5AF49CCF32FBA587E6B3A866FA862461',  # JORGE LUIZ - Taxa de saque
    '88B7FCA3CBC6281F441E6DC65179037E',  # FABIO PROVESI - Taxa de saque
    'D0F2037A63CFDB83E8007AEC1C367DB4',  # FERNANDO - Taxa de saque
    '2C1829A64681002E5636D17C4C85D09C',  # FELIPE - Taxa de PIX
    'D2F0E6F3D6C3D94E3299BED09F8A4451',  # IVON - Taxa de PIX
]

from datetime import datetime, timedelta

def excel_serial_to_date(serial):
    if isinstance(serial, (int, float)):
        return (datetime(1899, 12, 30) + timedelta(days=serial)).strftime('%Y-%m-%d')
    return str(serial)

for row in rows_iter:
    if row is None:
        continue
    cod_val = str(row[cod_idx] or '').strip() if cod_idx < len(row) else ''
    if cod_val in missing_codes:
        cpf_val = str(row[cpf_idx] or '').strip() if cpf_idx < len(row) else ''
        tipo_val = str(row[tipo_idx] or '').strip() if tipo_idx < len(row) else ''
        valor_val = float(row[valor_idx] or 0) if valor_idx < len(row) else 0.0
        data_val = excel_serial_to_date(row[data_idx]) if data_idx < len(row) else ''
        hora_val = str(row[hora_idx] or '') if hora_idx < len(row) else ''
        desc_val = str(row[desc_idx] or '') if desc_idx < len(row) else ''
        print(f"Code: {cod_val}")
        print(f"  CPF={cpf_val}, Date={data_val}, Hora={hora_val}, Tipo={tipo_val}, Valor={valor_val}, Desc={desc_val}")
        print()
