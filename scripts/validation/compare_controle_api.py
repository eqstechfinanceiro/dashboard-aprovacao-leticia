import json

with open('painel_controle.json', 'r', encoding='utf-8') as f:
    painel = json.load(f)

with open('api_frozen.json', 'r', encoding='utf-8-sig') as f:
    api_raw = json.load(f)

# Build API dict by CPF
api = {}
for row in api_raw:
    cpf = row['cpf'].strip()
    api[cpf] = row

print(f'PAINEL (planilha): {len(painel)} rows')
print(f'API (frozen):      {len(api)} rows')
print()

# Find CPFs in PAINEL but not in API
painel_only = set(painel.keys()) - set(api.keys())
api_only = set(api.keys()) - set(painel.keys())
print(f'In PAINEL but NOT in API: {len(painel_only)}')
if painel_only:
    for cpf in sorted(list(painel_only))[:10]:
        print(f'  {cpf}: {painel[cpf]["colaborador"]}')
    if len(painel_only) > 10:
        print(f'  ... and {len(painel_only) - 10} more')
print()
print(f'In API but NOT in PAINEL: {len(api_only)}')
if api_only:
    for cpf in sorted(list(api_only))[:10]:
        print(f'  {cpf}: {api[cpf]["colaborador"]}')
    if len(api_only) > 10:
        print(f'  ... and {len(api_only) - 10} more')
print()

# Compare financial values for matching CPFs
fields = ['carga', 'transferencia', 'tarifa', 'prestacao', 'saldo_prestacao', 'saldo_cartao', 'saldo_final']
mismatches = {f: {'count': 0, 'examples': []} for f in fields}
exact_match = 0
close_match = 0  # within 0.01

for cpf in set(painel.keys()) & set(api.keys()):
    p = painel[cpf]
    a = api[cpf]
    all_match = True
    for field in fields:
        pv = p.get(field, 0) or 0
        av = a.get(field, 0) or 0
        diff = abs(pv - av)
        if diff > 0.01:
            all_match = False
            mismatches[field]['count'] += 1
            if len(mismatches[field]['examples']) < 5:
                mismatches[field]['examples'].append({
                    'cpf': cpf,
                    'colaborador': p['colaborador'],
                    'planilha': pv,
                    'api': av,
                    'diff': round(diff, 2),
                })
        elif diff > 0:
            close_match += 0  # just rounding
    if all_match:
        exact_match += 1

print(f'=== COMPARISON (matching CPFs: {len(set(painel.keys()) & set(api.keys()))}) ===')
print(f'Exact match (all 7 fields): {exact_match}')
print()
for field in fields:
    m = mismatches[field]
    print(f'{field}: {m["count"]} mismatches')
    for ex in m['examples']:
        print(f'  {ex["colaborador"]} ({ex["cpf"]}): planilha={ex["planilha"]}, api={ex["api"]}, diff={ex["diff"]}')
    print()

# Totals comparison
print('=== TOTALS ===')
for field in fields:
    total_painel = sum((p.get(field, 0) or 0) for p in painel.values())
    total_api = sum((a.get(field, 0) or 0) for a in api.values())
    print(f'{field}: planilha={round(total_painel, 2)}, api={round(total_api, 2)}, diff={round(total_painel - total_api, 2)}')
