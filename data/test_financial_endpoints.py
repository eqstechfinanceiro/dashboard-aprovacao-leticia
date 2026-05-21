import json
import requests
from datetime import datetime
import time

# Configuração da API (baseado nos arquivos existentes)
API_BASE = "https://api.vexpenses.com/v2"
HEADERS = {
    "Content-Type": "application/json",
    # Adicionar headers de autenticação se necessário
}

def test_endpoint(endpoint, params=None, description=""):
    """Testa um endpoint da API e retorna os resultados"""
    print(f"\n{'='*60}")
    print(f"TESTANDO: {endpoint}")
    if description:
        print(f"Descrição: {description}")
    print(f"{'='*60}")
    
    try:
        url = f"{API_BASE}{endpoint}"
        response = requests.get(url, headers=HEADERS, params=params)
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            if isinstance(data, dict):
                print(f"Campos: {list(data.keys())}")
                if 'data' in data:
                    print(f"Total de registros: {len(data['data']) if isinstance(data['data'], list) else 'N/A'}")
                elif 'results' in data:
                    print(f"Total de registros: {len(data['results']) if isinstance(data['results'], list) else 'N/A'}")
                else:
                    print(f"Tipo de dado: {type(data)}")
                    if isinstance(data, list):
                        print(f"Total de registros: {len(data)}")
                        if data:
                            print(f"Campos do primeiro item: {list(data[0].keys()) if isinstance(data[0], dict) else 'N/A'}")
            else:
                print(f"Tipo de dado: {type(data)}")
                if isinstance(data, list) and data:
                    print(f"Total de registros: {len(data)}")
                    print(f"Campos do primeiro item: {list(data[0].keys()) if isinstance(data[0], dict) else 'N/A'}")
            
            return data
        else:
            print(f"Erro: {response.text}")
            return None
            
    except Exception as e:
        print(f"Exceção: {e}")
        return None

def investigate_expenses_endpoints():
    """Investiga endpoints relacionados a expenses"""
    print("\n" + "="*80)
    print("INVESTIGANDO ENDPOINTS DE EXPENSES")
    print("="*80)
    
    # Testar diferentes endpoints de expenses
    endpoints_to_test = [
        ("/expenses", "Lista de despesas"),
        ("/expenses?paginate=false", "Despesas sem paginação"),
        ("/expenses?limit=10", "Primeiras 10 despesas"),
        ("/expenses?user_id=895944", "Despesas de um usuário específico"),
        ("/expenses?date_from=2026-04-01&date_to=2026-04-15", "Despesas da 1ª quinzena de abril"),
        ("/expenses?date_from=2026-04-16&date_to=2026-04-30", "Despesas da 2ª quinzena de abril"),
        ("/expenses?on=true", "Despesas ativas"),
        ("/expenses?reimbursable=true", "Despesas reembolsáveis"),
    ]
    
    results = {}
    
    for endpoint, description in endpoints_to_test:
        result = test_endpoint(endpoint, description=description)
        if result:
            results[endpoint] = result
        
        time.sleep(0.5)  # Rate limiting
    
    return results

def investigate_financial_endpoints():
    """Investiga endpoints que podem conter dados financeiros"""
    print("\n" + "="*80)
    print("INVESTIGANDO ENDPOINTS FINANCEIROS")
    print("="*80)
    
    # Testar endpoints financeiros potenciais
    financial_endpoints = [
        ("/advances", "Adiantamentos"),
        ("/advances?paginate=false", "Adiantamentos sem paginação"),
        ("/advances?user_id=895944", "Adiantamentos de um usuário"),
        ("/payment-methods", "Métodos de pagamento"),
        ("/payment-methods?paginate=false", "Métodos de pagamento sem paginação"),
        ("/cards", "Cartões"),
        ("/cards?paginate=false", "Cartões sem paginação"),
        ("/balances", "Saldos"),
        ("/balances?user_id=895944", "Saldos de um usuário"),
        ("/transactions", "Transações"),
        ("/transactions?paginate=false", "Transações sem paginação"),
        ("/transactions?user_id=895944", "Transações de um usuário"),
        ("/reports/895944/expenses", "Despesas de um relatório específico"),
        ("/reports/7603397/expenses", "Despesas de um relatório específico"),
        ("/users/895944/balance", "Saldo de um usuário"),
        ("/users/895944/advances", "Adiantamentos de um usuário"),
        ("/users/895944/transactions", "Transações de um usuário"),
    ]
    
    results = {}
    
    for endpoint, description in financial_endpoints:
        result = test_endpoint(endpoint, description=description)
        if result:
            results[endpoint] = result
        
        time.sleep(0.5)  # Rate limiting
    
    return results

