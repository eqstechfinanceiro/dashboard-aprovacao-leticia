import urllib.request, json

with urllib.request.urlopen('http://localhost:3000/api/carga-qz') as r:
    data = json.loads(r.read())

print(f"total: {data['total']}")
print("col1qz unico valor:", set(row['col1qz'] for row in data['data']))
print("Amostra (3 colaboradores):")
for row in data['data'][:3]:
    print(f"  {row['colaborador'][:35]}: saldoFinal={row['saldoFinal']} saldoCartao={row['saldoCartao']} col1qz={row['col1qz']} cargaFinal={row['cargaFinal']}")

with urllib.request.urlopen('http://localhost:3000/api/carga-qz/periodos') as r:
    pdata = json.loads(r.read())

print(f"\nPeriodos (total={len(pdata['periodos'])}):")
for p in pdata['periodos'][-4:]:
    print(f"  {p['label']}")
