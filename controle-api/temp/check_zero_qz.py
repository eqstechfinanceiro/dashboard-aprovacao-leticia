import urllib.request, json

def get(url):
    with urllib.request.urlopen(url) as r:
        return json.loads(r.read())

# Compara total de colaboradores vs com col1qz > 0 por período
periodos = [
    ('JUNHO', '2025', '1%C2%AA%20QZ'),
    ('DEZEMBRO', '2025', '1%C2%AA%20QZ'),
    ('ABRIL', '2026', '1%C2%AA%20QZ'),
    ('MAIO', '2026', '1%C2%AA%20QZ'),
    ('MAIO', '2026', '2%C2%AA%20QZ'),
]

print(f"{'Período':<25} {'Total':>7} {'col1qz>0':>10} {'col1qz=0':>10}")
print("-"*56)
for mes, ano, qenc in periodos:
    data = get(f'http://localhost:3000/api/carga-qz?mes={mes}&ano={ano}&quinzena={qenc}')
    rows = data['data']
    com_valor = sum(1 for r in rows if r['col1qz'] > 0)
    sem_valor = sum(1 for r in rows if r['col1qz'] == 0)
    label = f"{mes} {ano} {qenc.replace('%C2%AA', 'ª').replace('%20', ' ')}"
    print(f"{label:<25} {len(rows):>7} {com_valor:>10} {sem_valor:>10}")

# Verifica: colaboradores com col1qz=0 em MAIO 2026 — deveriam ter?
print("\n=== CPFs com col1qz=0 em MAIO 2026 1QZ ===")
data = get('http://localhost:3000/api/carga-qz?mes=MAIO&ano=2026&quinzena=1%C2%AA%20QZ')
zeros = [r for r in data['data'] if r['col1qz'] == 0]
print(f"Total com col1qz=0: {len(zeros)}")
print("Amostra (primeiros 5):")
for r in zeros[:5]:
    print(f"  {r['colaborador'][:35]}: situacao={r['situacao']}  saldoFinal={r['saldoFinal']}  cargaFinal={r['cargaFinal']}")
