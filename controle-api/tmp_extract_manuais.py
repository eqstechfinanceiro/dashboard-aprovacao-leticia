import openpyxl
import json
from pathlib import Path

def parse(v):
    if v is None:
        return 0.0
    if isinstance(v, str):
        v = v.strip()
        if v == '':
            return 0.0
    return float(v)

ref_path = Path(r'data/06 - JUNHO/CARGA 1 QZ JUNHO 26 VEXPENSES EQS.xlsx')
wb = openpyxl.load_workbook(ref_path, data_only=True, read_only=True)
ws = wb['Planilha1']

manuais = {}
for row in ws.iter_rows(min_row=7, values_only=True):
    cpf_raw = row[1]
    if not cpf_raw:
        continue
    cpf = str(cpf_raw).replace('.', '').replace('-', '').zfill(11)
    col_qz = parse(row[8])      # I
    adiantamento = parse(row[10])  # K
    obs = ""
    if col_qz != 0 or adiantamento != 0:
        entry = {}
        if col_qz != 0:
            entry['col_qz'] = round(col_qz, 2)
        if adiantamento != 0:
            entry['adiantamento'] = round(adiantamento, 2)
        if entry:
            manuais[cpf] = entry

out_path = Path('data/manuais_1qz_junho.json')
out_path.write_text(json.dumps(manuais, indent=2, ensure_ascii=False))
print(f"Escritos {len(manuais)} manuais em {out_path}")
