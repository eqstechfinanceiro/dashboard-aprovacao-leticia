import requests
import json

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

def debug_expenses_api():
    """Debug para entender por que não está obtendo expenses anuais"""
    print("DEBUG - INVESTIGANDO PROBLEMA COM EXPENSES ANUAIS")
    print("="*60)
    
    # Testar diferentes períodos
    test_periods = [
        ("2026-01-01,2026-05-15", "Anual até maio"),
        ("2026-01-01,2026-12-31", "Anual completo"),
        ("2025-01-01,2025-12-31", "Ano 2025"),
        ("2026-04-01,2026-04-30", "Abril 2026"),
        ("2026-05-01,2026-05-15", "1ª quinzena maio")
    ]
    
    for period, description in test_periods:
        print(f"\nTestando período: {description}")
        print(f"Datas: {period}")
        
        try:
            url = f"{BASE_URL}/expenses"
            params = {
                "search": f"date:{period}",
                "searchFields": "date:between",
                "searchJoin": "and",
                "paginate": "true",
                "page": "1",
                "per_page": "10",  # Apenas 10 para teste
                "include": "user"
            }
            
            response = requests.get(url, headers=headers, params=params, timeout=30)
            
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                if 'data' in data:
                    expenses = data['data']
                    print(f"Expenses encontradas: {len(expenses)}")
                    
                    if expenses:
                        # Mostrar primeira expense
                        first_expense = expenses[0]
                        print(f"Exemplo - ID: {first_expense.get('id')}")
                        print(f"  Data: {first_expense.get('date')}")
                        print(f"  Valor: R$ {first_expense.get('value', 0):.2f}")
                        print(f"  Usuário: {first_expense.get('user', {}).get('name', 'Unknown')}")
                        
                        # Mostrar range de datas
                        dates = [exp.get('date') for exp in expenses if exp.get('date')]
                        if dates:
                            print(f"  Range de datas: {min(dates)} a {max(dates)}")
                    else:
                        print("  Nenhuma expense encontrada")
            else:
                print(f"Erro: {response.status_code}")
                print(f"Response: {response.text}")
                
        except Exception as e:
            print(f"Exceção: {e}")

def test_user_mapping():
    """Testa se os usuários mapeados existem nos dados"""
    print("\n\nTESTANDO MAPEAMENTO DE USUÁRIOS")
    print("="*60)
    
    # Usuários que esperamos encontrar
    target_users = {
        895945: 'JONAS CAVALCANTI',
        895946: 'RODRIGO CESAR',
        895947: 'CAIO FRANCESCONI'
    }
    
    try:
        url = f"{BASE_URL}/expenses"
        params = {
            "search": "date:2026-05-01,2026-05-15",
            "searchFields": "date:between",
            "searchJoin": "and",
            "paginate": "true",
            "page": "1",
            "per_page": "200",
            "include": "user"
        }
        
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                expenses = data['data']
                
                print(f"Total de expenses na quinzena: {len(expenses)}")
                
                # Procurar pelos usuários alvo
                found_users = {}
                
                for expense in expenses:
                    user_id = expense.get('user_id')
                    user_name = expense.get('user', {}).get('name', 'Unknown')
                    value = expense.get('value', 0)
                    
                    if user_id in target_users:
                        if user_id not in found_users:
                            found_users[user_id] = {
                                'name': user_name,
                                'total': 0,
                                'count': 0,
                                'expected_name': target_users[user_id]
                            }
                        
                        found_users[user_id]['total'] += value
                        found_users[user_id]['count'] += 1
                
                print(f"\nUsuários alvo encontrados:")
                for user_id, user_data in found_users.items():
                    print(f"  ID {user_id}: {user_data['name']}")
                    print(f"    Esperado: {user_data['expected_name']}")
                    print(f"    Total: R$ {user_data['total']:.2f}")
                    print(f"    Expenses: {user_data['count']}")
                
                # Mostrar todos os usuários encontrados
                all_users = {}
                for expense in expenses:
                    user_id = expense.get('user_id')
                    user_name = expense.get('user', {}).get('name', 'Unknown')
                    
                    if user_id not in all_users:
                        all_users[user_id] = user_name
                
                print(f"\nTotal de usuários únicos: {len(all_users)}")
                print("Primeiros 10 usuários:")
                for i, (user_id, user_name) in enumerate(list(all_users.items())[:10]):
                    print(f"  {i+1}. ID {user_id}: {user_name}")
                
    except Exception as e:
        print(f"Erro: {e}")

def main():
    """Função principal"""
    debug_expenses_api()
    test_user_mapping()

if __name__ == "__main__":
    main()
