import requests
import json

def debug_jonas_api():
    """Debug completo para encontrar JONAS na API"""
    
    API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
    BASE_URL = "https://api.vexpenses.com/v2"
    
    headers = {
        'Authorization': API_KEY,
        'Accept': 'application/json'
    }
    
    print('🔍 DEBUG COMPLETO - JONAS NA API')
    print('=' * 50)
    
    # 1. Verificar dados que temos do JONAS
    print('📋 1. Dados do JONAS da planilha:')
    with open('converted/carga_maio_2026.json', 'r', encoding='utf-8') as f:
        dados = json.load(f)
    
    planilha = dados['Planilha1']
    for i, linha in enumerate(planilha):
        if linha and len(linha) > 0 and 'JONAS CAVALCANTI' in str(linha[0]):
            print(f'   Linha {i+1}:')
            print(f'   Nome: "{linha[0]}"')
            print(f'   CPF: "{linha[1]}"')
            print(f'   Status: "{linha[2]}"')
            print(f'   Regional: "{linha[3]}"')
            break
    
    # 2. Buscar todos os usuários com diferentes parâmetros
    print()
    print('📡 2. Testando diferentes buscas...')
    
    # Busca 1: Sem include
    response1 = requests.get(f"{BASE_URL}/team-members", headers=headers)
    if response1.status_code == 200:
        users1 = response1.json().get('data', [])
        print(f'✅ Busca simples: {len(users1)} usuários')
        
        # Procurar JONAS
        for user in users1:
            if (user.get('name') == 'JONAS CAVALCANTI DE OLIVEIRA' or 
                user.get('cpf') == '01696239478'):
                print(f'   ✅ JONAS encontrado (busca simples): ID {user["id"]}')
                break
        else:
            print('   ❌ JONAS não encontrado (busca simples)')
    
    # Busca 2: Com include=all
    response2 = requests.get(f"{BASE_URL}/team-members", headers=headers, params={
        'include': 'all',
        'paginate': 'false'
    })
    if response2.status_code == 200:
        users2 = response2.json().get('data', [])
        print(f'✅ Busca include=all: {len(users2)} usuários')
        
        # Procurar JONAS
        for user in users2:
            if (user.get('name') == 'JONAS CAVALCANTI DE OLIVEIRA' or 
                user.get('cpf') == '01696239478'):
                print(f'   ✅ JONAS encontrado (include=all): ID {user["id"]}')
                break
        else:
            print('   ❌ JONAS não encontrado (include=all)')
    
    # Busca 3: Por email
    response3 = requests.get(f"{BASE_URL}/team-members/email/Jcavalcanti2412@gmail.com", headers=headers)
    if response3.status_code == 200:
        user3 = response3.json()
        print(f'✅ JONAS encontrado por email: ID {user3.get("id")}')
        print(f'   Nome: {user3.get("name")}')
        print(f'   CPF: {user3.get("cpf")}')
    else:
        print(f'❌ Erro ao buscar por email: {response3.status_code}')
    
    # Busca 4: Por CPF (se existir endpoint)
    response4 = requests.get(f"{BASE_URL}/team-members/cpf/01696239478", headers=headers)
    if response4.status_code == 200:
        user4 = response4.json()
        print(f'✅ JONAS encontrado por CPF: ID {user4.get("id")}')
    else:
        print(f'❌ Endpoint por CPF não existe: {response4.status_code}')
    
    # 3. Buscar por ID específico (do arquivo de validação)
    print()
    print('📡 3. Buscando por ID específico...')
    
    # Ler dados de validação anteriores
    try:
        with open('validacao_colaboradores.json', 'r', encoding='utf-8') as f:
            validation_data = json.load(f)
        
        for val in validation_data['validacoes']:
            if (val.get('nome_planilha') == 'JONAS CAVALCANTI DE OLIVEIRA' and 
                val.get('cpf_planilha') == '01696239478'):
                jonas_id = val['dados_api']['id']
                print(f'   ID do JONAS (validação): {jonas_id}')
                
                # Buscar por este ID
                response5 = requests.get(f"{BASE_URL}/team-members/{jonas_id}", headers=headers)
                if response5.status_code == 200:
                    user5 = response5.json()
                    print(f'   ✅ JONAS encontrado por ID: {user5.get("name")}')
                    print(f'   CPF: {user5.get("cpf")}')
                    print(f'   Active: {user5.get("active")}')
                    
                    # Buscar com include
                    response6 = requests.get(f"{BASE_URL}/team-members/{jonas_id}", headers=headers, params={
                        'include': 'projects,costsCenters'
                    })
                    if response6.status_code == 200:
                        user6 = response6.json()
                        print(f'   ✅ Dados completos com include:')
                        
                        # Analisar projetos
                        projects = user6.get('projects', {})
                        if isinstance(projects, dict) and 'data' in projects:
                            print(f'      Projetos: {len(projects["data"])}')
                            for proj in projects['data']:
                                proj_name = proj.get('name', '')
                                print(f'        - {proj_name}')
                                if 'REGIONAL' in proj_name.upper():
                                    print(f'          🌍 É REGIONAL!')
                else:
                    print(f'   ❌ Erro ao buscar por ID: {response5.status_code}')
                break
    except Exception as e:
        print(f'❌ Erro ao ler validação: {e}')
    
    # 4. Listar todos os usuários para análise
    print()
    print('📋 4. Análise de usuários encontrados...')
    
    if response2.status_code == 200:
        users2 = response2.json().get('data', [])
        
        # Procurar nomes similares
        similares = []
        for user in users2:
            name = user.get('name', '').upper()
            if 'JONAS' in name:
                similares.append(user)
        
        if similares:
            print(f'✅ Encontrados {len(similares)} usuários com "JONAS" no nome:')
            for user in similares:
                print(f'   - {user.get("name")} (ID: {user.get("id")})')
                print(f'     CPF: {user.get("cpf")}')
        else:
            print('❌ Nenhum usuário com "JONAS" no nome')
        
        # Procurar CPF similar
        cpf_similares = []
        for user in users2:
            cpf = user.get('cpf', '')
            if cpf and cpf.startswith('016'):
                cpf_similares.append(user)
        
        if cpf_similares:
            print(f'✅ Encontrados {len(cpf_similares)} usuários com CPF iniciando "016":')
            for user in cpf_similares[:5]:  # Primeiros 5
                print(f'   - {user.get("name")} (CPF: {user.get("cpf")})')

if __name__ == '__main__':
    debug_jonas_api()