def investigate_team_members_endpoint():
    """Investiga endpoint de team members para obter dados completos"""
    print("\n" + "="*80)
    print("INVESTIGANDO TEAM MEMBERS")
    print("="*80)
    
    # Testar diferentes variações de team members
    team_endpoints = [
        ("/team-members", "Membros da equipe"),
        ("/team-members?paginate=false", "Membros sem paginação"),
        ("/team-members/895944", "Membro específico"),
        ("/team-members/895944/expenses", "Despesas do membro"),
        ("/team-members/895944/reports", "Relatórios do membro"),
        ("/team-members/895944/advances", "Adiantamentos do membro"),
        ("/team-members/895944/balance", "Saldo do membro"),
    ]
    
    results = {}
    
    for endpoint, description in team_endpoints:
        result = test_endpoint(endpoint, description=description)
        if result:
            results[endpoint] = result
        
        time.sleep(0.5)  # Rate limiting
    
    return results

def analyze_expenses_with_details():
    """Analisa expenses em detalhe para encontrar campos financeiros"""
    print("\n" + "="*80)
    print("ANALISANDO EXPENSES COM DETALHES")
    print("="*80)
    
    # Primeiro, tentar obter expenses
    expenses_result = test_endpoint("/expenses?limit=5", "Primeiras 5 despesas")
    
    if expenses_result:
        print("\nAnalisando estrutura das expenses:")
        
        if isinstance(expenses_result, dict) and 'data' in expenses_result:
            expenses = expenses_result['data']
        elif isinstance(expenses_result, list):
            expenses = expenses_result
        else:
            expenses = [expenses_result]
        
        if expenses and len(expenses) > 0:
            sample_expense = expenses[0]
            print(f"Campos da expense: {list(sample_expense.keys())}")
            
            # Procurar por campos financeiros
            financial_fields = []
            for key, value in sample_expense.items():
                if isinstance(value, (int, float)):
                    field_name_lower = key.lower()
                    if any(keyword in field_name_lower for keyword in ['value', 'amount', 'balance', 'total']):
                        financial_fields.append((key, value))
            
            print(f"Campos financeiros encontrados: {financial_fields}")
            
            # Analisar todas as expenses
            all_financial_data = []
            for expense in expenses:
                financial_data = {}
                for key, value in expense.items():
                    if isinstance(value, (int, float)):
                        financial_data[key] = value
                if financial_data:
                    all_financial_data.append(financial_data)
            
            print(f"\nDados financeiros de todas as expenses:")
            for i, data in enumerate(all_financial_data):
                print(f"  Expense {i+1}: {data}")
    
    return expenses_result

def main():
    """Função principal de investigação de endpoints"""
    print("INVESTIGANDO ENDPOINTS DA API VEXPENSES")
    print("="*80)
    print("Procurando por dados financeiros e campos de saldo...")
    
    # Testar diferentes tipos de endpoints
    expenses_results = investigate_expenses_endpoints()
    financial_results = investigate_financial_endpoints()
    team_results = investigate_team_members_endpoint()
    detailed_expenses = analyze_expenses_with_details()
    
    # Salvar resultados
    investigation_results = {
        'investigation_date': datetime.now().isoformat(),
        'expenses_endpoints': expenses_results,
        'financial_endpoints': financial_results,
        'team_members_endpoints': team_results,
        'detailed_expenses_analysis': detailed_expenses
    }
    
    output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/api_endpoints_investigation.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(investigation_results, f, ensure_ascii=False, indent=2)
    
    print(f"\n\nInvestigação salva em: {output_file}")
    print("\n" + "="*80)
    print("INVESTIGAÇÃO DE ENDPOINTS CONCLUÍDA!")
    print("="*80)

if __name__ == "__main__":
    main()
