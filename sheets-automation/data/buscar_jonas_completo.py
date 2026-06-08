import requests
import json

def buscar_jonas_completo():
    """Buscar JONAS com todos os parâmetros possíveis"""
    
    API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
    BASE_URL = "https://api.vexpenses.com/v2"
    
    headers = {
        'Authorization': API_KEY,
        'Accept': 'application/json'
    }
    
    print('🔍 BUSCA COMPLETA DO JONAS')
    print('=' * 50)
    
    # 1. Buscar todos os usuários sem paginação
    print('📡 1. Buscando todos os usuários...')
    
    response = requests.get(f"{BASE_URL}/team-members", headers=headers, params={
        'include': 'projects,costsCenters',
        'paginate': 'false'
    })
    
    if response.status_code != 200:
        print(f'❌ Erro: {response.status_code}')
        return
    
    users = response.json().get('data', [])
    print(f'✅ Encontrados {len(users)} usuários')
    
    # 2. Procurar JONAS de várias formas
    print()
    print('🔍 2. Procurando JONAS...')
    
    jonas_encontrado = None
    
    # Busca por nome exato
    for user in users:
        if user.get('name') == 'JONAS CAVALCANTI DE OLIVEIRA':
            jonas_encontrado = user
            print(f'✅ Encontrado por nome exato: {user["name"]}')
            break
    
    # Se não encontrar, busca por CPF
    if not jonas_encontrado:
        for user in users:
            if user.get('cpf') == '01696239478':
                jonas_encontrado = user
                print(f'✅ Encontrado por CPF: {user["name"]}')
                break
    
    # Se ainda não encontrar, busca parcial
    if not jonas_encontrado:
        for user in users:
            name = user.get('name', '').upper()
            if 'JONAS' in name and 'CAVALCANTI' in name:
                jonas_encontrado = user
                print(f'✅ Encontrado por busca parcial: {user["name"]}')
                break
    
    if not jonas_encontrado:
        print('❌ JONAS não encontrado')
        return
    
    # 3. Analisar dados completos do JONAS
    print()
    print('📋 3. Dados completos do JONAS:')
    print('-' * 40)
    
    print(f'ID: {jonas_encontrado.get("id")}')
    print(f'Name: {jonas_encontrado.get("name")}')
    print(f'CPF: {jonas_encontrado.get("cpf")}')
    print(f'Email: {jonas_encontrado.get("email")}')
    print(f'Active: {jonas_encontrado.get("active")}')
    print(f'Company ID: {jonas_encontrado.get("company_id")}')
    
    # 4. Analisar projetos do JONAS
    print()
    print('📁 4. Projetos do JONAS:')
    
    projects = jonas_encontrado.get('projects', {})
    if isinstance(projects, dict) and 'data' in projects:
        print(f'✅ JONAS tem {len(projects["data"])} projetos:')
        
        # Buscar todos os projetos REGIONAL para comparação
        all_projects_response = requests.get(f"{BASE_URL}/projects", headers=headers, params={
            'paginate': 'false'
        })
        
        regionais = {}
        if all_projects_response.status_code == 200:
            all_projects = all_projects_response.json().get('data', [])
            regionais = {p['id']: p for p in all_projects if 'REGIONAL' in p.get('name', '').upper()}
        
        for proj in projects['data']:
            proj_name = proj.get('name', '')
            proj_id = proj.get('id')
            is_regional = proj_id in regionais
            
            print(f'  - {proj_name} (ID: {proj_id}) {"🌍 REGIONAL" if is_regional else ""}')
            
            if is_regional:
                print(f'    ↳ Corresponde a: {regionais[proj_id]["name"]}')
    else:
        print('❌ JONAS não tem projetos associados')
    
    # 5. Analisar costs centers do JONAS
    print()
    print('💰 5. Costs Centers do JONAS:')
    
    costs_centers = jonas_encontrado.get('costsCenters', {})
    if isinstance(costs_centers, dict) and 'data' in costs_centers:
        print(f'✅ JONAS tem {len(costs_centers["data"])} costs centers:')
        for cc in costs_centers['data']:
            print(f'  - {cc.get("name")} (ID: {cc.get("id")})')
    else:
        print('❌ JONAS não tem costs centers associados')
    
    # 6. Verificar se JONAS tem regional associada
    print()
    print('🌍 6. Verificando regional associada...')
    
    tem_regional = False
    regional_encontrada = None
    
    # Verificar nos projetos
    projects = jonas_encontrado.get('projects', {})
    if isinstance(projects, dict) and 'data' in projects:
        for proj in projects['data']:
            proj_name = proj.get('name', '').upper()
            if 'REGIONAL' in proj_name:
                tem_regional = True
                regional_encontrada = proj
                break
    
    if tem_regional:
        print(f'✅ JONAS tem regional associada: {regional_encontrada["name"]}')
        print(f'   ID: {regional_encontrada["id"]}')
        print(f'   📊 Campo Regional da planilha pode ser validado!')
    else:
        print('❌ JONAS não tem regional associada nos projetos')
        
        # Verificar se há padrão nos costs centers
        costs_centers = jonas_encontrado.get('costsCenters', {})
        if isinstance(costs_centers, dict) and 'data' in costs_centers:
            print('🔍 Verificando padrão nos costs centers...')
            for cc in costs_centers['data']:
                cc_name = cc.get('name', '').upper()
                if 'NE' in cc_name or 'NORDESTE' in cc_name:
                    print(f'   Possível correlação: {cc.get("name")} ↦ REGIONAL NE')
    
    # 7. Salvar resultados
    print()
    print('💾 7. Salvando resultados...')
    
    resultado = {
        'jonas_encontrado': True,
        'jonas_dados': jonas_encontrado,
        'tem_regional_projetos': tem_regional,
        'regional_projetos': regional_encontrada,
        'total_projetos': len(projects.get('data', [])) if isinstance(projects, dict) else 0,
        'total_costs_centers': len(costs_centers.get('data', [])) if isinstance(costs_centers, dict) else 0
    }
    
    with open('jonas_busca_completa.json', 'w', encoding='utf-8') as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)
    
    print('✅ Resultados salvos em jonas_busca_completa.json')
    
    return resultado

if __name__ == '__main__':
    buscar_jonas_completo()
