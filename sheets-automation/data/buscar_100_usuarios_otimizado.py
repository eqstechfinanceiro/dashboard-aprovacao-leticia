import json
import requests
import pandas as pd
import time

print('BUSCANDO RELATÓRIOS ABRIL 2026 - 100 USUÁRIOS (OTIMIZADO)')
print('=' * 55)

# Carregar mapeamento
with open('mapeamento_100_usuarios.json', 'r') as f:
    dados_mapeamento = json.load(f)

mapeamento = dados_mapeamento['mapeamento']
print(f'Usuários mapeados: {len(mapeamento)}')

# Configuração API
headers = {
    'Authorization': 'N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8',
    'Content-Type': 'application/json',
    'Accept': 'application/json'
}

# Buscar todos os relatórios de Abril 2026 de uma vez (sem filtro por usuário)
print('\nBUSCANDO TODOS OS RELATÓRIOS DE ABRIL 2026...')
url_todos = 'https://api.vexpenses.com/v2/reports?begin_date=2026-04-01&end_date=2026-04-15&paginate=false'

try:
    response = requests.get(url_todos, headers=headers, timeout=60)
    
    if response.status_code == 200:
        dados_completos = response.json()
        todos_reports = dados_completos.get('data', [])
        print(f'Total de relatórios Abril 2026: {len(todos_reports)}')
        
        # Filtrar relatórios por usuário
        resultados = {}
        user_ids = {info['id']: nome for nome, info in mapeamento.items()}
        
        for report in todos_reports:
            user_id = report.get('user_id')
            if user_id in user_ids:
                nome_usuario = user_ids[user_id]
                
                if nome_usuario not in resultados:
                    resultados[nome_usuario] = {
                        'user_id': user_id,
                        'relatorios': [],
                        'total_relatorios': 0,
                        'status': 'ENCONTRADO'
                    }
                
                resultados[nome_usuario]['relatorios'].append(report)
                resultados[nome_usuario]['total_relatorios'] += 1
        
        # Adicionar usuários sem relatórios
        for nome_planilha, info in mapeamento.items():
            if nome_planilha not in resultados:
                resultados[nome_planilha] = {
                    'user_id': info['id'],
                    'relatorios': [],
                    'total_relatorios': 0,
                    'status': 'SEM_RELATORIOS'
                }
        
        # Estatísticas
        com_relatorios = len([r for r in resultados.values() if r['total_relatorios'] > 0])
        sem_relatorios = len([r for r in resultados.values() if r['total_relatorios'] == 0])
        taxa_sucesso = com_relatorios / len(mapeamento) * 100
        
        print(f'\n📊 ESTATÍSTICAS:')
        print(f'Com relatórios: {com_relatorios}')
        print(f'Sem relatórios: {sem_relatorios}')
        print(f'Taxa de sucesso: {taxa_sucesso:.1f}%')
        
        # Salvar resultados
        with open('relatorios_abril_2026_100_usuarios.json', 'w') as f:
            json.dump({
                'resultados': resultados,
                'estatisticas': {
                    'total_usuarios': len(mapeamento),
                    'com_relatorios': com_relatorios,
                    'sem_relatorios': sem_relatorios,
                    'taxa_sucesso': taxa_sucesso,
                    'total_relatorios_encontrados': sum(r['total_relatorios'] for r in resultados.values())
                }
            }, f, indent=2)
        
        print(f'\n✅ BUSCA CONCLUÍDA!')
        print(f'✅ Resultados salvos em: relatorios_abril_2026_100_usuarios.json')
        
        # Mostrar exemplos
        print(f'\n📋 EXEMPLOS DE USUÁRIOS COM RELATÓRIOS:')
        exemplos = [(nome, dados) for nome, dados in resultados.items() if dados['total_relatorios'] > 0][:5]
        for i, (nome, dados) in enumerate(exemplos):
            print(f'{i+1}. {nome[:30]}... -> {dados["total_relatorios"]} relatórios')
        
        if taxa_sucesso >= 95:
            print(f'\n🎯 META ATINGIDA! {com_relatorios} usuários com relatórios (>95%)')
        else:
            print(f'\n⚠️  Meta não atingida. Apenas {com_relatorios} usuários com relatórios')
        
        print(f'\n🚀 Próximo passo: Extrair valores e aplicar padrões matemáticos')
        
    else:
        print(f'❌ Erro na busca: HTTP {response.status_code}')
        print(f'Resposta: {response.text[:200]}')
        
except Exception as e:
    print(f'❌ Erro: {e}')
    import traceback
    traceback.print_exc()