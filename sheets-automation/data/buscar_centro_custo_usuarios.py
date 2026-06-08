import requests
import json

def buscar_centro_custo_usuarios():
    """Buscar centro de custo de 10 usuários via API"""
    
    API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
    BASE_URL = "https://api.vexpenses.com/v2"
    
    headers = {
        'Authorization': API_KEY,
        'Accept': 'application/json'
    }
    
    print('🏢 BUSCANDO CENTRO DE CUSTO DE 10 USUÁRIOS')
    print('=' * 50)
    
    # 1. Buscar todos os usuários com costs centers
    print('📡 1. Buscando usuários com costs centers...')
    
    response = requests.get(f"{BASE_URL}/team-members", headers=headers, params={
        'include': 'costsCenters',
        'paginate': 'false'
    })
    
    if response.status_code != 200:
        print(f'❌ Erro: {response.status_code}')
        return
    
    users = response.json().get('data', [])
    print(f'✅ Encontrados {len(users)} usuários')
    
    # 2. Filtrar usuários que têm costs centers
    usuarios_com_cc = []
    for user in users:
        costs_centers = user.get('costsCenters', {})
        if isinstance(costs_centers, dict) and 'data' in costs_centers:
            if costs_centers['data']:  # Se tem pelo menos 1 cost center
                usuarios_com_cc.append(user)
    
    print(f'✅ {len(usuarios_com_cc)} usuários com centro de custo')
    print()
    
    # 3. Mostrar os primeiros 10 usuários com seus costs centers
    print('📋 3. Primeiros 10 usuários com centro de custo:')
    print('-' * 60)
    
    for i, user in enumerate(usuarios_com_cc[:10]):
        print(f'\n{i+1}. {user["name"]}')
        print(f'   CPF: {user.get("cpf", "N/A")}')
        print(f'   Email: {user.get("email", "N/A")}')
        print(f'   ID: {user["id"]}')
        
        # Mostrar costs centers
        costs_centers = user.get('costsCenters', {})
        if isinstance(costs_centers, dict) and 'data' in costs_centers:
            print(f'   Centro(s) de Custo ({len(costs_centers["data"])}):')
            for cc in costs_centers['data']:
                print(f'     - {cc.get("name")} (ID: {cc.get("id")})')
                print(f'       External Code: {cc.get("external_code")}')
                print(f'       Integration ID: {cc.get("integration_id")}')
        else:
            print('   ❌ Sem centro de custo')
    
    # 4. Buscar usuários específicos da planilha
    print()
    print('🔍 4. Usuários específicos da planilha:')
    print('-' * 40)
    
    usuarios_planilha = [
        'JONAS CAVALCANTI DE OLIVEIRA',
        'RODRIGO CESAR DOS SANTOS', 
        'CAIO FRANCESCONI RIBEIRO',
        'MARCO AURELIO DE ANDRADE MORAES',
        'ALESSANDRO RODRIGO PASTRELLI'
    ]
    
    for nome_planilha in usuarios_planilha:
        print(f'\n🔍 Buscando: {nome_planilha}')
        
        # Buscar usuário por nome
        user_encontrado = None
        for user in users:
            if user.get('name', '').upper() == nome_planilha.upper():
                user_encontrado = user
                break
        
        if user_encontrado:
            print(f'   ✅ Encontrado: ID {user_encontrado["id"]}')
            
            # Mostrar costs centers
            costs_centers = user_encontrado.get('costsCenters', {})
            if isinstance(costs_centers, dict) and 'data' in costs_centers:
                print(f'   Centro(s) de Custo ({len(costs_centers["data"])}):')
                for cc in costs_centers['data']:
                    print(f'     - {cc.get("name")} (ID: {cc.get("id")})')
            else:
                print('   ❌ Sem centro de custo associado')
        else:
            print('   ❌ Não encontrado')
    
    # 5. Salvar resultados
    print()
    print('💾 5. Salvando resultados...')
    
    resultado = {
        'total_usuarios': len(users),
        'usuarios_com_cc': len(usuarios_com_cc),
        'primeiros_10': usuarios_com_cc[:10],
        'usuarios_planilha': []
    }
    
    for nome_planilha in usuarios_planilha:
        for user in users:
            if user.get('name', '').upper() == nome_planilha.upper():
                resultado['usuarios_planilha'].append({
                    'nome': user['name'],
                    'id': user['id'],
                    'costs_centers': user.get('costsCenters', {}).get('data', [])
                })
                break
    
    with open('centro_custo_usuarios.json', 'w', encoding='utf-8') as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)
    
    print('✅ Resultados salvos em centro_custo_usuarios.json')
    
    # 6. Estatísticas
    print()
    print('📊 6. Estatísticas:')
    print('-' * 30)
    print(f'Total usuários: {len(users)}')
    print(f'Com centro de custo: {len(usuarios_com_cc)}')
    print(f'Sem centro de custo: {len(users) - len(usuarios_com_cc)}')
    print(f'Percentual com CC: {(len(usuarios_com_cc)/len(users)*100):.1f}%')

if __name__ == '__main__':
    buscar_centro_custo_usuarios()
