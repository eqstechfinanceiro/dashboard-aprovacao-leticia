import json
import requests
import pandas as pd
import time

print('BUSCANDO RELATÓRIOS DE ABRIL 2026 - 100 USUÁRIOS')
print('=' * 50)

# Carregar mapeamento
with open('mapeamento_100_usuarios.json', 'r') as f:
    dados_mapeamento = json.load(f)

mapeamento = dados_mapeamento['mapeamento']
print(f'Usuários mapeados: {len(mapeamento)}')

# Carregar dados da planilha
df_planilha = pd.read_csv('100_usuarios_planilha.csv')
print(f'Dados da planilha: {len(df_planilha)}')

# Configuração API
headers = {
    'Authorization': 'N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8',
    'Content-Type': 'application/json',
    'Accept': 'application/json'
}

# Buscar relatórios de Abril 2026
resultados = {}
erros = []

print('\nBUSCANDO RELATÓRIOS DE ABRIL 2026...')
print('Período: 01/04/2026 a 15/04/2026')

for i, (nome_planilha, info) in enumerate(mapeamento.items()):
    user_id = info['id']
    
    try:
        # Buscar relatórios do usuário em Abril 2026
        url = f'https://api.vexpenses.com/v2/reports?user_id={user_id}&begin_date=2026-04-01&end_date=2026-04-15&paginate=false'
        
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            dados_api = response.json()
            reports = dados_api.get('data', [])
            
            # Filtrar relatórios de Abril 2026
            relatorios_abril = []
            for report in reports:
                description = report.get('description', '').upper()
                if '04/2026' in description or 'ABRIL 2026' in description:
                    relatorios_abril.append(report)
            
            if relatorios_abril:
                resultados[nome_planilha] = {
                    'user_id': user_id,
                    'relatorios': relatorios_abril,
                    'total_relatorios': len(relatorios_abril),
                    'status': 'ENCONTRADO'
                }
                print(f'✅ {i+1:3d}/100: {nome_planilha[:30]}... -> {len(relatorios_abril)} relatórios')
            else:
                resultados[nome_planilha] = {
                    'user_id': user_id,
                    'relatorios': [],
                    'total_relatorios': 0,
                    'status': 'SEM_RELATORIOS'
                }
                print(f'⚠️  {i+1:3d}/100: {nome_planilha[:30]}... -> Sem relatórios Abril 2026')
        else:
            erros.append({
                'nome': nome_planilha,
                'user_id': user_id,
                'erro': f'HTTP {response.status_code}',
                'mensagem': response.text
            })
            print(f'❌ {i+1:3d}/100: {nome_planilha[:30]}... -> Erro HTTP {response.status_code}')
        
        # Pequena pausa para não sobrecarregar a API
        time.sleep(0.1)
        
    except Exception as e:
        erros.append({
            'nome': nome_planilha,
            'user_id': user_id,
            'erro': 'EXCEPTION',
            'mensagem': str(e)
        })
        print(f'❌ {i+1:3d}/100: {nome_planilha[:30]}... -> Erro: {str(e)[:50]}')

# Salvar resultados
with open('relatorios_abril_2026_100_usuarios.json', 'w') as f:
    json.dump({
        'resultados': resultados,
        'erros': erros,
        'estatisticas': {
            'total_usuarios': len(mapeamento),
            'com_relatorios': len([r for r in resultados.values() if r['total_relatorios'] > 0]),
            'sem_relatorios': len([r for r in resultados.values() if r['total_relatorios'] == 0]),
            'erros': len(erros),
            'taxa_sucesso': len([r for r in resultados.values() if r['total_relatorios'] > 0]) / len(mapeamento) * 100
        }
    }, f, indent=2)

# Estatísticas finais
estatisticas = {
    'total_usuarios': len(mapeamento),
    'com_relatorios': len([r for r in resultados.values() if r['total_relatorios'] > 0]),
    'sem_relatorios': len([r for r in resultados.values() if r['total_relatorios'] == 0]),
    'erros': len(erros),
    'taxa_sucesso': len([r for r in resultados.values() if r['total_relatorios'] > 0]) / len(mapeamento) * 100
}

print(f'\n📊 ESTATÍSTICAS DA BUSCA:')
print(f'Total de usuários: {estatisticas["total_usuarios"]}')
print(f'Com relatórios: {estatisticas["com_relatorios"]}')
print(f'Sem relatórios: {estatisticas["sem_relatorios"]}')
print(f'Erros: {estatisticas["erros"]}')
print(f'Taxa de sucesso: {estatisticas["taxa_sucesso"]:.1f}%')

print(f'\n📁 Resultados salvos em: relatorios_abril_2026_100_usuarios.json')
print(f'🚀 Próximo passo: Extrair valores e aplicar padrões matemáticos')

if estatisticas['taxa_sucesso'] >= 95:
    print(f'✅ META ATINGIDA! {estatisticas["com_relatorios"]} usuários com relatórios (>95%)')
else:
    print(f'⚠️  Meta não atingida. Apenas {estatisticas["com_relatorios"]} usuários com relatórios')