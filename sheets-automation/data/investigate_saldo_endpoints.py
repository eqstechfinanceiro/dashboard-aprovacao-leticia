import requests
import json
from datetime import datetime

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

def test_endpoint(endpoint_path):
    """Testa um endpoint específico"""
    try:
        url = f"{BASE_URL}{endpoint_path}"
        response = requests.get(url, headers=headers, timeout=30)
        
        print(f"\n{endpoint_path}:")
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            try:
                data = response.json()
                print(f"  ✅ Sucesso")
                
                # Mostrar estrutura
                if isinstance(data, dict):
                    print(f"  Chaves: {list(data.keys())}")
                    
                    # Procurar campos numéricos
                    for key, value in data.items():
                        if isinstance(value, (int, float)) and abs(value) > 10:
                            print(f"    {key}: R$ {value:.2f}")
                
                return data
            except:
                print(f"  Resposta não é JSON")
                return None
        elif response.status_code == 404:
            print(f"  ❌ Não encontrado")
        elif response.status_code == 401:
            print(f"  ❌ Não autorizado")
        elif response.status_code == 403:
            print(f"  ❌ Proibido")
        else:
            print(f"  ❌ Erro: {response.status_code}")
        
        return None
        
    except Exception as e:
        print(f"  ❌ Exceção: {e}")
        return None

def test_all_saldo_related_endpoints():
    """Testa todos os endpoints relacionados a saldo"""
    print("TESTANDO ENDPOINTS RELACIONADOS A SALDO")
    print("="*80)
    
    # Endpoints possíveis para saldos/limites
    endpoints = [
        '/balances',
        '/balance',
        '/limits',
        '/limit',
        '/cards',
        '/card',
        '/wallets',
        '/wallet',
        '/accounts',
        '/account',
        '/advances',
        '/advance',
        '/reimbursements',
        '/reimbursement',
        '/payment-methods',
        '/payment-method',
        '/team-members',
        '/team-member',
        '/users',
        '/user',
        '/financial',
        '/finances',
        '/budgets',
        '/budget',
        '/statistics',
        '/stats',
        '/summary',
        '/overview'
    ]
    
    results = {}
    
    for endpoint in endpoints:
        data = test_endpoint(endpoint)
        if data:
            results[endpoint] = data
    
    return results

def test_team_member_details():
    """Testa detalhes de team members"""
    print(f"\nTESTANDO DETALHES DE TEAM MEMBERS")
    print("="*60)
    
    try:
        url = f"{BASE_URL}/team-members"
        response = requests.get(url, headers=headers, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                members = data['data']
                print(f"Total de members: {len(members)}")
                
                # Analisar primeiro membro
                if members:
                    first_member = members[0]
                    print(f"\nPrimeiro membro:")
                    print(f"  ID: {first_member.get('id')}")
                    print(f"  Nome: {first_member.get('name')}")
                    print(f"  Campos: {list(first_member.keys())}")
                    
                    # Procurar campos de saldo
                    for key, value in first_member.items():
                        if isinstance(value, (int, float)) and abs(value) > 10:
                            print(f"    {key}: R$ {value:.2f}")
                    
                    # Tentar acessar detalhes específicos
                    member_id = first_member.get('id')
                    if member_id:
                        detail_url = f"{BASE_URL}/team-members/{member_id}"
                        detail_response = requests.get(detail_url, headers=headers, timeout=30)
                        
                        if detail_response.status_code == 200:
                            detail_data = detail_response.json()
                            print(f"\nDetalhes do membro {member_id}:")
                            print(f"  Campos: {list(detail_data.keys())}")
                            
                            for key, value in detail_data.items():
                                if isinstance(value, (int, float)) and abs(value) > 10:
                                    print(f"    {key}: R$ {value:.2f}")
                
                return members
    except Exception as e:
        print(f"Erro: {e}")
    
    return []

def test_payment_method_details():
    """Testa detalhes de métodos de pagamento"""
    print(f"\nTESTANDO DETALHES DE MÉTODOS DE PAGAMENTO")
    print("="*60)
    
    try:
        url = f"{BASE_URL}/payment-methods"
        response = requests.get(url, headers=headers, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                methods = data['data']
                print(f"Total de métodos: {len(methods)}")
                
                # Analisar métodos
                for method in methods[:10]:
                    method_id = method.get('id')
                    name = method.get('name', '')
                    print(f"\n{name} (ID: {method_id}):")
                    print(f"  Campos: {list(method.keys())}")
                    
                    for key, value in method.items():
                        if isinstance(value, (int, float)) and abs(value) > 10:
                            print(f"    {key}: R$ {value:.2f}")
                
                return methods
    except Exception as e:
        print(f"Erro: {e}")
    
    return []

def main():
    """Função principal"""
    print("INVESTIGAÇÃO DE ENDPOINTS DE SALDO")
    print("="*80)
    
    # 1. Testar endpoints relacionados a saldo
    endpoint_results = test_all_saldo_related_endpoints()
    
    # 2. Testar detalhes de team members
    team_members = test_team_member_details()
    
    # 3. Testar detalhes de payment methods
    payment_methods = test_payment_method_details()
    
    # 4. Salvar resultados
    results = {
        'investigation_date': datetime.now().isoformat(),
        'endpoint_results': endpoint_results,
        'team_members_count': len(team_members) if team_members else 0,
        'payment_methods_count': len(payment_methods) if payment_methods else 0,
        'conclusion': ''
    }
    
    if endpoint_results:
        results['conclusion'] = f'ENDPOINTS FUNCIONAIS ENCONTRADOS: {list(endpoint_results.keys())}'
    else:
        results['conclusion'] = 'NENHUM ENDPOINT DE SALDO ENCONTRADO'
    
    output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/saldo_endpoints.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n\nSalvo em: {output_file}")
    
    print("\n" + "="*80)
    print("INVESTIGAÇÃO CONCLUÍDA!")
    print("="*80)

if __name__ == "__main__":
    main()
