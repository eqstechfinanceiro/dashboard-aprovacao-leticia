import requests
import json

TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwiZW1haWwiOiJpdGFsby5tZWRyYWRvQGVxc2VuZ2VuaGFyaWEuY29tLmJyIiwibmFtZSI6Ikl0YWxvIE1lZHJhZG8iLCJqb2JfdGl0bGUiOiJBZG1pbmlzdHJhZG9yIiwicm9sZSI6ImFkbWluIiwibW9kdWxlcyI6W10sIm11c3RfY2hhbmdlX3Bhc3N3b3JkIjpmYWxzZSwiaWF0IjoxNzg2NzI5NzM3LCJleHAiOjE3ODczMzQ1Mzd9.-pseYfUui7R0AeBNj2rXiXja8kT9owM1CqfJj1FuWxI"
API = "http://localhost:3000"

# CARLOS July 2026
print("CARLOS July 2026 expenses:")
resp = requests.get(f"{API}/api/fechamento?userId=896018", timeout=60, cookies={"vexp_auth_token": TOKEN})
data = resp.json()

july_items = [p for p in data['prestacaoContas'] if '2026-07' in p['data']]
for p in july_items:
    print(f"  {p['data']} | {p['nome_relatorio']:30s} | status={p['status']:10s} | valor={float(p['valor_total']):.2f}")
print(f"  Total: {sum(float(p['valor_total']) for p in july_items):.2f}")

# Check CORREÇÃO ITAU expenses
print(f"\nCORREÇÃO ITAU expenses:")
correcao = [p for p in data['prestacaoContas'] if 'CORREÇÃO' in p['nome_relatorio'].upper()]
for p in correcao:
    print(f"  {p['data']} | {p['nome_relatorio']:30s} | status={p['status']:10s} | valor={float(p['valor_total']):.2f}")

# ANDRE: check Aug 2026 (only in API, 56.49)
print(f"\nANDRE Aug 2026 expenses:")
resp = requests.get(f"{API}/api/fechamento?userId=895985", timeout=60, cookies={"vexp_auth_token": TOKEN})
data = resp.json()

aug_items = [p for p in data['prestacaoContas'] if '2026-08' in p['data']]
for p in aug_items:
    print(f"  {p['data']} | {p['nome_relatorio']:30s} | status={p['status']:10s} | valor={float(p['valor_total']):.2f}")

# ANDRE: check Oct/Nov 2025 (only in SHEET with 0 values)
print(f"\nANDRE Oct/Nov 2025 expenses:")
for month in ['2025-10', '2025-11']:
    items = [p for p in data['prestacaoContas'] if month in p['data']]
    print(f"  {month}: {len(items)} expenses, total={sum(float(p['valor_total']) for p in items):.2f}")

# ANDRE: check Dec 2025 (sheet=838.82, API=?)
print(f"\nANDRE Dec 2025 expenses:")
dec_items = [p for p in data['prestacaoContas'] if '2025-12' in p['data']]
for p in dec_items:
    print(f"  {p['data']} | {p['nome_relatorio']:30s} | status={p['status']:10s} | valor={float(p['valor_total']):.2f}")
print(f"  Total: {sum(float(p['valor_total']) for p in dec_items):.2f}")
