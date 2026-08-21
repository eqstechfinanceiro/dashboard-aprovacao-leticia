import requests
import json

TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwiZW1haWwiOiJpdGFsby5tZWRyYWRvQGVxc2VuZ2VuaGFyaWEuY29tLmJyIiwibmFtZSI6Ikl0YWxvIE1lZHJhZG8iLCJqb2JfdGl0bGUiOiJBZG1pbmlzdHJhZG9yIiwicm9sZSI6ImFkbWluIiwibW9kdWxlcyI6W10sIm11c3RfY2hhbmdlX3Bhc3N3b3JkIjpmYWxzZSwiaWF0IjoxNzg2NzI5NzM3LCJleHAiOjE3ODczMzQ1Mzd9.-pseYfUui7R0AeBNj2rXiXja8kT9owM1CqfJj1FuWxI"
API = "http://localhost:3000"

users = {
    923558: "ADAN",
    895985: "ANDRE",
    896018: "CARLOS",
    896053: "DHIEGO",
}

for uid, name in users.items():
    resp = requests.get(f"{API}/api/fechamento?userId={uid}", timeout=60, cookies={"vexp_auth_token": TOKEN})
    data = resp.json()
    
    print(f"\n{'=' * 60}")
    print(f"{name} (userId={uid})")
    print(f"{'=' * 60}")
    
    # Check raw_data for payment methods
    payment_methods = {}
    for p in data['prestacaoContas']:
        raw = p.get('raw_data', {})
        if isinstance(raw, str):
            try:
                raw = json.loads(raw) if raw else {}
            except:
                raw = {}
        
        pm = raw.get('payment_method', {})
        if isinstance(pm, dict):
            pm_name = pm.get('data', {}).get('name', '') or pm.get('name', '')
        else:
            pm_name = str(pm)
        
        if not pm_name:
            pm_name = 'UNKNOWN'
        
        if pm_name not in payment_methods:
            payment_methods[pm_name] = {'count': 0, 'total': 0}
        payment_methods[pm_name]['count'] += 1
        payment_methods[pm_name]['total'] += float(p['valor_total'])
    
    print(f"\nPayment methods in prestacaoContas:")
    for pm, info in sorted(payment_methods.items()):
        print(f"  {pm:30s} | {info['count']:3d} items | total={info['total']:.2f}")
    
    # Also check the raw_data keys
    if data['prestacaoContas']:
        raw = data['prestacaoContas'][0].get('raw_data', {})
        if isinstance(raw, str):
            try:
                raw = json.loads(raw) if raw else {}
            except:
                raw = {}
        print(f"\nFirst expense raw_data keys: {list(raw.keys())[:20]}")
        for k in raw:
            if 'payment' in k.lower() or 'method' in k.lower():
                print(f"  {k}: {raw[k]}")
