import requests
import json

TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwiZW1haWwiOiJpdGFsby5tZWRyYWRvQGVxc2VuZ2VuaGFyaWEuY29tLmJyIiwibmFtZSI6Ikl0YWxvIE1lZHJhZG8iLCJqb2JfdGl0bGUiOiJBZG1pbmlzdHJhZG9yIiwicm9sZSI6ImFkbWluIiwibW9kdWxlcyI6W10sIm11c3RfY2hhbmdlX3Bhc3N3b3JkIjpmYWxzZSwiaWF0IjoxNzg2NzI5NzM3LCJleHAiOjE3ODczMzQ1Mzd9.-pseYfUui7R0AeBNj2rXiXja8kT9owM1CqfJj1FuWxI"
API = "http://localhost:3000"

# ANDRE June/July 2026
print("=" * 60)
print("ANDRE - June/July 2026 (sheet has values, API has 0)")
print("=" * 60)
resp = requests.get(f"{API}/api/fechamento?userId=895985", timeout=60, cookies={"vexp_auth_token": TOKEN})
data = resp.json()

for month in ['2026-06', '2026-07']:
    items = [p for p in data['prestacaoContas'] if month in p['data']]
    print(f"\n{month} expenses by date ({len(items)}):")
    for p in items:
        print(f"  {p['data']} | {p['nome_relatorio']:30s} | status={p['status']:10s} | valor={float(p['valor_total']):.2f}")

# Check ALL ANDRE reports
print(f"\nAll ANDRE reports:")
reports = {}
for p in data['prestacaoContas']:
    key = f"{p['nome_relatorio']}|{p['status']}"
    if key not in reports:
        reports[key] = {'count': 0, 'total': 0, 'dates': []}
    reports[key]['count'] += 1
    reports[key]['total'] += float(p['valor_total'])
    reports[key]['dates'].append(p['data'][:7] if p['data'] else 'N/A')

for key, info in sorted(reports.items()):
    print(f"  {key:50s} | {info['count']:3d} items | total={info['total']:.2f} | dates={set(info['dates'])}")

# Also check ANDRE May 2026 (sheet=86.34, API=0)
print(f"\nMay 2026 expenses:")
may_items = [p for p in data['prestacaoContas'] if '2026-05' in p['data']]
for p in may_items:
    print(f"  {p['data']} | {p['nome_relatorio']:30s} | status={p['status']:10s} | valor={float(p['valor_total']):.2f}")

# Check ANDRE saldoDisponivel diff (sheet=2542.12, api=2538.00, diff=-4.12)
print(f"\nANDRE extrato (carga/transferencia/taxa):")
for m in data['fechamento']:
    if m['carga'] != 0 or m['transferencia'] != 0 or m['taxa'] != 0:
        print(f"  {m['ano']} {m['mes']:12s} | carga={m['carga']:>10.2f} | transf={m['transferencia']:>8.2f} | taxa={m['taxa']:>7.2f}")

print(f"\nAPI saldoDisponivel: {data['resumo']['saldoDisponivel']}")
print(f"Sheet saldoDisponivel: 2542.12")
print(f"Diff: {2542.12 - data['resumo']['saldoDisponivel']:.2f}")
