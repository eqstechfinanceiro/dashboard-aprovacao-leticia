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
                
                if isinstance(data, dict):
                    print(f"  Chaves: {list(data.keys())}")
                    
                    # Procurar campos numéricos relevantes
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

def test_corporate_card_endpoints():
    """Testa endpoints relacionados a cartão corporativo"""
    print("TESTANDO ENDPOINTS DE CARTÃO CORPORATIVO")
    print("="*80)
    
    endpoints = [
        '/corporate-cards',
        '/corporate-card',
        '/cards/corporate',
        '/cards/limits',
        '/cards/balance',
        '/cards/available',
        '/cards/spending',
        '/cards/statements',
        '/cards/statement',
        '/credit-cards',
        '/credit-card',
        '/virtual-cards',
        '/virtual-card',
        '/card-limits',
        '/card-limit',
        '/card-balances',
        '/card-balance',
        '/spending-limits',
        '/spending-limit',
        '/expenses/statistics',
        '/expenses/summary',
        '/expenses/overview',
        '/expenses/by-user',
        '/expenses/by-payment-method'
    ]
    
    results = {}
    
    for endpoint in endpoints:
        data = test_endpoint(endpoint)
        if data:
            results[endpoint] = data
    
    return results

def main():
    """Função principal"""
    print("INVESTIGAÇÃO DE ENDPOINTS DE CARTÃO CORPORATIVO")
    print("="*80)
    
    results = test_corporate_card_endpoints()
    
    output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/corporate_card_endpoints.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n\nSalvo em: {output_file}")
    
    if results:
        print(f"\n✅ {len(results)} endpoints funcionaram")
    else:
        print("\n❌ Nenhum endpoint funcionou")
    
    print("\n" + "="*80)
    print("INVESTIGAÇÃO CONCLUÍDA!")
    print("="*80)

if __name__ == "__main__":
    main()
