import requests
import json

def debug_rodrigo_inconsistencia():
    """Investigar por que RODRIGO aparece validado na página mas não no script"""
    
    API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
    BASE_URL = "https://api.vexpenses.com/v2"
    
    headers = {
        'Authorization': API_KEY,
        'Accept': 'application/json'
    }
    
    print('🔍 DEBUG - INCONSISTÊNCIA RODRIGO CESAR DOS SANTOS')
    print('=' * 60)
    
    # 1. Verificar dados do RODRIGO na planilha
    print('📋 1. Dados do RODRIGO na planilha:')
    with open('converted/carga_maio_2026.json', 'r', encoding='utf-8') as f:
        dados = json.load(f)
    
    planilha = dados['Planilha1']
    rodrigo_planilha = None
    
    for i, linha in enumerate(planilha):
        if linha and len(linha) > 0 and 'RODRIGO CESAR DOS SANTOS' in str(linha[0]):
            rodrigo_planilha = linha
            print(f'   Linha {i+1}: {linha}')
            break
    
    if not rodrigo_planilha:
        print('❌ RODRIGO não encontrado na planilha')
        return
    
    print(f'   Centro de Custo planilha: "{rodrigo_planilha[4]}"')
    print()
    
    # 2. Verificar dados de validação existentes
    print('📄 2. Verificando dados de validação existentes...')
    
    try:
        with open('validacao_colaboradores.json', 'r', encoding='utf-8') as f:
            validation_data = json.load(f)
        
        rodrigo_validation = None
        for val in validation_data['validacoes']:
            if (val.get('nome_planilha') == 'RODRIGO CESAR DOS SANTOS' and 
                val.get('cpf_planilha') == rodrigo_planilha[1]):
                rodrigo_validation = val
                break
        
        if rodrigo_validation:
            print(f'✅ RODRIGO encontrado na validação:')
            print(f'   Encontrado API: {rodrigo_validation["encontrado_api"]}')
            if rodrigo_validation['encontrado_api'] and rodrigo_validation['dados_api']:
                api_data = rodrigo_validation['dados_api']
                print(f'   ID API: {api_data["id"]}')
                print(f'   Nome API: {api_data["name"]}')
                print(f'   CPF API: {api_data["cpf"]}')
        else:
            print('❌ RODRIGO não encontrado na validação')
    except Exception as e:
        print(f'❌ Erro ao ler validação: {e}')
    
    print()
    
    # 3. Buscar RODRIGO na API de diferentes formas
    print('🔍 3. Buscando RODRIGO na API (diferentes métodos)...')
    
    # Método 1: Busca simples
    response1 = requests.get(f"{BASE_URL}/team-members", headers=headers, params={
        'paginate': 'false'
    })
    
    if response1.status_code == 200:
        users1 = response1.json().get('data', [])
        rodrigo_encontrado_1 = None
        
        for user in users1:
            if (user.get('name') == 'RODRIGO CESAR DOS SANTOS' or 
                user.get('cpf') == rodrigo_planilha[1]):
                rodrigo_encontrado_1 = user
                break
        
        if rodrigo_encontrado_1:
            print(f'✅ Método 1 (busca simples): Encontrado')
            print(f'   ID: {rodrigo_encontrado_1["id"]}')
            print(f'   Nome: {rodrigo_encontrado_1["name"]}')
            print(f'   CPF: {rodrigo_encontrado_1["cpf"]}')
        else:
            print('❌ Método 1 (busca simples): Não encontrado')
    
    # Método 2: Busca com include=costsCenters
    response2 = requests.get(f"{BASE_URL}/team-members", headers=headers, params={
        'include': 'costsCenters',
        'paginate': 'false'
    })
    
    if response2.status_code == 200:
        users2 = response2.json().get('data', [])
        rodrigo_encontrado_2 = None
        
        for user in users2:
            if (user.get('name') == 'RODRIGO CESAR DOS SANTOS' or 
                user.get('cpf') == rodrigo_planilha[1]):
                rodrigo_encontrado_2 = user
                break
        
        if rodrigo_encontrado_2:
            print(f'✅ Método 2 (com costsCenters): Encontrado')
            print(f'   ID: {rodrigo_encontrado_2["id"]}')
            print(f'   Nome: {rodrigo_encontrado_2["name"]}')
            print(f'   CPF: {rodrigo_encontrado_2["cpf"]}')
            
            # Verificar costs centers
            costs_centers = rodrigo_encontrado_2.get('costsCenters', {})
            if isinstance(costs_centers, dict) and 'data' in costs_centers:
                print(f'   Centro(s) de Custo ({len(costs_centers["data"])}):')
                for cc in costs_centers['data']:
                    print(f'     - {cc.get("name")} (ID: {cc.get("id")})')
                    print(f'       External Code: {cc.get("external_code")}')
            else:
                print('   ❌ Sem costs centers')
        else:
            print('❌ Método 2 (com costsCenters): Não encontrado')
    
    # Método 3: Busca por CPF
    response3 = requests.get(f"{BASE_URL}/team-members", headers=headers, params={
        'cpf': rodrigo_planilha[1],
        'paginate': 'false'
    })
    
    if response3.status_code == 200:
        users3 = response3.json().get('data', [])
        rodrigo_encontrado_3 = None
        
        for user in users3:
            if user.get('cpf') == rodrigo_planilha[1]:
                rodrigo_encontrado_3 = user
                break
        
        if rodrigo_encontrado_3:
            print(f'✅ Método 3 (por CPF): Encontrado')
            print(f'   ID: {rodrigo_encontrado_3["id"]}')
            print(f'   Nome: {rodrigo_encontrado_3["name"]}')
        else:
            print('❌ Método 3 (por CPF): Não encontrado')
    
    # 4. Buscar por "CEF NORTE OESTE BA"
    print()
    print('🏢 4. Buscando por "CEF NORTE OESTE BA"...')
    
    cc_response = requests.get(f"{BASE_URL}/costs-centers", headers=headers, params={
        'paginate': 'false'
    })
    
    if cc_response.status_code == 200:
        all_cc = cc_response.json().get('data', [])
        cc_encontrado = None
        
        for cc in all_cc:
            if cc.get('name', '').upper() == 'CEF NORTE OESTE BA':
                cc_encontrado = cc
                break
        
        if cc_encontrado:
            print(f'✅ Centro de Custo encontrado:')
            print(f'   ID: {cc_encontrado["id"]}')
            print(f'   Name: {cc_encontrado["name"]}')
            print(f'   External Code: {cc_encontrado.get("external_code", "N/A")}')
            print(f'   Integration ID: {cc_encontrado.get("integration_id", "N/A")}')
        else:
            print('❌ "CEF NORTE OESTE BA" não encontrado')
    
    # 5. Verificar se RODRIGO está associado a este CC
    if cc_encontrado and rodrigo_encontrado_2:
        print()
        print('🔗 5. Verificando associação RODRIGO x CEF NORTE OESTE BA...')
        
        cc_id = cc_encontrado['id']
        user_cc_ids = []
        
        costs_centers = rodrigo_encontrado_2.get('costsCenters', {})
        if isinstance(costs_centers, dict) and 'data' in costs_centers:
            user_cc_ids = [cc.get('id') for cc in costs_centers['data']]
        
        if cc_id in user_cc_ids:
            print(f'✅ RODRIGO está associado a CEF NORTE OESTE BA!')
            print(f'   📊 Validação do visualizador está CORRETA')
        else:
            print(f'❌ RODRIGO não está associado a CEF NORTE OESTE BA')
            print(f'   CCs do RODRIGO: {user_cc_ids}')
            print(f'   CC esperado: {cc_id}')
    
    # 6. Conclusão
    print()
    print('🎯 6. CONCLUSÃO:')
    print('-' * 40)
    
    if rodrigo_encontrado_2:
        print('✅ RODRIGO existe na API')
        if cc_encontrado:
            print('✅ CEF NORTE OESTE BA existe na API')
            
            # Verificar associação
            costs_centers = rodrigo_encontrado_2.get('costsCenters', {})
            if isinstance(costs_centers, dict) and 'data' in costs_centers:
                cc_names = [cc.get('name') for cc in costs_centers['data']]
                if 'CEF NORTE OESTE BA' in cc_names:
                    print('✅ Associação confirmada - Visualizador está CORRETO')
                else:
                    print('❌ Associação não confirmada - Visualizador está INCORRETO')
                    print(f'   CCs do RODRIGO: {cc_names}')
        else:
            print('❌ CEF NORTE OESTE BA não existe na API')
    else:
        print('❌ RODRIGO não encontrado na API')

if __name__ == '__main__':
    debug_rodrigo_inconsistencia()
