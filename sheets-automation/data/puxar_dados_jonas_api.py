import requests
import json

def buscar_dados_completos_jonas():
    """Busca dados completos do JONAS na API VExpenses"""
    
    API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
    BASE_URL = "https://api.vexpenses.com/v2"
    
    headers = {
        'Authorization': API_KEY,
        'Accept': 'application/json'
    }
    
    print('🔍 BUSCANDO DADOS COMPLETOS DO JONAS NA API VEXPENSES')
    print('=' * 60)
    
    # Buscar todos os membros para encontrar o JONAS
    print('📡 Buscando team members...')
    response = requests.get(f"{BASE_URL}/team-members", headers=headers, params={
        'include': 'costsCenters,projects,role,company',
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
        print('❌ JONAS não encontrado na API')
        return
    
    print('✅ JONAS encontrado!')
    print()
    print('📋 DADOS COMPLETOS DO JONAS NA API:')
    print('-' * 40)
    
    # Exibir todos os campos disponíveis
    def exibir_campos(dados, prefixo=''):
        for key, value in dados.items():
            if isinstance(value, dict):
                print(f'{prefixo}{key}:')
                exibir_campos(value, prefixo + '  ')
            elif isinstance(value, list) and value:
                print(f'{prefixo}{key}: [{len(value)} itens]')
                for i, item in enumerate(value[:3]):  # Primeiros 3 itens
                    if isinstance(item, dict):
                        print(f'{prefixo}  Item {i+1}:')
                        exibir_campos(item, prefixo + '    ')
                    else:
                        print(f'{prefixo}  Item {i+1}: {item}')
                if len(value) > 3:
                    print(f'{prefixo}  ... mais {len(value)-3} itens')
            else:
                print(f'{prefixo}{key}: {value}')
    
    exibir_campos(jonas_data)
    
    # Salvar dados completos
    with open('jonas_api_completo.json', 'w', encoding='utf-8') as f:
        json.dump(jonas_data, f, ensure_ascii=False, indent=2)
    
    print()
    print('💾 Dados salvos em jonas_api_completo.json')
    return jonas_data

if __name__ == '__main__':
    buscar_dados_completos_jonas()
