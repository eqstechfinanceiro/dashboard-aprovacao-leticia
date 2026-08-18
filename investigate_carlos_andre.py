import requests
import json

TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwiZW1haWwiOiJpdGFsby5tZWRyYWRvQGVxc2VuZ2VuaGFyaWEuY29tLmJyIiwibmFtZSI6Ikl0YWxvIE1lZHJhZG8iLCJqb2JfdGl0bGUiOiJBZG1pbmlzdHJhZG9yIiwicm9sZSI6ImFkbWluIiwibW9kdWxlcyI6W10sIm11c3RfY2hhbmdlX3Bhc3N3b3JkIjpmYWxzZSwiaWF0IjoxNzg2NzI5NzM3LCJleHAiOjE3ODczMzQ1Mzd9.-pseYfUui7R0AeBNj2rXiXja8kT9owM1CqfJj1FuWxI"
API = "http://localhost:3000"

# CARLOS: check what's in the API now
print("=" * 60)
print("CARLOS - all expenses by month")
print("=" * 60)
resp = requests.get(f"{API}/api/fechamento?userId=896018", timeout=60, cookies={"vexp_auth_token": TOKEN})
data = resp.json()

# Print monthly prestacao_contas
for m in data['fechamento']:
    print(f"  {m['ano']} {m['mes']:12s} | prestacao={m['prestacao_contas']:>10.2f} | saldo={m['saldo']:>10.2f} | acum={m['acumulado']:>10.2f}")

# Check what reports are in the API for CARLOS
print(f"\nAll CARLOS reports in API:")
reports = {}
for p in data['prestacaoContas']:
    key = f"{p['nome_relatorio']}|{p['status']}"
    if key not in reports:
        reports[key] = {'count': 0, 'total': 0}
    reports[key]['count'] += 1
    reports[key]['total'] += float(p['valor_total'])

for key, info in sorted(reports.items()):
    print(f"  {key:50s} | {info['count']:3d} items | total={info['total']:.2f}")

# ANDRE: check what's different now
print(f"\n{'=' * 60}")
print("ANDRE - all expenses by month")
print("=" * 60)
resp = requests.get(f"{API}/api/fechamento?userId=895985", timeout=60, cookies={"vexp_auth_token": TOKEN})
data = resp.json()

for m in data['fechamento']:
    print(f"  {m['ano']} {m['mes']:12s} | prestacao={m['prestacao_contas']:>10.2f} | saldo={m['saldo']:>10.2f} | acum={m['acumulado']:>10.2f}")

print(f"\nAll ANDRE reports in API:")
reports = {}
for p in data['prestacaoContas']:
    key = f"{p['nome_relatorio']}|{p['status']}"
    if key not in reports:
        reports[key] = {'count': 0, 'total': 0}
    reports[key]['count'] += 1
    reports[key]['total'] += float(p['valor_total'])

for key, info in sorted(reports.items()):
    print(f"  {key:50s} | {info['count']:3d} items | total={info['total']:.2f}")

print(f"\nANDRE resumo: {json.dumps(data['resumo'], indent=2)}")
