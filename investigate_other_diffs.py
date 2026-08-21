import requests
import json

TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwiZW1haWwiOiJpdGFsby5tZWRyYWRvQGVxc2VuZ2VuaGFyaWEuY29tLmJyIiwibmFtZSI6Ikl0YWxvIE1lZHJhZG8iLCJqb2JfdGl0bGUiOiJBZG1pbmlzdHJhZG9yIiwicm9sZSI6ImFkbWluIiwibW9kdWxlcyI6W10sIm11c3RfY2hhbmdlX3Bhc3N3b3JkIjpmYWxzZSwiaWF0IjoxNzg2NzI5NzM3LCJleHAiOjE3ODczMzQ1Mzd9.-pseYfUui7R0AeBNj2rXiXja8kT9owM1CqfJj1FuWxI"
API = "http://localhost:3000"

# CARLOS: June 2025 sheet=0, API=8651.19
print("=" * 60)
print("CARLOS - June 2025 (sheet=0, API=8651.19)")
print("=" * 60)
resp = requests.get(f"{API}/api/fechamento?userId=896018", timeout=60, cookies={"vexp_auth_token": TOKEN})
data = resp.json()

june_items = [p for p in data['prestacaoContas'] if '2025-06' in p['data']]
print(f"\nJune 2025 expenses ({len(june_items)}):")
for p in june_items:
    print(f"  {p['data']} | {p['nome_relatorio']:30s} | status={p['status']:10s} | valor={float(p['valor_total']):.2f}")

# ANDRE: March/April/May 2026 sheet has values, API has 0
print(f"\n{'=' * 60}")
print("ANDRE - March/April/May 2026 (sheet has values, API has 0)")
print("=" * 60)
resp = requests.get(f"{API}/api/fechamento?userId=895985", timeout=60, cookies={"vexp_auth_token": TOKEN})
data = resp.json()

for month in ['2026-03', '2026-04', '2026-05']:
    items = [p for p in data['prestacaoContas'] if month in p['data']]
    print(f"\n{month} expenses ({len(items)}):")
    for p in items:
        print(f"  {p['data']} | {p['nome_relatorio']:30s} | status={p['status']:10s} | valor={float(p['valor_total']):.2f}")

# Also check what reports ANDRE has
print(f"\nAll ANDRE reports:")
reports = {}
for p in data['prestacaoContas']:
    key = f"{p['nome_relatorio']}|{p['status']}"
    if key not in reports:
        reports[key] = {'count': 0, 'total': 0}
    reports[key]['count'] += 1
    reports[key]['total'] += float(p['valor_total'])

for key, info in sorted(reports.items()):
    print(f"  {key:50s} | {info['count']:3d} items | total={info['total']:.2f}")

# DHIEGO: Sept/Oct 2025 diff=74.32
print(f"\n{'=' * 60}")
print("DHIEGO - Sept/Oct 2025 (diff=74.32)")
print("=" * 60)
resp = requests.get(f"{API}/api/fechamento?userId=896053", timeout=60, cookies={"vexp_auth_token": TOKEN})
data = resp.json()

for month in ['2025-09', '2025-10']:
    items = [p for p in data['prestacaoContas'] if month in p['data']]
    print(f"\n{month} expenses ({len(items)}):")
    for p in items:
        print(f"  {p['data']} | {p['nome_relatorio']:30s} | status={p['status']:10s} | valor={float(p['valor_total']):.2f}")
    print(f"  Total: {sum(float(p['valor_total']) for p in items):.2f}")
