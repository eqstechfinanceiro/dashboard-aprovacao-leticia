import openpyxl
import json
import subprocess
from collections import defaultdict

# ===== Load PAINEL sheet from CONTROLE =====
wb = openpyxl.load_workbook('CONTROLE - VEXPENSES - AGOSTO 2026.xlsx', read_only=True, data_only=True)
ws = wb['PAINEL']

painel = {}
for row in ws.iter_rows(min_row=12, values_only=True):
    cpf = str(row[2]).strip() if len(row) > 2 and row[2] else ''
    if not cpf or cpf == 'None':
        continue
    painel[cpf] = {
        'nome': str(row[1]).strip() if row[1] else '',
        'prestacao': float(row[16]) if row[16] is not None else 0,
    }

print(f"PAINEL: {len(painel)} CPFs loaded")

# ===== Fetch API quinzena-complete with forceCalc =====
ps_script = '''
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/quinzena-complete?year=2026&month=8&quinzena=1&forceCalc=true" -Method GET -WebSession $session
$r | ConvertTo-Json -Depth 10
'''
result = subprocess.run(['powershell.exe', '-NoProfile', '-Command', ps_script], capture_output=True, text=True, timeout=120)
api_data = json.loads(result.stdout)
api_rows = api_data.get('data', [])
print(f"API: {len(api_rows)} rows (data_mode={api_data.get('data_mode')})")

api_by_cpf = {}
for r in api_rows:
    cpf = r.get('cpf', '').strip()
    if cpf:
        api_by_cpf[cpf] = r

# ===== Find CPFs with prestacao diff =====
diff_cpfs = []
for cpf, painel_row in painel.items():
    api_val = float(api_by_cpf.get(cpf, {}).get('prestacao', 0) or 0)
    painel_val = painel_row['prestacao']
    diff = painel_val - api_val
    if abs(diff) > 0.01:
        diff_cpfs.append((cpf, painel_row['nome'], painel_val, api_val, diff))

diff_cpfs.sort(key=lambda x: abs(x[4]), reverse=True)
print(f"\nCPFs with prestacao diff: {len(diff_cpfs)}")
print(f"Total diff: {sum(d[4] for d in diff_cpfs):+.2f}")

# ===== Fetch approval dates for diff CPFs =====
cpf_list = ','.join([d[0] for d in diff_cpfs])
ps_script2 = f'''
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{{ email = "italo.medrado@eqsengenharia.com.br"; password = "EQSeng4292@" }} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session | Out-Null
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/debug-approval-dates?cpfs={cpf_list}" -Method GET -WebSession $session
$r | ConvertTo-Json -Depth 10
'''
result2 = subprocess.run(['powershell.exe', '-NoProfile', '-Command', ps_script2], capture_output=True, text=True, timeout=120)
approval_data = json.loads(result2.stdout)

print(f"\n{'='*100}")
print(f"APPROVAL DATE ANALYSIS FOR {len(diff_cpfs)} CPFs WITH PRESTACAO DIFF")
print(f"{'='*100}")
print(f"Total reports for diff CPFs: {approval_data['total']}")
print(f"  Approved BEFORE Aug 11: {approval_data['before_day_11']} (value: R${approval_data['before_11_total_value']:,.2f})")
print(f"  Approved ON/AFTER Aug 11: {approval_data['on_or_after_day_11']} (value: R${approval_data['after_11_total_value']:,.2f})")
print(f"  No date: {approval_data['no_date']}")
print(f"  Before 11 with expenses: {approval_data['before_11_with_expenses']}")
print(f"  Before 11 zero expenses: {approval_data['before_11_zero_expenses']}")
print(f"  After 11 with expenses: {approval_data['after_11_with_expenses']}")
print(f"  After 11 zero expenses: {approval_data['after_11_zero_expenses']}")

# ===== Per-CPF breakdown =====
# Group reports by CPF
reports_by_cpf = defaultdict(lambda: {'before': [], 'after': [], 'nodate': []})
for r in approval_data.get('before_11', []):
    reports_by_cpf[r['user_cpf']]['before'].append(r)
for r in approval_data.get('after_11', []):
    reports_by_cpf[r['user_cpf']]['after'].append(r)
for r in approval_data.get('no_date_samples', []):
    reports_by_cpf[r['user_cpf']]['nodate'].append(r)

print(f"\n{'='*100}")
print(f"PER-CPF BREAKDOWN (top 30 by diff)")
print(f"{'='*100}")
print(f"{'Nome':<35s} {'Diff':>10s} | {'Before11':>8s} {'After11':>8s} | {'Before val':>12s} {'After val':>12s} | Verdict")
print(f"{'-'*35} {'-'*10} | {'-'*8} {'-'*8} | {'-'*12} {'-'*12} | {'-'*20}")

time_related_total = 0
real_bug_total = 0
mixed_total = 0

for cpf, nome, painel_val, api_val, diff in diff_cpfs[:30]:
    reps = reports_by_cpf.get(cpf, {'before': [], 'after': [], 'nodate': []})
    before_count = len(reps['before'])
    after_count = len(reps['after'])
    before_val = sum(r['total_value'] for r in reps['before'])
    after_val = sum(r['total_value'] for r in reps['after'])

    if after_count > 0 and before_count == 0:
        verdict = "TIME-RELATED"
        time_related_total += diff
    elif after_count > 0 and before_count > 0:
        verdict = "MIXED"
        mixed_total += diff
    elif before_count > 0 and after_count == 0:
        verdict = "REAL BUG"
        real_bug_total += diff
    else:
        verdict = "NO REPORTS"
        mixed_total += diff

    print(f"{str(nome)[:35]:<35s} {diff:+10.2f} | {before_count:>8d} {after_count:>8d} | {before_val:>12.2f} {after_val:>12.2f} | {verdict}")

print(f"\n{'='*100}")
print(f"SUMMARY (top 30 CPFs)")
print(f"{'='*100}")
print(f"Time-related (all reports approved Aug 11+): {time_related_total:+.2f}")
print(f"Real bugs (all reports approved before Aug 11): {real_bug_total:+.2f}")
print(f"Mixed/other: {mixed_total:+.2f}")
print(f"Total: {time_related_total + real_bug_total + mixed_total:+.2f}")

# ===== Show details for REAL BUG CPFs =====
print(f"\n{'='*100}")
print(f"DETAIL: REAL BUG CPFs (approved before Aug 11, should match CONTROLE)")
print(f"{'='*100}")
for cpf, nome, painel_val, api_val, diff in diff_cpfs[:30]:
    reps = reports_by_cpf.get(cpf, {'before': [], 'after': [], 'nodate': []})
    after_count = len(reps['after'])
    before_count = len(reps['before'])
    if before_count > 0 and after_count == 0:
        print(f"\n  {nome} (cpf={cpf}) PAINEL={painel_val:.2f} API={api_val:.2f} diff={diff:+.2f}")
        for r in reps['before']:
            print(f"    id={r['id']} {r['name']} status={r['status']} exp={r['expense_count']} val={r['total_value']:.2f} approved={r['approval_date']}")
