import json, os
ROOT = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test'
API_JSON = os.path.join(ROOT, 'api_all_quinzenas.json')

with open(API_JSON, 'r', encoding='utf-8') as f:
    api_data = json.loads(f.read())

# Focus on Jan QZ1 — check users where API saldo_final != sheet saldo_final
# and understand the pattern
qz = api_data['1_1']
rows = qz['data']

# Group by match status
matches = []
mismatches_pos = []  # API > sheet
mismatches_neg = []  # API < sheet

for r in rows:
    sf = r.get('saldo_final', 0) or 0
    sp = r.get('saldo_prestacao', 0) or 0
    sc = r.get('saldo_cartao', 0) or 0
    # Check if saldo_final is exactly 0 (common mismatch pattern)
    if sf == 0 and sp > 0:
        mismatches_neg.append(r)
    elif sf > 0 and sp > 0:
        matches.append(r)
    elif sf < 0:
        mismatches_pos.append(r)

print(f"Total rows: {len(rows)}")
print(f"SF=0 with SP>0 (API underestimates): {len(mismatches_neg)}")
print(f"SF>0 with SP>0 (potential matches): {len(matches)}")
print(f"SF<0 (API overestimates): {len(mismatches_pos)}")

# Show examples of SF=0 users (these are users where sheet has SF>0 but API has SF=0)
print(f"\n=== SF=0 users (API underestimates) — first 10 ===")
for r in mismatches_neg[:10]:
    name = (r.get('colaborador') or '')[:25]
    print(f"  {name:25s} SP={r.get('saldo_prestacao',0):>10.2f} SC={r.get('saldo_cartao',0):>10.2f} SF={r.get('saldo_final',0):>10.2f}")

# Show examples of SF>0 users
print(f"\n=== SF>0 users — first 10 ===")
for r in matches[:10]:
    name = (r.get('colaborador') or '')[:25]
    print(f"  {name:25s} SP={r.get('saldo_prestacao',0):>10.2f} SC={r.get('saldo_cartao',0):>10.2f} SF={r.get('saldo_final',0):>10.2f}")
