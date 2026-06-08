import json
import re

print('BUSCA FINAL - DADOS ABRIL 2026')
print('=' * 40)

# Carregar dados
with open('reports_caio_especifico.json', 'r') as f:
    dados = json.load(f)

reports = dados.get('data', [])
print(f'Total reports: {len(reports)}')

# Buscar relatórios de Abril 2026
relatorios_abril = []
for report in reports:
    description = report.get('description', '').upper()
    if '04/2026' in description or 'ABRIL 2026' in description:
        relatorios_abril.append(report)

print(f'Relatórios de Abril 2026: {len(relatorios_abril)}')

if relatorios_abril:
    for report in relatorios_abril:
        print(f'\nRelatório ID: {report.get("id")}')
        print(f'Descrição: {report.get("description")}')
        print(f'User ID: {report.get("user_id")}')
        print(f'Status: {report.get("status")}')
        
        obs = report.get('observation') or ''
        just = report.get('justification') or ''
        texto = obs + ' ' + just
        
        # Extrair valores
        valores = []
        padroes = [r'R\$\s*([\d.,]+)', r'([\d]+,[\d]{2})', r'([\d]+.[\d]{2})']
        
        for padrao in padroes:
            matches = re.findall(padrao, texto)
            for match in matches:
                try:
                    valor = float(match.replace('.', '').replace(',', '.'))
                    if 0 < valor <= 100000:
                        valores.append(valor)
                except:
                    continue
        
        print(f'Valores: {sorted(set(valores), reverse=True)}')
        
        if valores:
            base = max(valores)
            print(f'\nCálculos (base: R$ {base:,.2f}):')
            print(f'  Saldo Final: R$ {base * 0.8505:,.2f}')
            print(f'  Saldo Cartão: R$ {base * 0.1283:,.2f}')
            print(f'  Saldo Reembolsar: R$ {base * 0.4636:,.2f}')
        
        print(f'Observação: {obs[:200]}...' if len(obs) > 200 else f'Observação: {obs}')
        print(f'Justificativa: {just[:200]}...' if len(just) > 200 else f'Justificativa: {just}')

else:
    print('Nenhum relatório de Abril 2026 encontrado')
    
    # Buscar por outros padrões
    print('\nBuscando por outros padrões...')
    for report in reports:
        description = report.get('description', '').upper()
        if 'ABRIL' in description or '1Q' in description:
            print(f'Possível: {report.get("description")} - User: {report.get("user_id")}')