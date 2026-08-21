import json

with open('reports_896184.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

reports = [r for r in data['data'] if r['user_id'] == 896184]
print(f'Total reports do usuário 896184: {len(reports)}')

print('\n=== Reports com payment_method_id ===')
for r in reports:
    print(f"Report ID: {r['id']}, payment_method_id: {r['payment_method_id']}, status: {r['status']}")

print('\n=== Buscando expenses com payment_method_id=627508 ===')
total_627508 = 0.0

for r in reports:
    report_id = r['id']
    print(f"\nBuscando expenses do report {report_id}...")
    
    # Fazer request para buscar expenses do report
    import subprocess
    result = subprocess.run([
        'curl.exe', '-X', 'GET',
        f'https://api.vexpenses.com/v2/reports/{report_id}?include=expenses',
        '-H', 'Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8',
        '-H', 'Content-Type: application/json'
    ], capture_output=True, text=True)
    
    if result.returncode == 0:
        try:
            report_data = json.loads(result.stdout)
            # Debug: mostrar estrutura
            if 'expenses' in report_data.get('data', {}):
                expenses = report_data['data']['expenses']['data']
                print(f"  Total expenses: {len(expenses)}")
                for e in expenses:
                    if e.get('payment_method_id') == 627508:
                        valor = e.get('value', 0)
                        total_627508 += valor
                        print(f"  - {e.get('title', 'N/A')}: R$ {valor}")
            elif 'included' in report_data:
                print(f"  Included keys: {list(report_data['included'].keys())}")
                if 'expenses' in report_data['included']:
                    expenses = report_data['included']['expenses']['data']
                    print(f"  Total expenses: {len(expenses)}")
                    for e in expenses:
                        if e.get('payment_method_id') == 627508:
                            valor = e.get('value', 0)
                            total_627508 += valor
                            print(f"  - {e.get('title', 'N/A')}: R$ {valor}")
                else:
                    print(f"  Sem expenses no included")
            else:
                print(f"  Sem 'expenses' nem 'included' na resposta")
        except Exception as e:
            print(f"  Erro ao parsear JSON: {e}")
            print(f"  Primeiros 500 chars: {result.stdout[:500]}")

print(f'\n=== RESULTADO ===')
print(f'Total expenses com payment_method_id=627508: R$ {total_627508:.2f}')
print(f'Valor esperado (PRESTAÇÃO DE CONTAS): R$ 5.463,92')
print(f'Bate? {abs(total_627508 - 5463.92) < 0.01}')
