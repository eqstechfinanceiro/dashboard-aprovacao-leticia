import urllib.request, json

def test(mes, ano, quinzena_encoded):
    url = f'http://localhost:3000/api/carga-qz?mes={mes}&ano={ano}&quinzena={quinzena_encoded}'
    with urllib.request.urlopen(url) as r:
        data = json.loads(r.read())
    com_valor = [x for x in data['data'] if x['col1qz'] > 0]
    print(f"[{mes} {ano} q={quinzena_encoded}] total={data['total']} com col1qz>0: {len(com_valor)}")
    for x in com_valor[:2]:
        print(f"  {x['colaborador']}: {x['col1qz']}")

# 1a QZ junho 2025 — mais antigo, diferente da 1a QZ maio 2026
test('JUNHO', '2025', '1%C2%AA%20QZ')
print()
# 2a QZ junho 2025
test('JUNHO', '2025', '2%C2%AA%20QZ')
print()
# 1a QZ maio 2026
test('MAIO', '2026', '1%C2%AA%20QZ')
