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

def test_expenses_with_params(params_description, params):
    """Testa endpoint /expenses com parâmetros específicos"""
    print(f"\nTestando: {params_description}")
    print("="*60)
    
    try:
        url = f"{BASE_URL}/expenses"
        response = requests.get(url, headers=headers, params=params, timeout=30)
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            if 'data' in data:
                expenses = data['data']
                print(f"✅ Sucesso - {len(expenses)} expenses")
                
                # Se tiver poucos resultados, mostrar detalhes
                if len(expenses) <= 10:
                    for exp in expenses:
                        user = exp.get('user', {})
                        user_name = user.get('name', 'Unknown')
                        value = exp.get('value', 0)
                        pm = exp.get('payment_method', {})
                        pm_name = pm.get('name', 'Unknown')
                        
                        print(f"  {user_name}: R$ {value:.2f} ({pm_name})")
                
                return expenses
            else:
                print(f"Resposta: {data}")
        else:
            print(f"Erro: {response.status_code}")
            try:
                print(f"Detalhes: {response.json()}")
            except:
                pass
        
        return None
        
    except Exception as e:
        print(f"Exceção: {e}")
        return None

def main():
    """Função principal"""
    print("TESTANDO /expenses COM PARÂMETROS DE AGREGAÇÃO")
    print("="*80)
    
    # Testar diferentes combinações de parâmetros
    test_cases = [
        ("Group by user", {
            "search": "date:2026-01-01,2026-04-30",
            "searchFields": "date:between",
            "searchJoin": "and",
            "paginate": "true",
            "page": "1",
            "per_page": "50",
            "include": "user,payment_method",
            "group_by": "user"
        }),
        ("Summary by user", {
            "search": "date:2026-01-01,2026-04-30",
            "searchFields": "date:between",
            "searchJoin": "and",
            "paginate": "true",
            "page": "1",
            "per_page": "50",
            "include": "user,payment_method",
            "summary": "true"
        }),
        ("Aggregate by user", {
            "search": "date:2026-01-01,2026-04-30",
            "searchFields": "date:between",
            "searchJoin": "and",
            "paginate": "true",
            "page": "1",
            "per_page": "50",
            "include": "user,payment_method",
            "aggregate": "user"
        }),
        ("Com payment method filter", {
            "search": "date:2026-01-01,2026-04-30;payment_method.name:Cartão",
            "searchFields": "date:between;payment_method.name:like",
            "searchJoin": "and",
            "paginate": "true",
            "page": "1",
            "per_page": "50",
            "include": "user,payment_method"
        }),
        ("Sem paginate (todos)", {
            "search": "date:2026-01-01,2026-04-30",
            "searchFields": "date:between",
            "searchJoin": "and",
            "paginate": "false",
            "include": "user,payment_method"
        })
    ]
    
    results = {}
    
    for description, params in test_cases:
        expenses = test_expenses_with_params(description, params)
        
        if expenses:
            results[description] = {
                'params': params,
                'count': len(expenses),
                'success': True
            }
    
    # Salvar resultados
    output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/expenses_aggregation_tests.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n\nSalvo em: {output_file}")
    
    print("\n" + "="*80)
    print("TESTES CONCLUÍDOS!")
    print("="*80)

if __name__ == "__main__":
    main()
