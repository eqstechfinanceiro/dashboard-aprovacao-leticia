import requests
import json

def investigar_regional_completa():
    """Investigação completa para encontrar correlação de regional usando API"""
    
    API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
    BASE_URL = "https://api.vexpenses.com/v2"
    
    headers = {
        'Authorization': API_KEY,
        'Accept': 'application/json'
    }
    
    print('🔍 INVESTIGAÇÃO COMPLETA - REGIONAL x USUÁRIO')
    print('=' * 60)
    
    # 1. Carregar dados existentes do JONAS
    print('📋 1. Carregando dados existentes...')
    try:
        with open('validacao_colaboradores.json', 'r', encoding='utf-8') as f:
            validation_data = json.load(f)
        
        # Encontrar JONAS
        jonas_validation = None
        for val in validation_data['validacoes']:
            if (val.get('nome_planilha') == 'JONAS CAVALCANTI DE OLIVEIRA' and 
                val.get('cpf_planilha') == '01696239478'):
                jonas_validation = val
                break
        
        if not jonas_validation:
            print('❌ JONAS não encontrado nos dados de validação')
            return
        
        jonas_api_data = jonas_validation['dados_api']
        print(f'✅ JONAS encontrado - ID: {jonas_api_data["id"]}')
        
    except Exception as e:
        print(f'❌ Erro ao carregar dados: {e}')
        return
    
    # 2. Buscar dados completos do JONAS com costsCenters
    print()
    print('📡 2. Buscando costsCenters do JONAS...')
    
    response = requests.get(f"{BASE_URL}/team-members/{jonas_api_data['id']}", headers=headers, params={
        'include': 'costsCenters,projects,company'
    })
    
    if response.status_code != 200:
        print(f'❌ Erro ao buscar dados completos: {response.status_code}')
        print(response.text)
        return
    
    jonas_completo = response.json()
    
    # 3. Analisar costsCenters do JONAS
    print()
    print('💰 3. Analisando costsCenters do JONAS...')
    
    costs_centers = jonas_completo.get('costsCenters', {})
    if isinstance(costs_centers, dict) and 'data' in costs_centers:
        print(f'✅ JONAS tem {len(costs_centers["data"])} costs centers:')
        for i, cc in enumerate(costs_centers['data']):
            print(f'  {i+1}. ID: {cc.get("id")} | Name: {cc.get("name")} | External Code: {cc.get("external_code")}')
    else:
        print('❌ JONAS não tem costs centers')
    
    # 4. Buscar todos os costsCenters disponíveis
    print()
    print('📡 4. Buscando todos os costsCenters...')
    
    cc_response = requests.get(f"{BASE_URL}/costs-centers", headers=headers, params={
        'paginate': 'false'
    })
    
    if cc_response.status_code != 200:
        print(f'❌ Erro ao buscar costs centers: {cc_response.status_code}')
        return
    
    all_cc = cc_response.json().get('data', [])
    print(f'✅ Encontrados {len(all_cc)} costs centers no total')
    
    # 5. Procurar por costs centers que contenham "REGIONAL"
    print()
    print('🌍 5. Procurando costs centers com "REGIONAL"...')
    
    cc_regionais = []
    for cc in all_cc:
        name = cc.get('name', '').upper()
        if 'REGIONAL' in name:
            cc_regionais.append(cc)
    
    print(f'✅ Encontrados {len(cc_regionais)} costs centers com "REGIONAL":')
    for cc in cc_regionais:
        print(f'  - ID: {cc.get("id")} | Name: {cc.get("name")} | External Code: {cc.get("external_code")}')
    
    # 6. Verificar se JONAS está associado a algum cost center regional
    print()
    print('🔗 6. Verificando associação JONAS x REGIONAL...')
    
    jonas_cc_ids = []
    if isinstance(costs_centers, dict) and 'data' in costs_centers:
        jonas_cc_ids = [cc.get('id') for cc in costs_centers['data']]
    
    regional_associada = None
    for cc in cc_regionais:
        if cc.get('id') in jonas_cc_ids:
            regional_associada = cc
            break
    
    if regional_associada:
        print(f'✅ JONAS está associado à regional: {regional_associada.get("name")}')
        print(f'   External Code: {regional_associada.get("external_code")}')
    else:
        print('❌ JONAS não está associado diretamente a um cost center "REGIONAL"')
    
    # 7. Buscar todos os projetos
    print()
    print('📁 7. Buscando todos os projetos...')
    
    projects_response = requests.get(f"{BASE_URL}/projects", headers=headers, params={
        'paginate': 'false'
    })
    
    if projects_response.status_code != 200:
        print(f'❌ Erro ao buscar projetos: {projects_response.status_code}')
        return
    
    all_projects = projects_response.json().get('data', [])
    print(f'✅ Encontrados {len(all_projects)} projetos no total')
    
    # 8. Procurar por projetos que contenham "REGIONAL"
    print()
    print('📁 8. Procurando projetos com "REGIONAL"...')
    
    projects_regionais = []
    for project in all_projects:
        name = project.get('name', '').upper()
        if 'REGIONAL' in name:
            projects_regionais.append(project)
    
    print(f'✅ Encontrados {len(projects_regionais)} projetos com "REGIONAL":')
    for project in projects_regionais:
        print(f'  - ID: {project.get("id")} | Name: {project.get("name")} | External Code: {project.get("external_code")}')
    
    # 9. Verificar se JONAS está associado a algum projeto regional
    print()
    print('🔗 9. Verificando associação JONAS x Projetos REGIONAL...')
    
    jonas_projects = jonas_completo.get('projects', {})
    jonas_project_ids = []
    if isinstance(jonas_projects, dict) and 'data' in jonas_projects:
        jonas_project_ids = [project.get('id') for project in jonas_projects['data']]
    
    project_regional_associado = None
    for project in projects_regionais:
        if project.get('id') in jonas_project_ids:
            project_regional_associado = project
            break
    
    if project_regional_associado:
        print(f'✅ JONAS está associado ao projeto regional: {project_regional_associado.get("name")}')
        print(f'   External Code: {project_regional_associado.get("external_code")}')
    else:
        print('❌ JONAS não está associado diretamente a um projeto "REGIONAL"')
    
    # 10. Buscar dados da empresa
    print()
    print('🏢 10. Buscando dados da empresa...')
    
    company_response = requests.get(f"{BASE_URL}/companies/{jonas_api_data['company_id']}", headers=headers)
    
    if company_response.status_code == 200:
        company_data = company_response.json()
        print(f'✅ Empresa: {company_data.get("name")} (ID: {company_data.get("id")})')
        print(f'   Trade Name: {company_data.get("trade_name")}')
        print(f'   Document: {company_data.get("document")}')
    else:
        print(f'❌ Erro ao buscar empresa: {company_response.status_code}')
    
    # 11. Testar outros endpoints possíveis
    print()
    print('🔍 11. Testando endpoints adicionais...')
    
    # Testar endpoint de roles
    if jonas_api_data.get('role_id'):
        role_response = requests.get(f"{BASE_URL}/roles/{jonas_api_data['role_id']}", headers=headers)
        if role_response.status_code == 200:
            role_data = role_response.json()
            print(f'✅ Role: {role_data.get("name")} (ID: {role_data.get("id")})')
        else:
            print(f'❌ Erro ao buscar role: {role_response.status_code}')
    
    # 12. Salvar resultados
    print()
    print('💾 12. Salvando resultados...')
    
    resultado = {
        'planilha_regional': 'REGIONAL NE',
        'jonas_id': jonas_api_data['id'],
        'jonas_costs_centers': costs_centers.get('data', []) if isinstance(costs_centers, dict) else [],
        'jonas_projects': jonas_projects.get('data', []) if isinstance(jonas_projects, dict) else [],
        'all_costs_centers_regionais': cc_regionais,
        'all_projects_regionais': projects_regionais,
        'regional_associada': regional_associada,
        'project_regional_associado': project_regional_associado,
        'empresa': company_data if company_response.status_code == 200 else None
    }
    
    with open('investigacao_regional_completa.json', 'w', encoding='utf-8') as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)
    
    print('✅ Resultados salvos em investigacao_regional_completa.json')
    
    # 13. Conclusão
    print()
    print('🎯 13. CONCLUSÃO:')
    print('-' * 40)
    
    if regional_associada:
        print(f'✅ CORRELAÇÃO ENCONTRADA!')
        print(f'   Planilha: REGIONAL NE')
        print(f'   API Cost Center: {regional_associada.get("name")}')
        print(f'   External Code: {regional_associada.get("external_code")}')
        print(f'   📊 Campo para validar: Coluna Regional (coluna 4)')
    elif project_regional_associado:
        print(f'✅ CORRELAÇÃO ENCONTRADA (via Projetos)!')
        print(f'   Planilha: REGIONAL NE')
        print(f'   API Project: {project_regional_associado.get("name")}')
        print(f'   External Code: {project_regional_associado.get("external_code")}')
        print(f'   📊 Campo para validar: Coluna Regional (coluna 4)')
    else:
        print('❌ Nenhuma correlação direta encontrada')
        print('   Possíveis estratégias:')
        print('   1. Analisar external codes dos costs centers')
        print('   2. Analisar external codes dos projetos')
        print('   3. Verificar se há padrão nos nomes')
        print('   4. Investigar outros endpoints da API')

if __name__ == '__main__':
    investigar_regional_completa()
