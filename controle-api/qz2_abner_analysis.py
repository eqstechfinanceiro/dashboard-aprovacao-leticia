import json, openpyxl, os
ROOT = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test'
OUT = os.path.join(ROOT, 'controle-api', 'qz2_abner_analysis.txt')
f = open(OUT, 'w', encoding='utf-8')

with open(os.path.join(ROOT, 'api_all_quinzenas.json'), 'r', encoding='utf-8') as fh:
    api_data = json.load(fh)

# Jan QZ2 API data for ABNER
qz = api_data['1_2']
api_rows = qz['data']
api_by_cpf = {r['cpf']: r for r in api_rows}

# Sheet data
CARGA_FILE = os.path.join(ROOT, 'data', '01 - JANEIRO', '2QZ JANEIRO 2026 - VEXPENSES.xlsx')
wb = openpyxl.load_workbook(CARGA_FILE, data_only=True, read_only=True)
ws = wb['2 QZ VEXPENSES 01_2026']

# Headers
headers = list(ws.iter_rows(min_row=6, max_row=6, values_only=True))[0]
f.write('=== Jan QZ2 Headers ===\n')
for j, h in enumerate(headers):
    if h: f.write(f'  [{j}] = {h}\n')

# ABNER in sheet
for row in ws.iter_rows(min_row=7, values_only=True):
    cpf_raw = row[2] if len(row) > 2 else None
    if not cpf_raw: continue
    cpf = str(cpf_raw).strip().replace('.','').replace('-','').replace(' ','').zfill(11)
    if cpf == '02027745203':
        f.write(f'\n=== ABNER in Sheet ===\n')
        for j, v in enumerate(row):
            if v is not None:
                h = headers[j] if j < len(headers) else ''
                f.write(f'  [{j}] {h} = {v}\n')
        break

# ABNER in API
api = api_by_cpf.get('02027745203')
if api:
    f.write(f'\n=== ABNER in API ===\n')
    for k, v in api.items():
        if k != 'data_source': f.write(f'  {k}: {v}\n')

# Also check a few more users
for name_match in ['ADAN', 'ADAUTO', 'RAFAEL AMORIM']:
    for row in ws.iter_rows(min_row=7, values_only=True):
        cpf_raw = row[2] if len(row) > 2 else None
        name = str(row[1] or '') if len(row) > 1 else ''
        if not cpf_raw: continue
        if name_match.upper() not in name.upper(): continue
        cpf = str(cpf_raw).strip().replace('.','').replace('-','').replace(' ','').zfill(11)
        f.write(f'\n=== {name} in Sheet ===\n')
        for j, v in enumerate(row):
            if v is not None:
                h = headers[j] if j < len(headers) else ''
                f.write(f'  [{j}] {h} = {v}\n')
        api = api_by_cpf.get(cpf)
        if api:
            f.write(f'\n=== {name} in API ===\n')
            for k, v in api.items():
                if k != 'data_source': f.write(f'  {k}: {v}\n')
        break

wb.close()
f.close()
print("Done: " + OUT)
