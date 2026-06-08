import requests
import json

def investigar_regional_usuario():
    """Investiga endpoints da API para encontrar dados de regional"""
    
    API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
    BASE_URL = "https://api.vexpenses.com/v2"
    
    headers = {
        'Authorization': API_KEY,
        'Accept': 'application/json'
    }
    
    print('🔍 INVESTIGANDO REGIONAL NA API VEXPENSES')
    print('=' * 60)
    
    # 1. Buscar dados completos do JONAS com costsCenters e projects
    print('📡 1. Buscando dados completos do JONAS com costsCenters...')
    response = requests.get(f"{BASE_URL}/team-members", headers=headers, params={
        'include': 'costsCenters,projects,company,role',
        'paginate': 'false'
    })
    
    if response.status_code != 200:
        print(f'❌ Erro na API: {response.status_code}')
        return
    
    members = response.json().get('data', [])
    
    # Encontrar JONAS
    jonas_data = None
    for member in members:
        if (member.get('name') == 'JONAS CAVALCANTI DE OLIVEIRA' and 
            member.get('cpf') == '01696239478'):
            jonas_data = member
            break
    
    if not jonas_data:
        print('❌ JONAS não encontrado')
        return
    
    print('✅ JONAS encontrado!')
    print()
    print('📋 DADOS COMPLETOS DO JONAS:')
    print('-' * 40)
    
    # Campos principais
    campos_principais = ['id', 'name', 'cpf', 'email', 'active', 'company_id', 'role_id']
    for campo in campos_principais:
        valor = jonas_data.get(campo, 'N/A')
        print(f'{campo:15}: {valor}')
    
    print()
    print('🏢 DADOS DA EMPRESA:')
    print('-' * 40)
    company_id = jonas_data.get('company_id')
    if company_id:
        # Buscar dados da empresa
        company_response = requests.get(f"{BASE_URL}/companies/{company_id}", headers=headers)
        if company_response.status_code == 200:
            company_data = company_response.json()
            print(f'ID: {company_data.get("id")}')
            print(f'Nome: {company_data.get("name")}')
            print(f'Trade Name: {company_data.get("trade_name")}')
            print(f'Document: {company_data.get("document")}')
        else:
            print(f'❌ Erro ao buscar empresa: {company_response.status_code}')
    
    print()
    print('💰 COSTS CENTERS DO JONAS:')
    print('-' * 40)
    costs_centers = jonas_data.get('costsCenters', {})
    if isinstance(costs_centers, dict) and 'data' in costs_centers:
        for cc in costs_centers['data']:
            print(f'ID: {cc.get("id")}')
            print(f'Name: {cc.get("name")}')
            print(f'External Code: {cc.get("external_code")}')
            print(f'Integration ID: {cc.get("integration_id")}')
            print('---')
    
    print()
    print('📁 PROJECTS DO JONAS:')
    print('-' * 40)
    projects = jonas_data.get('projects', {})
    if isinstance(projects, dict) and 'data' in projects:
        for project in projects['data']:
            print(f'ID: {project.get("id")}')
            print(f'Name: {project.get("name")}')
            print(f'External Code: {project.get("external_code")}')
            print('---')
    
    print()
    print('🔍 2. Explorando endpoints de costs centers...')
    
    # Buscar todos os costs centers
    cc_response = requests.get(f"{BASE_URL}/costs-centers", headers=headers, params={
        'paginate': 'false'
    })
    
    if cc_response.status_code == 200:
        cc_data = cc_response.json()
        all_costs_centers = cc_data.get('data', [])
        print(f'✅ Encontrados {len(all_costs_centers)} costs centers')
        
        # Procurar por costs centers que contenham "REGIONAL" ou "NE"
        regionais_encontradas = []
        for cc in all_costs_centers:
            name = cc.get('name', '').upper()
            if 'REGIONAL' in name or 'NE' in name or 'SC' in name or 'CO' in name:
                regionais_encontradas.append(cc)
        
        print()
        print('🌍 COSTS CENTERS COM REGIONAL:')
        print('-' * 40)
        for cc in regionais_encontradas[:10]:  # Primeiros 10
            print(f'Name: {cc.get("name")}')
            print(f'External Code: {cc.get("external_code")}')
            print(f'Integration ID: {cc.get("integration_id")}')
            print('---')
    
    print()
    print('🔍 3. Explorando endpoints de projects...')
    
    # Buscar todos os projects
    projects_response = requests.get(f"{BASE_URL}/projects", headers=headers, params={
        'paginate': 'false'
    })
    
    if projects_response.status_code == 200:
        projects_data = projects_response.json()
        all_projects = projects_data.get('data', [])
        print(f'✅ Encontrados {len(all_projects)} projects')
        
        # Procurar por projects que contenham "REGIONAL" ou "NE"
        projects_regionais = []
        for project in all_projects:
            name = project.get('name', '').upper()
            if 'REGIONAL' in name or 'NE' in name or 'SC' in name or 'CO' in name:
                projects_regionais.append(project)
        
        print()
        print('📁 PROJECTS COM REGIONAL:')
        print('-' * 40)
        for project in projects_regionais[:10]:  # Primeiros 10
            print(f'Name: {project.get("name")}')
            print(f'External Code: {project.get("external_code")}')
            print('---')
    
    print()
    print('💾 Salvando dados completos para análise...')
    
    # Salvar dados completos
    resultado = {
        'jonas_data': jonas_data,
        'costs_centers_regionais': regionais_encontradas,
        'projects_regionais': projects_regionais,
        'planilha_regional': 'REGIONAL NE'  # Da planilha do JONAS
    }
    
    with open('investigacao_regional_jonas.json', 'w', encoding='utf-8') as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)
    
    print('✅ Dados salvos em investigacao_regional_jonas.json')
    return resultado

if __name__ == '__main__':
    investigar_regional_usuario()
