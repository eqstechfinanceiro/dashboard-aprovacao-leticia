import json, os, openpyxl
from decimal import Decimal

ROOT = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test'
API_JSON = os.path.join(ROOT, 'api_all_quinzenas.json')

with open(API_JSON, 'r', encoding='utf-8') as f:
    api_data = json.loads(f.read()))

# Jan QZ1
qz = api_data['1_1']
api_rows = qz['data']
api_by_cpf = {r['cpf']: r for r in api_rows}

# Read sheet
CARGA_FILE = os.path.join(ROOT, 'data', '01 - JANEIRO', '1QZ JANEIRO 2026 - VEXPENSES.xlsx')
wb = openpyxl.load_workbook(CARGA_FILE, data_only=True, read_only=True)
ws = wb["1 QZ VEXPENSES 01_2026"]

perfect_match = 0
sf_only_match = 0
sc_only_match = 0
sp_only_match = 0
total = 0

for row in ws.iter_rows(min_row=7, values_only=True):
    cpf_raw = row[2] if len(row) > 2 else None
    if not cpf_raw:
        continue
    cpf = str(cpf_raw).strip().replace(".", "").replace("-", "").replace("/", "").replace(" ", "")
    if not cpf.isdigit():
        continue
    cpf = cpf.zfill(11)
    
    if cpf not in api_by_cpf:
        continue
    
    api = api_by_cpf[cpf]
    total += 1
    
    # Sheet values
    sheet_sr = float(row[8]) if len(row) > 8 and row[8] is not None else 0
    sheet_sf = float(row[9]) if len(row) > 9 and row[9] is not None else 0
    sheet_sc = float(row[11]) if len(row) > 11 and row[11] is not None else 0
    
    # API values
    api_sf = round(api.get('saldo_final', 0) or 0, 2)
    api_sc = round(api.get('saldo_cartao', 0) or 0, 2)
    api_sp = round(api.get('saldo_prestacao', 0) or 0, 2)
    
    # Sheet SP = SF + SC
    sheet_sp = round(sheet_sf + sheet_sc, 2)
    
    sf_match = abs(api_sf - sheet_sf) < 0.02
    sc_match = abs(api_sc - sheet_sc) < 0.02
    sp_match = abs(api_sp - sheet_sp) < 0.02
    
    if sf_match and sc_match and sp_match:
        perfect_match += 1
    elif sf_match:
        sf_only_match += 1
    elif sc_match:
        sc_only_match += 1
    elif sp_match:
        sp_only_match += 1

wb.close()

print(f"Total compared: {total}")
print(f"Perfect match (SF+SC+SP): {perfect_match} ({perfect_match/total*100:.1f}%)")
print(f"SF only match: {sf_only_match}")
print(f"SC only match: {sc_only_match}")
print(f"SP only match: {sp_only_match}")
