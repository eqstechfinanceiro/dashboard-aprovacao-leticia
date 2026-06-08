import json
import requests
import time

# Configuração da API
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

def get_team_members():
    """Busca todos os team members da API"""
    headers = {
        'Authorization': API_KEY,
        'Accept': 'application/json'
    }
    
    all_members = []
    page = 1
    
    while True:
        try:
            params = {
                'include': 'costsCenters,projects',
                'paginate': 'true',
                'page': str(page),
                'per_page': '100'
            }
            
            response = requests.get(f"{BASE_URL}/team-members", headers=headers, params=params)
            
            if response.status_code == 200:
                data = response.json()
                members = data.get('data', [])
                
                if not members:
                    break
                    
                all_members.extend(members)
                print(f"📄 Página {page}: {len(members)} membros")
                page += 1
                
                # Pequena pausa para não sobrecarregar a API
                time.sleep(0.1)
                
            else:
                print(f"❌ Erro na página {page}: {response.status_code}")
                break
                
        except Exception as e:
            print(f"❌ Erro ao buscar página {page}: {e}")
            break
    
    print(f"✅ Total de {len(all_members)} membros carregados")
    return all_members

def validar_planilha_com_api():
    """Valida os colaboradores da planilha com os dados da API"""
    
    print("🔍 VALIDANDO COLABORADORES DA PLANILHA COM API VEXPENSES")
    print("=" * 60)
    
    # Carregar dados da planilha
    with open('converted/carga_maio_2026.json', 'r', encoding='utf-8') as f:
        dados_planilha = json.load(f)
    
    planilha = dados_planilha['Planilha1']
    
    # Buscar todos os membros da API
    print("\n📡 Buscando dados da API...")
    api_members = get_team_members()
    
    # Criar mapa de CPF -> dados API
    api_map = {}
    for member in api_members:
        if member.get('cpf'):
            api_map[member['cpf']] = member
    
    # Validar cada linha da planilha
    resultados = []
    
    print("\n🔍 Validando colaboradores...")
    
    for i, linha in enumerate(planilha):
        if not linha or len(linha) < 2:  # Pular linhas vazias
            continue
            
        nome_planilha = linha[0] if len(linha) > 0 else ""
        cpf_planilha = linha[1] if len(linha) > 1 else ""
        
        if not nome_planilha or not cpf_planilha:
            continue
        
        # Provar na API
        cpf_limpo = cpf_planilha.replace('.', '').replace('-', '').replace('/', '').strip()
        
        encontrado = False
        dados_api = None
        
        if cpf_limpo in api_map:
            encontrado = True
            dados_api = api_map[cpf_limpo]
        else:
            # Tentar busca por nome
            for member in api_members:
                if member.get('name') and member['name'].upper() == nome_planilha.upper():
                    encontrado = True
                    dados_api = member
                    break
        
        # Preparar resultado
        resultado = {
            'linha': i + 1,
            'nome_planilha': nome_planilha,
            'cpf_planilha': cpf_planilha,
            'encontrado_api': encontrado,
            'dados_api': dados_api,
            'cor': 'green' if encontrado else 'red'
        }
        
        if encontrado:
            print(f"✅ Linha {i+1}: {nome_planilha} - ENCONTRADO na API")
        else:
            print(f"❌ Linha {i+1}: {nome_planilha} - NÃO encontrado na API")
        
        resultados.append(resultado)
    
    # Estatísticas
    total = len(resultados)
    encontrados = sum(1 for r in resultados if r['encontrado_api'])
    nao_encontrados = total - encontrados
    
    print(f"\n📊 ESTATÍSTICAS:")
    print(f"   Total de colaboradores: {total}")
    print(f"   Encontrados na API: {encontrados} ({encontrados/total*100:.1f}%)")
    print(f"   Não encontrados: {nao_encontrados} ({nao_encontrados/total*100:.1f}%)")
    
    # Salvar resultados
    resultado_final = {
        'estatisticas': {
            'total': total,
            'encontrados': encontrados,
            'nao_encontrados': nao_encontrados,
            'percentual_encontrados': encontrados/total*100
        },
        'mapeamento_colunas': {
            'coluna_1': 'Colaborador (name)',
            'coluna_2': 'CPF (cpf)', 
            'coluna_3': 'Status (active)',
            'endpoint_api': '/v2/team-members',
            'metodo_busca': 'CPF + nome'
        },
        'validacoes': resultados
    }
    
    with open('validacao_colaboradores.json', 'w', encoding='utf-8') as f:
        json.dump(resultado_final, f, ensure_ascii=False, indent=2)
    
    print(f"\n💾 Resultados salvos em validacao_colaboradores.json")
    
    return resultado_final

if __name__ == "__main__":
    validar_planilha_com_api()
