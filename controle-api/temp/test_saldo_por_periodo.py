import urllib.request, json

def test(label, mes, ano, quinzena_encoded):
    url = f'http://localhost:3000/api/carga-qz?mes={mes}&ano={ano}&quinzena={quinzena_encoded}'
    with urllib.request.urlopen(url) as r:
        data = json.loads(r.read())
    abner = next((x for x in data['data'] if x['cpf'] == '02027745203'), None)
    if abner:
        print(f"[{label}] saldoCartao={abner['saldoCartao']}  col1qz={abner['col1qz']}  cargaFinal={abner['cargaFinal']}")
    else:
        print(f"[{label}] ABNER não encontrado")

test('JUNHO 2025 1QZ', 'JUNHO', '2025', '1%C2%AA%20QZ')
test('JULHO 2025 1QZ', 'JULHO', '2025', '1%C2%AA%20QZ')
test('DEZEMBRO 2025 1QZ', 'DEZEMBRO', '2025', '1%C2%AA%20QZ')
test('ABRIL 2026 1QZ', 'ABRIL', '2026', '1%C2%AA%20QZ')
test('ABRIL 2026 2QZ', 'ABRIL', '2026', '2%C2%AA%20QZ')
test('MAIO 2026 1QZ', 'MAIO', '2026', '1%C2%AA%20QZ')
