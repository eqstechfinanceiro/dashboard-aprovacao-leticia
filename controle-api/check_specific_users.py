import json, os
ROOT = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test'
API_JSON = os.path.join(ROOT, 'api_all_quinzenas.json')

with open(API_JSON, 'r', encoding='utf-8') as f:
    api_data = json.loads(f.read())

qz = api_data['1_1']
rows = qz['data']

# Find CHARLES in the API data
charles = next((r for r in rows if 'CHARLES NEVES' in (r.get('colaborador') or '').upper()), None)
if charles:
    print("=== CHARLES (API) ===")
    for k, v in charles.items():
        if k != 'data_source':
            print(f"  {k}: {v}")

# Find DANIEL
daniel = next((r for r in rows if 'DANIEL SANTOS DE ASSUN' in (r.get('colaborador') or '').upper()), None)
if daniel:
    print("\n=== DANIEL (API) ===")
    for k, v in daniel.items():
        if k != 'data_source':
            print(f"  {k}: {v}")

# Find a user with SF<0 (API overestimates)
print("\n=== Users with SF<0 (first 5) ===")
sf_neg = [r for r in rows if (r.get('saldo_final') or 0) < 0]
for r in sf_neg[:5]:
    name = (r.get('colaborador') or '')[:25]
    print(f"  {name:25s} CPF={r['cpf']} SP={r.get('saldo_prestacao',0):>10.2f} SC={r.get('saldo_cartao',0):>10.2f} SF={r.get('saldo_final',0):>10.2f}")
