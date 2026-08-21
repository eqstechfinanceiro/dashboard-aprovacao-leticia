import requests
import json

TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwiZW1haWwiOiJpdGFsby5tZWRyYWRvQGVxc2VuZ2VuaGFyaWEuY29tLmJyIiwibmFtZSI6Ikl0YWxvIE1lZHJhZG8iLCJqb2JfdGl0bGUiOiJBZG1pbmlzdHJhZG9yIiwicm9sZSI6ImFkbWluIiwibW9kdWxlcyI6W10sIm11c3RfY2hhbmdlX3Bhc3N3b3JkIjpmYWxzZSwiaWF0IjoxNzg2NzI5NzM3LCJleHAiOjE3ODczMzQ1Mzd9.-pseYfUui7R0AeBNj2rXiXja8kT9owM1CqfJj1FuWxI"
API = "http://localhost:3000"

# Check ADAN August 2026 (sheet has 27.99, API has 0)
print("=" * 60)
print("ADAN - August 2026 (sheet=27.99, API=0)")
print("=" * 60)
resp = requests.get(f"{API}/api/fechamento?userId=923558", timeout=60, cookies={"vexp_auth_token": TOKEN})
data = resp.json()

aug_items = [p for p in data['prestacaoContas'] if '2026-08' in p['data']]
print(f"\nAugust 2026 expenses by date ({len(aug_items)}):")
for p in aug_items:
    print(f"  {p['data']} | {p['nome_relatorio']:30s} | status={p['status']:10s} | valor={float(p['valor_total']):.2f}")

# Check all reports that might cover August (name contains 08/2026 or 08/25)
print(f"\nAll reports with '08/' in name:")
for p in data['prestacaoContas']:
    if '08/' in p['nome_relatorio']:
        print(f"  {p['data']} | {p['nome_relatorio']:30s} | status={p['status']:10s} | valor={float(p['valor_total']):.2f}")

# Check DHIEGO August 2026 (sheet has 856.73, API has 0)
print(f"\n{'=' * 60}")
print("DHIEGO - August 2026 (sheet=856.73, API=0)")
print("=" * 60)
resp = requests.get(f"{API}/api/fechamento?userId=896053", timeout=60, cookies={"vexp_auth_token": TOKEN})
data = resp.json()

aug_items = [p for p in data['prestacaoContas'] if '2026-08' in p['data']]
print(f"\nAugust 2026 expenses by date ({len(aug_items)}):")
for p in aug_items:
    print(f"  {p['data']} | {p['nome_relatorio']:30s} | status={p['status']:10s} | valor={float(p['valor_total']):.2f}")

print(f"\nAll reports with '08/' in name:")
for p in data['prestacaoContas']:
    if '08/' in p['nome_relatorio']:
        print(f"  {p['data']} | {p['nome_relatorio']:30s} | status={p['status']:10s} | valor={float(p['valor_total']):.2f}")

# Check CARLOS June 2025 (sheet=0, API=8938.19)
print(f"\n{'=' * 60}")
print("CARLOS - June 2025 (sheet=0, API=8938.19)")
print("=" * 60)
resp = requests.get(f"{API}/api/fechamento?userId=896018", timeout=60, cookies={"vexp_auth_token": TOKEN})
data = resp.json()

june_items = [p for p in data['prestacaoContas'] if '2025-06' in p['data']]
print(f"\nJune 2025 expenses by date ({len(june_items)}):")
for p in june_items[:10]:
    print(f"  {p['data']} | {p['nome_relatorio']:30s} | status={p['status']:10s} | valor={float(p['valor_total']):.2f}")
print(f"  ... total: {len(june_items)} items, sum={sum(float(p['valor_total']) for p in june_items):.2f}")

# Group by report name
reports_june = {}
for p in june_items:
    name = p['nome_relatorio']
    if name not in reports_june:
        reports_june[name] = {'count': 0, 'total': 0, 'status': p['status']}
    reports_june[name]['count'] += 1
    reports_june[name]['total'] += float(p['valor_total'])

print(f"\nJune 2025 expenses by report:")
for name, info in sorted(reports_june.items()):
    print(f"  {name:30s} | {info['status']:10s} | {info['count']:3d} items | total={info['total']:.2f}")

# Check what reports CARLOS has with '06/' in name
print(f"\nAll CARLOS reports with '06/' in name:")
for p in data['prestacaoContas']:
    if '06/' in p['nome_relatorio']:
        print(f"  {p['data']} | {p['nome_relatorio']:30s} | status={p['status']:10s} | valor={float(p['valor_total']):.2f}")

# Check ANDRE Oct/Nov/Dec 2025
print(f"\n{'=' * 60}")
print("ANDRE - Oct/Nov/Dec 2025")
print("=" * 60)
resp = requests.get(f"{API}/api/fechamento?userId=895985", timeout=60, cookies={"vexp_auth_token": TOKEN})
data = resp.json()

for month in ['2025-10', '2025-11', '2025-12']:
    items = [p for p in data['prestacaoContas'] if month in p['data']]
    print(f"\n{month} expenses by date ({len(items)}):")
    for p in items:
        print(f"  {p['data']} | {p['nome_relatorio']:30s} | status={p['status']:10s} | valor={float(p['valor_total']):.2f}")
