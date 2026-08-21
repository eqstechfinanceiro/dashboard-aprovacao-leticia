import requests
import json

TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwiZW1haWwiOiJpdGFsby5tZWRyYWRvQGVxc2VuZ2VuaGFyaWEuY29tLmJyIiwibmFtZSI6Ikl0YWxvIE1lZHJhZG8iLCJqb2JfdGl0bGUiOiJBZG1pbmlzdHJhZG9yIiwicm9sZSI6ImFkbWluIiwibW9kdWxlcyI6W10sIm11c3RfY2hhbmdlX3Bhc3N3b3JkIjpmYWxzZSwiaWF0IjoxNzg2NzI5NzM3LCJleHAiOjE3ODczMzQ1Mzd9.-pseYfUui7R0AeBNj2rXiXja8kT9owM1CqfJj1FuWxI"
API = "http://localhost:3000"

# Get full API response
resp = requests.get(f"{API}/api/fechamento?userId=895999", timeout=60, cookies={"vexp_auth_token": TOKEN})
data = resp.json()

print("=" * 80)
print("DISCREPANCY INVESTIGATION")
print("=" * 80)

# 1. JULY 2026 carga diff (sheet=985.93, api=1985.93, diff=1000)
print("\n--- 1. JULY 2026 CARGA (diff=1000) ---")
july_extrato = [e for e in data['extrato'] if '2026-07' in e['data'] and e['tipo'] == 'Transferência' and float(e['valor']) > 0]
print(f"July carga transactions (Transferência positive):")
for e in july_extrato:
    print(f"  {e['data']} | {e['descricao'][:50]:50s} | valor={float(e['valor']):.2f}")
print(f"  Total: {sum(float(e['valor']) for e in july_extrato):.2f}")

# 2. AUGUST 2026 (only in API)
print("\n--- 2. AUGUST 2026 (only in API) ---")
aug_extrato = [e for e in data['extrato'] if '2026-08' in e['data']]
print(f"August extrato transactions: {len(aug_extrato)}")
for e in aug_extrato:
    print(f"  {e['data']} | tipo={e['tipo']:15s} | {e['descricao'][:40]:40s} | valor={float(e['valor']):.2f}")

# 3. SALDO CARTAO (sheet=3, api=1000)
print("\n--- 3. SALDO CARTÃO (sheet=3, api=1000) ---")
# The API gets the last snapshot from extrato_movimentacao
# Let's check what the last snapshot is
print(f"API saldoCartao: {data['resumo']['saldoCartao']}")
print("Sheet saldoCartao: 3.00")
print("The API is getting the latest snapshot from the DB, which may be newer than the sheet")

# 4. STATUS ABERTO (sheet=2082.40, api=2856.86, diff=774.46)
print("\n--- 4. STATUS ABERTO (diff=774.46) ---")
aberto_reports = {}
for p in data['prestacaoContas']:
    st = (p['status'] or '').upper()
    if st in ['ABERTO', 'ENVIADO', 'REABERTO']:
        key = p['nome_relatorio']
        if key not in aberto_reports:
            aberto_reports[key] = {'status': st, 'count': 0, 'total': 0}
        aberto_reports[key]['count'] += 1
        aberto_reports[key]['total'] += float(p['valor_total'])

print("Aberto/Enviado/Reaberto reports:")
for name, info in sorted(aberto_reports.items()):
    print(f"  {name:40s} | {info['status']:10s} | {info['count']:3d} items | total={info['total']:.2f}")
print(f"  TOTAL: {sum(v['total'] for v in aberto_reports.values()):.2f}")

# 5. Check if there are new reports not in the sheet
print("\n--- 5. ALL REPORTS STATUS ---")
all_reports = {}
for p in data['prestacaoContas']:
    key = f"{p['nome_relatorio']}|{p['status']}"
    if key not in all_reports:
        all_reports[key] = {'count': 0, 'total': 0}
    all_reports[key]['count'] += 1
    all_reports[key]['total'] += float(p['valor_total'])

for key, info in sorted(all_reports.items()):
    print(f"  {key:50s} | {info['count']:3d} items | total={info['total']:.2f}")
