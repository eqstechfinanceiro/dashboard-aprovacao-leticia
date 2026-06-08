import requests
import json

def busca_correlacoes_api():
    """Usar dados completos do JONAS para buscar correlações na API"""
    
    # Carregar dados do JONAS
    with open('jonas_dados_completos.json', 'r', encoding='utf-8') as f:
        dados_jonas = json.load(f)
    
    API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
    BASE_URL = "https://api.vexpenses.com/v2"
    
    headers = {
        'Authorization': API_KEY,
        'Accept': 'application/json'
    }
    
    print('🔍 BUSCANDO CORRELAÇÕES NA API VEXPENSES')
    print('=' * 60)
    print('Dados do JONAS:')
    print(f'  Centro de Custo: {dados_jonas["Centro de Custo"]}')
    print(f'  Gestor 1: {dados_jonas["Gestor 1"]}')
    print(f'  Gestor 2: {dados_jonas["Gestor 2"]}')
    print(f'  Regional: {dados_jonas["Regional"]}')
    print()
    
    # 1. Buscar por Centro de Custo
    print('💰 1. Buscando por Centro de Custo...')
    
    # Buscar todos os costs centers
    cc_response = requests.get(f"{BASE_URL}/costs-centers", headers=headers, params={
        'paginate': 'false'
    })
    
    if cc_response.status_code == 200:
        all_cc = cc_response.json().get('data', [])
        print(f'✅ Encontrados {len(all_cc)} costs centers')
        
        # Procurar por "3R PETROLEUM NE" ou similar
        cc_encontrados = []
        for cc in all_cc:
            name = cc.get('name', '').upper()
            if '3R' in name and 'PETROLEUM' in name:
                cc_encontrados.append(cc)
            elif 'PETROLEUM' in name and 'NE' in name:
                cc_encontrados.append(cc)
        
        print(f'✅ Encontrados {len(cc_encontrados)} costs centers relacionados:')
        for cc in cc_encontrados:
            print(f'  - {cc.get("name")} (ID: {cc.get("id")})')
            print(f'    External Code: {cc.get("external_code")}')
            print(f'    Integration ID: {cc.get("integration_id")}')
    else:
        print(f'❌ Erro ao buscar costs centers: {cc_response.status_code}')
    
    # 2. Buscar usuários por nome dos gestores
    print()
    print('👥 2. Buscando usuários pelos nomes dos gestores...')
    
    gestores = [dados_jonas["Gestor 1"], dados_jonas["Gestor 2"]]
    
    for gestor in gestores:
        if gestor:
            print(f'\n🔍 Buscando gestor: {gestor}')
            
            # Buscar todos os usuários
            users_response = requests.get(f"{BASE_URL}/team-members", headers=headers, params={
                'paginate': 'false'
            })
            
            if users_response.status_code == 200:
                users = users_response.json().get('data', [])
                
                # Procurar por gestor
                gestor_encontrado = None
                for user in users:
                    name = user.get('name', '').upper()
                    if gestor.upper() in name:
                        gestor_encontrado = user
                        break
                
                if gestor_encontrado:
                    print(f'  ✅ Gestor encontrado: {gestor_encontrado["name"]}')
                    print(f'     ID: {gestor_encontrado["id"]}')
                    print(f'     CPF: {gestor_encontrado["cpf"]}')
                    print(f'     Email: {gestor_encontrado["email"]}')
                    
                    # Verificar projetos do gestor
                    gestor_response = requests.get(f"{BASE_URL}/team-members/{gestor_encontrado['id']}", 
                                                   headers=headers, params={'include': 'projects'})
                    if gestor_response.status_code == 200:
                        gestor_data = gestor_response.json()
                        projects = gestor_data.get('projects', {})
                        if isinstance(projects, dict) and 'data' in projects:
                            print(f'     Projetos do gestor: {len(projects["data"])}')
                            for proj in projects['data']:
                                proj_name = proj.get('name', '')
                                print(f'       - {proj_name}')
                                if 'REGIONAL' in proj_name.upper():
                                    print(f'         🌍 É REGIONAL!')
                else:
                    print(f'  ❌ Gestor não encontrado')
    
    # 3. Buscar projetos relacionados ao centro de custo
    print()
    print('📁 3. Buscando projetos relacionados...')
    
    # Buscar todos os projetos
    projects_response = requests.get(f"{BASE_URL}/projects", headers=headers, params={
        'paginate': 'false'
    })
    
    if projects_response.status_code == 200:
        all_projects = projects_response.json().get('data', [])
        print(f'✅ Encontrados {len(all_projects)} projetos')
        
        # Procurar projetos relacionados ao JONAS
        projetos_relacionados = []
        for proj in all_projects:
            name = proj.get('name', '').upper()
            # Procurar por NE, PETROLEUM, 3R, etc.
            if ('NE' in name and ('PETROLEUM' in name or '3R' in name)) or \
               ('REGIONAL NE' in name):
                projetos_relacionados.append(proj)
        
        print(f'✅ Encontrados {len(projetos_relacionados)} projetos relacionados:')
        for proj in projetos_relacionados:
            print(f'  - {proj.get("name")} (ID: {proj.get("id")})')
            print(f'    External Code: {proj.get("external_code")}')
    
    # 4. Buscar usuários associados a REGIONAL NE
    print()
    print('🌍 4. Buscando usuários associados a REGIONAL NE...')
    
    # Buscar todos os usuários com projetos
    users_with_projects_response = requests.get(f"{BASE_URL}/team-members", headers=headers, params={
        'include': 'projects',
        'paginate': 'false'
    })
    
    if users_with_projects_response.status_code == 200:
        users_with_projects = users_with_projects_response.json().get('data', [])
        
        usuarios_regionais = []
        for user in users_with_projects:
            projects = user.get('projects', {})
            if isinstance(projects, dict) and 'data' in projects:
                for proj in projects['data']:
                    proj_name = proj.get('name', '').upper()
                    if 'REGIONAL NE' in proj_name:
                        usuarios_regionais.append({
                            'user': user,
                            'project': proj
                        })
                        break
        
        print(f'✅ Encontrados {len(usuarios_regionais)} usuários com REGIONAL NE:')
        for item in usuarios_regionais[:5]:  # Primeiros 5
            user = item['user']
            proj = item['project']
            print(f'  - {user["name"]} (ID: {user["id"]})')
            print(f'    CPF: {user.get("cpf")}')
            print(f'    Projeto: {proj["name"]}')
    
    # 5. Verificar se JONAS aparece em alguma busca
    print()
    print('🔍 5. Verificando se JONAS aparece em buscas específicas...')
    
    # Buscar por CPF
    cpf_response = requests.get(f"{BASE_URL}/team-members", headers=headers, params={
        'cpf': dados_jonas['CPF'],
        'paginate': 'false'
    })
    
    if cpf_response.status_code == 200:
        users_by_cpf = cpf_response.json().get('data', [])
        print(f'✅ Busca por CPF ({dados_jonas["CPF"]}): {len(users_by_cpf)} resultados')
        for user in users_by_cpf:
            print(f'  - {user["name"]} (ID: {user["id"]})')
    
    # Buscar por email (se tivermos)
    if 'Jcavalcanti2412@gmail.com':
        email_response = requests.get(f"{BASE_URL}/team-members", headers=headers, params={
            'email': 'Jcavalcanti2412@gmail.com',
            'paginate': 'false'
        })
        
        if email_response.status_code == 200:
            users_by_email = email_response.json().get('data', [])
            print(f'✅ Busca por email: {len(users_by_email)} resultados')
            for user in users_by_email:
                print(f'  - {user["name"]} (ID: {user["id"]})')
    
    # 6. Salvar resultados
    print()
    print('💾 6. Salvando resultados...')
    
    resultado = {
        'dados_jonas': dados_jonas,
        'costs_centers_relacionados': cc_encontrados if cc_response.status_code == 200 else [],
        'projetos_relacionados': projetos_relacionados if projects_response.status_code == 200 else [],
        'usuarios_regionais_ne': usuarios_regionais if users_with_projects_response.status_code == 200 else []
    }
    
    with open('correlacoes_jonas_api.json', 'w', encoding='utf-8') as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)
    
    print('✅ Resultados salvos em correlacoes_jonas_api.json')
    
    # 7. Conclusão
    print()
    print('🎯 7. CONCLUSÃO:')
    print('-' * 40)
    
    if cc_encontrados:
        print('✅ Centro de Custo correlacionado!')
        print(f'   Planilha: {dados_jonas["Centro de Custo"]}')
        print(f'   API: {cc_encontrados[0]["name"]}')
        print('   📊 Possível validar campo Centro de Custo')
    
    if usuarios_regionais:
        print('✅ Usuários com REGIONAL NE encontrados!')
        print(f'   Total: {len(usuarios_regionais)} usuários')
        print('   📊 Padrão de associação REGIONAL NE existe')
    
    if not cc_encontrados and not usuarios_regionais:
        print('❌ Nenhuma correlação forte encontrada')
        print('   🤔 Possíveis causas:')
        print('      - Nomes diferentes na API')
        print('      - Associação feita por outro campo')
        print('      - Dados desatualizados')

if __name__ == '__main__':
    busca_correlacoes_api()
