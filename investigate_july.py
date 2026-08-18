import requests
import json

TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwiZW1haWwiOiJpdGFsby5tZWRyYWRvQGVxc2VuZ2VuaGFyaWEuY29tLmJyIiwibmFtZSI6Ikl0YWxvIE1lZHJhZG8iLCJqb2JfdGl0bGUiOiJBZG1pbmlzdHJhZG9yIiwicm9sZSI6ImFkbWluIiwibW9kdWxlcyI6W10sIm11c3RfY2hhbmdlX3Bhc3N3b3JkIjpmYWxzZSwiaWF0IjoxNzg2NzI5NzM3LCJleHAiOjE3ODczMzQ1Mzd9.-pseYfUui7R0AeBNj2rXiXja8kT9owM1CqfJj1FuWxI"
API = "http://localhost:3000"

# Check all 4 users' July 2026 prestacao_contas
users = {
    'ADAN': 923558,
    'ANDRE': 895985,
    'CARLOS': 896018,
    'DHIEGO': 896053,
}

for name, uid in users.items():
    resp = requests.get(f"{API}/api/fechamento?userId={uid}", timeout=60, cookies={"vexp_auth_token": TOKEN})
    data = resp.json()
    
    print(f"\n{'=' * 60}")
    print(f"{name} (userId={uid})")
    print(f"{'=' * 60}")
    
    # Find July 2026 in fechamento
    july = [m for m in data['fechamento'] if m['ano'] == 2026 and m['mes'] == 'JULHO']
    if july:
        print(f"July 2026: prestacao_contas={july[0]['prestacao_contas']:.2f}")
    else:
        print("July 2026: NOT IN FECHAMENTO")
    
    # Check all prestacaoContas items for July 2026
    july_items = [p for p in data['prestacaoContas'] if '2026-07' in p['data']]
    print(f"\nJuly 2026 expenses ({len(july_items)}):")
    for p in july_items:
        print(f"  {p['data']} | {p['nome_relatorio']:30s} | status={p['status']:10s} | valor={float(p['valor_total']):.2f}")
    
    # Check what statuses exist for this user's reports
    statuses = {}
    for p in data['prestacaoContas']:
        st = (p['status'] or '').upper()
        if st not in statuses:
            statuses[st] = {'count': 0, 'total': 0}
        statuses[st]['count'] += 1
        statuses[st]['total'] += float(p['valor_total'])
    
    print(f"\nAll report statuses:")
    for st, info in sorted(statuses.items()):
        print(f"  {st:15s} | {info['count']:3d} items | total={info['total']:.2f}")
