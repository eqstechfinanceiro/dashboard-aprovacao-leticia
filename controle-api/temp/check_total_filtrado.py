import urllib.request, json

def get(url):
    with urllib.request.urlopen(url) as r:
        return json.loads(r.read())

periodos = [
    ('MAIO', '2026', '1%C2%AA%20QZ', '1ª QZ'),
    ('MAIO', '2026', '2%C2%AA%20QZ', '2ª QZ'),
    ('JUNHO', '2025', '1%C2%AA%20QZ', '1ª QZ'),
    ('ABRIL', '2026', '2%C2%AA%20QZ', '2ª QZ'),
]

print(f"{'Período':<28} {'Total':>7}  situacoes")
print("-"*60)
for mes, ano, qenc, ql in periodos:
    data = get(f'http://localhost:3000/api/carga-qz?mes={mes}&ano={ano}&quinzena={qenc}')
    rows = data['data']
    from collections import Counter
    sits = Counter(r['situacao'] for r in rows)
    print(f"{ql} {mes} {ano:<8} {data['total']:>7}  {dict(sits)}")
