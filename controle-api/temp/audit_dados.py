import urllib.request, json

def get(url):
    with urllib.request.urlopen(url) as r:
        return json.loads(r.read())

# 1. Compara os mesmos 5 colaboradores em 3 períodos diferentes
cpfs_amostra = ['02027745203', '01932662537', '85087572634', '06223031980', '60843403004']

periodos = [
    ('JUNHO', '2025', '1%C2%AA%20QZ', '1ª QZ'),
    ('DEZEMBRO', '2025', '2%C2%AA%20QZ', '2ª QZ'),
    ('ABRIL', '2026', '2%C2%AA%20QZ', '2ª QZ'),
    ('MAIO', '2026', '1%C2%AA%20QZ', '1ª QZ'),
]

print("="*80)
print("COMPARAÇÃO DE VALORES POR PERÍODO (mesmos colaboradores)")
print("="*80)

for mes, ano, qenc, qlabel in periodos:
    data = get(f'http://localhost:3000/api/carga-qz?mes={mes}&ano={ano}&quinzena={qenc}')
    rows = {r['cpf']: r for r in data['data']}
    print(f"\n--- {qlabel} {mes} {ano} (total={data['total']}) ---")
    print(f"{'CPF':<14} {'Colaborador':<30} {'col1qz':>10} {'saldoFinal':>12} {'saldoCartao':>12} {'saldoReimb':>12} {'cargaFinal':>12}")
    print("-"*100)
    for cpf in cpfs_amostra:
        r = rows.get(cpf)
        if r:
            print(f"{cpf:<14} {r['colaborador'][:28]:<30} {r['col1qz']:>10.2f} {r['saldoFinal']:>12.2f} {r['saldoCartao']:>12.2f} {r['saldoReembolsar']:>12.2f} {r['cargaFinal']:>12.2f}")

# 2. Investiga quem tem saldoReembolsar > 0 e por quê
print("\n\n" + "="*80)
print("TOP 10 MAIORES saldoReembolsar (MAIO 2026 1QZ)")
print("="*80)
data = get('http://localhost:3000/api/carga-qz?mes=MAIO&ano=2026&quinzena=1%C2%AA%20QZ')
reimb = sorted([r for r in data['data'] if r['saldoReembolsar'] > 0], key=lambda x: -x['saldoReembolsar'])
print(f"{'Colaborador':<35} {'saldoReembolsar':>16} {'saldoFinal_painel':>18}")
print("-"*72)
for r in reimb[:10]:
    print(f"{r['colaborador'][:33]:<35} {r['saldoReembolsar']:>16.2f} {r['saldoFinal']:>18.2f}")

# 3. Verifica se col1qz muda entre períodos para os mesmos CPFs
print("\n\n" + "="*80)
print("col1qz DIFERENTE entre JUNHO/2025 e ABRIL/2026 para os mesmos CPFs")
print("="*80)
d1 = {r['cpf']: r['col1qz'] for r in get('http://localhost:3000/api/carga-qz?mes=JUNHO&ano=2025&quinzena=1%C2%AA%20QZ')['data']}
d2 = {r['cpf']: r['col1qz'] for r in get('http://localhost:3000/api/carga-qz?mes=ABRIL&ano=2026&quinzena=1%C2%AA%20QZ')['data']}
diffs = [(cpf, d1[cpf], d2.get(cpf, 0)) for cpf in d1 if d1[cpf] != d2.get(cpf, 0) and d1[cpf] > 0]
print(f"CPFs com col1qz diferente: {len(diffs)}")
for cpf, v1, v2 in diffs[:10]:
    print(f"  {cpf}: jun/25={v1:.0f}  abr/26={v2:.0f}")

print(f"\nCPFs com col1qz IGUAL (jun/25 == abr/26): {sum(1 for cpf in d1 if d1[cpf] == d2.get(cpf, 0) and d1[cpf] > 0)}")
