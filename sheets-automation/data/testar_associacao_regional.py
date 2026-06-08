import requests
import json

def testar_associacao_regional():
    """Testar associação de usuários a projetos REGIONAL"""
    
    API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
    BASE_URL = "https://api.vexpenses.com/v2"
    
    headers = {
        'Authorization': API_KEY,
        'Accept': 'application/json'
    }
    
    print('🔗 TESTANDO ASSOCIAÇÃO USUÁRIOS x PROJETOS REGIONAL')
    print('=' * 60)
    
    # 1. Buscar todos os usuários com projetos
    print('📡 1. Buscando usuários com projetos...')
    
    response = requests.get(f"{BASE_URL}/team-members", headers=headers, params={
        'include': 'projects',
        'paginate': 'false'
    })
    
    if response.status_code != 200:
        print(f'❌ Erro: {response.status_code}')
        return
    
    users = response.json().get('data', [])
    print(f'✅ Encontrados {len(users)} usuários')
    
    # 2. Encontrar projetos REGIONAL
    print()
    print('🌍 2. Buscando projetos REGIONAL...')
    
    projects_response = requests.get(f"{BASE_URL}/projects", headers=headers, params={
        'paginate': 'false'
    })
    
    if projects_response.status_code != 200:
        print(f'❌ Erro ao buscar projetos: {projects_response.status_code}')
        return
    
    all_projects = projects_response.json().get('data', [])
    regionais = {p['id']: p for p in all_projects if 'REGIONAL' in p.get('name', '').upper()}
    
    print(f'✅ Encontrados {len(regionais)} projetos REGIONAL:')
    for id, proj in regionais.items():
        print(f'  ID: {id} | Name: {proj["name"]}')
    
    # 3. Analisar usuários e suas associações
    print()
    print('👥 3. Analisando associações de usuários...')
    
    usuarios_com_regionais = []
    
    for user in users:
        user_projects = user.get('projects', {})
        if isinstance(user_projects, dict) and 'data' in user_projects:
            user_project_ids = [p.get('id') for p in user_projects['data']]
            
            # Verificar se usuário está associado a algum projeto REGIONAL
            regionais_associados = []
            for proj_id in user_project_ids:
                if proj_id in regionais:
                    regionais_associados.append(regionais[proj_id])
            
            if regionais_associados:
                usuarios_com_regionais.append({
                    'user': user,
                    'regionais': regionais_associados
                })
    
    print(f'✅ {len(usuarios_com_regionais)} usuários associados a projetos REGIONAL')
    
    # 4. Procurar especificamente pelo JONAS
    print()
    print('🔍 4. Procurando JONAS...')
    
    jonas_encontrado = None
    for user in users:
        if (user.get('name') == 'JONAS CAVALCANTI DE OLIVEIRA' and 
            user.get('cpf') == '01696239478'):
            jonas_encontrado = user
            break
    
    if jonas_encontrado:
        print(f'✅ JONAS encontrado - ID: {jonas_encontrado["id"]}')
        
        # Analisar projetos do JONAS
        jonas_projects = jonas_encontrado.get('projects', {})
        if isinstance(jonas_projects, dict) and 'data' in jonas_projects:
            print(f'   Projetos do JONAS: {len(jonas_projects["data"])}')
            for proj in jonas_projects['data']:
                proj_name = proj.get('name', '')
                proj_id = proj.get('id')
                is_regional = proj_id in regionais
                print(f'   - {proj_name} (ID: {proj_id}) {"🌍 REGIONAL" if is_regional else ""}')
        else:
            print('   ❌ JONAS não tem projetos associados')
    else:
        print('❌ JONAS não encontrado')
    
    # 5. Mostrar exemplos de usuários com regionais
    print()
    print('📋 5. Exemplos de usuários com regionais:')
    
    exemplos = usuarios_com_regionais[:5]  # Primeiros 5
    
    for i, item in enumerate(exemplos):
        user = item['user']
        regionais = item['regionais']
        
        print(f'\n   {i+1}. {user["name"]}')
        print(f'      CPF: {user.get("cpf", "N/A")}')
        print(f'      Regionais:')
        for reg in regionais:
            print(f'        - {reg["name"]} (ID: {reg["id"]})')
    
    # 6. Tentar associar JONAS ao projeto REGIONAL NE
    if jonas_encontrado:
        print()
        print('🔧 6. Tentando associar JONAS a REGIONAL NE...')
        
        regional_ne_id = None
        for proj in regionais.values():
            if proj['name'] == 'REGIONAL NE':
                regional_ne_id = proj['id']
                break
        
        if regional_ne_id:
            print(f'   REGIONAL NE encontrado - ID: {regional_ne_id}')
            
            # Tentar associar (endpoint de attach)
            attach_data = {
                'project_external_code': None,  # Não temos external code
                'project_id': regional_ne_id
            }
            
            # Nota: Este endpoint pode não existir ou ter parâmetros diferentes
            print(f'   📡 Testando associação...')
            print(f'   ⚠️  Endpoint pode não existir ou requerer parâmetros diferentes')
        else:
            print('   ❌ REGIONAL NE não encontrado')
    
    # 7. Salvar resultados
    print()
    print('💾 7. Salvando resultados...')
    
    resultado = {
        'total_usuarios': len(users),
        'total_regionais': len(regionais),
        'usuarios_com_regionais': len(usuarios_com_regionais),
        'jonas_encontrado': jonas_encontrado is not None,
        'jonas_tem_regionais': jonas_encontrado and any(
            proj.get('id') in regionais 
            for proj in jonas_encontrado.get('projects', {}).get('data', [])
        ),
        'regionais_disponiveis': regionais,
        'exemplos_usuarios_regionais': usuarios_com_regionais[:10]
    }
    
    with open('test_associacao_regional.json', 'w', encoding='utf-8') as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)
    
    print('✅ Resultados salvos em test_associacao_regional.json')
    
    # 8. Conclusão
    print()
    print('🎯 8. CONCLUSÃO:')
    print('-' * 40)
    
    if jonas_encontrado:
        jonas_tem_regionais = any(
            proj.get('id') in regionais 
            for proj in jonas_encontrado.get('projects', {}).get('data', [])
        )
        
        if jonas_tem_regionais:
            print('✅ JONAS está associado a projetos REGIONAL!')
            print('   📊 Possível validar campo Regional da planilha')
        else:
            print('❌ JONAS não está associado a projetos REGIONAL')
            print('   🤔 Possíveis causas:')
            print('      - Usuário não foi associado corretamente')
            print('      - Associação feita por outro método')
            print('      - Dados de regional vêm de outra fonte')
    else:
        print('❌ JONAS não encontrado na API')
    
    print(f'📊 Estatísticas:')
    print(f'   - Total usuários: {len(users)}')
    print(f'   - Projetos REGIONAL: {len(regionais)}')
    print(f'   - Usuários com regionais: {len(usuarios_com_regionais)}')
    print(f'   - Percentual: {(len(usuarios_com_regionais)/len(users)*100):.1f}%')

if __name__ == '__main__':
    testar_associacao_regional()
