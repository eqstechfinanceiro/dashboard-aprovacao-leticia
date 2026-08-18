import openpyxl
import json
import subprocess
from collections import defaultdict

# ===== Load PAINEL sheet from CONTROLE =====
wb = openpyxl.load_workbook('CONTROLE - VEXPENSES - AGOSTO 2026.xlsx', read_only=True, data_only=True)
ws = wb['PAINEL']

# Headers on row 11, data from row 12
# Col mapping: 0=EMPRESA, 1=COLABORADORES, 2=CPF, 3=CHAVE, 4=SITUAÇÃO, 5=STATUS CARTÃO,
# 6=CARTÃO ITAU, 7=TERMO, 8=REGIONAL, 9=CENTRO CUSTO, 10=GESTOR, 11=DIRETOR, 12=CARTÃO VEXPENSES
# 13=CARGA, 14=TRANSFERENCIA, 15=(-)TARIFA, 16=(-)PRESTAÇÃO, 17=SALDO PRESTAÇÃO,
# 18=(-)SALDO CARTAO, 19=SALDO FINAL

painel = {}
for row in ws.iter_rows(min_row=12, values_only=True):
    cpf = str(row[2]).strip() if len(row) > 2 and row[2] else ''
    if not cpf or cpf == 'None':
        continue
    painel[cpf] = {
        'nome': str(row[1]).strip() if row[1] else '',
        'carga': float(row[13]) if row[13] is not None else 0,
        'transferencia': float(row[14]) if row[14] is not None else 0,
        'tarifa': float(row[15]) if row[15] is not None else 0,
        'prestacao': float(row[16]) if row[16] is not None else 0,
        'saldo_prestacao': float(row[17]) if row[17] is not None else 0,
        'saldo_cartao': float(row[18]) if row[18] is not None else 0,
        'saldo_final': float(row[19]) if row[19] is not None else 0,
    }

print(f"PAINEL: {len(painel)} CPFs loaded")

# ===== Fetch API quinzena-complete =====
ps_script = '''
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/quinzena-complete?year=2026&month=8&quinzena=1&forceCalc=true" -Method GET -WebSession $session
$r | ConvertTo-Json -Depth 10
'''
result = subprocess.run(['powershell.exe', '-NoProfile', '-Command', ps_script], capture_output=True, text=True, timeout=60)
try:
    api_data = json.loads(result.stdout)
except:
    print(f"ERROR parsing API: {result.stderr[:300]}")
    print(f"STDOUT: {result.stdout[:500]}")
    exit(1)

api_rows = api_data.get('data', api_data.get('rows', []))
print(f"API: {len(api_rows)} rows returned (data_mode={api_data.get('data_mode')})")

api_by_cpf = {}
for r in api_rows:
    cpf = r.get('cpf', '').strip()
    if cpf:
        api_by_cpf[cpf] = r

# ===== Compare ALL fields =====
fields = [
    ('carga', 'carga'),
    ('transferencia', 'transferencia'),
    ('tarifa', 'tarifa'),
    ('prestacao', 'prestacao'),
    ('saldo_cartao', 'saldo_cartao'),
    ('saldo_final', 'saldo_final'),
]

print(f"\n{'='*100}")
print("FIELD-BY-FIELD COMPARISON: PAINEL (CONTROLE) vs API")
print(f"{'='*100}")

all_diffs_by_cpf = defaultdict(lambda: defaultdict(float))

for field_name, api_field in fields:
    total_painel = 0
    total_api = 0
    diffs = []
    match_count = 0

    for cpf, painel_row in painel.items():
        painel_val = painel_row[field_name]
        api_val = float(api_by_cpf.get(cpf, {}).get(api_field, 0) or 0)

        total_painel += painel_val
        total_api += api_val

        diff = painel_val - api_val
        if abs(diff) > 0.01:
            diffs.append((cpf, painel_row['nome'], painel_val, api_val, diff))
            all_diffs_by_cpf[cpf][field_name] = diff
        else:
            match_count += 1

    print(f"\n{field_name.upper()}:")
    print(f"  PAINEL total: {total_painel:.2f}")
    print(f"  API total:    {total_api:.2f}")
    print(f"  Diff:         {total_painel - total_api:+.2f}")
    print(f"  Matched:      {match_count}/{len(painel)} ({match_count/len(painel)*100:.1f}%)")
    if diffs:
        diffs.sort(key=lambda x: abs(x[4]), reverse=True)
        print(f"  Top 10 diffs:")
        for cpf, nome, pv, av, d in diffs[:10]:
            print(f"    {str(nome)[:30]:30s} cpf={cpf} PAINEL={pv:.2f} API={av:.2f} diff={d:+.2f}")

# ===== Summary of CPFs with any diff =====
cpfs_with_any_diff = set()
for cpf, fields_diff in all_diffs_by_cpf.items():
    for field, diff in fields_diff.items():
        if abs(diff) > 0.01:
            cpfs_with_any_diff.add(cpf)

print(f"\n{'='*100}")
print(f"CPFs with ANY field diff: {len(cpfs_with_any_diff)}")
print(f"{'='*100}")
