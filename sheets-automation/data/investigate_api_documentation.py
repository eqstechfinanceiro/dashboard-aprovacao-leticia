import requests
import json
from datetime import datetime

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json"
}

def discover_api_endpoints():
    """Descobre endpoints disponíveis na API"""
    print("DESCOBRINDO ENDPOINTS DA API")
    print("="*80)
    
    # Tentar endpoint raiz
    try:
        response = requests.get(BASE_URL, headers=headers)
        print(f"Status endpoint raiz: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Resposta raiz: {data}")
        else:
            print(f"Erro raiz: {response.text}")
    except Exception as e:
        print(f"Exceção raiz: {e}")
    
    # Tentar endpoint de documentação
    doc_endpoints = [
        "/docs",
        "/documentation", 
        "/api",
        "/endpoints",
        "/swagger",
        "/openapi"
    ]
    
    for endpoint in doc_endpoints:
        try:
            url = f"{BASE_URL}{endpoint}"
            response = requests.get(url, headers=headers)
            print(f"{endpoint}: {response.status_code}")
            
            if response.status_code == 200:
                print(f"  ✅ Documentação encontrada em {endpoint}")
                return endpoint
        except Exception as e:
            print(f"  ❌ {endpoint}: {e}")
    
    return None

def test_expenses_with_all_possible_filters():
    """Testa expenses com todos os filtros possíveis"""
    print("\nTESTANDO EXPENSES COM TODOS OS FILTROS POSSÍVEIS")
    print("="*80)
    
    # Baseado na documentação típica de APIs REST
    possible_filters = [
        # Filtros básicos
        {"user_id": 890792},
        {"report_id": 7603397},
        {"team_member_id": 890792},
        {"member_id": 890792},
        
        # Filtros de data
        {"date": "2026-04-15"},
        {"date_from": "2026-04-01"},
        {"date_to": "2026-04-30"},
        {"created_at": "2026-04-15"},
        {"updated_at": "2026-04-15"},
        
        # Filtros de status
        {"status": "APPROVED"},
        {"on": "true"},
        {"on": True},
        {"reimbursable": "true"},
        {"reimbursable": True},
        
        # Filtros de paginação
        {"page": 1},
        {"limit": 10},
        {"per_page": 10},
        {"offset": 0},
        
        # Combinações
        {"user_id": 890792, "limit": 10},
        {"date_from": "2026-04-01", "date_to": "2026-04-30", "limit": 10},
        {"user_id": 890792, "date_from": "2026-04-01", "limit": 10},
        {"status": "APPROVED", "limit": 10},
        {"on": True, "limit": 10},
        {"reimbursable": True, "limit": 10},
        
        # Filtros com nomes alternativos
        {"userId": 890792},
        {"reportId": 7603397},
        {"startDate": "2026-04-01"},
        {"endDate": "2026-04-30"},
        {"from": "2026-04-01"},
        {"to": "2026-04-30"},
        
        # Filtros sem paginação (formas alternativas)
        {"user_id": 890792, "all": "true"},
        {"user_id": 890792, "all": True},
        {"user_id": 890792, "no_pagination": "true"},
        {"user_id": 890792, "no_pagination": True},
    ]
    
    successful_filters = []
    
    for i, filters in enumerate(possible_filters):
        print(f"\nTestando {i+1}/{len(possible_filters)}: {filters}")
        
        try:
            url = f"{BASE_URL}/expenses"
            response = requests.get(url, headers=headers, params=filters)
            
            if response.status_code == 200:
                data = response.json()
                print(f"  ✅ SUCESSO! Tipo: {type(data)}")
                
                if isinstance(data, dict):
                    print(f"    Campos: {list(data.keys())}")
                    
                    if 'data' in data and isinstance(data['data'], list):
                        expenses = data['data']
                        print(f"    Expenses: {len(expenses)}")
                        
                        if expenses:
                            sample_expense = expenses[0]
                            print(f"    Campos da expense: {list(sample_expense.keys())}")
                            
                            # Procurar campos financeiros
                            financial_fields = []
                            for key, value in sample_expense.items():
                                if isinstance(value, (int, float)) and value > 0:
                                    field_name_lower = key.lower()
                                    if any(keyword in field_name_lower for keyword in ['value', 'amount', 'total']):
                                        financial_fields.append((key, value))
                            
                            print(f"    Campos financeiros: {financial_fields}")
                            
                            successful_filters.append({
                                'filters': filters,
                                'total_expenses': len(expenses),
                                'financial_fields': financial_fields,
                                'sample_expense': sample_expense
                            })
                            
                            # Se encontramos expenses com campos financeiros, podemos parar
                            if financial_fields:
                                print(f"  🎯 ENCONTRADO PADRÃO FINANCEIRO!")
                                return successful_filters
                
                elif isinstance(data, list):
                    print(f"    Lista com {len(data)} itens")
                    if data:
                        sample = data[0]
                        print(f"    Campos do item: {list(sample.keys())}")
                        successful_filters.append({
                            'filters': filters,
                            'total_items': len(data),
                            'sample_item': sample
                        })
                
            elif response.status_code == 422:
                # Erro de validação - mostrar detalhes
                error_data = response.json()
                print(f"  ❌ Erro 422: {error_data.get('message', 'Unknown')}")
                if 'data' in error_data and 'errors' in error_data['data']:
                    print(f"    Erros de campo: {error_data['data']['errors']}")
            else:
                print(f"  ❌ Erro {response.status_code}: {response.text[:100]}")
                
        except Exception as e:
            print(f"  ❌ Exceção: {e}")
    
    return successful_filters

def investigate_team_member_details():
    """Investiga detalhes de team members que possam ter dados financeiros"""
    print("\nINVESTIGANDO DETALHES DE TEAM MEMBERS")
    print("="*80)
    
    # Obter um team member
    try:
        url = f"{BASE_URL}/team-members"
        params = {"per_page": 5}
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code != 200:
            print(f"Erro ao obter team members: {response.status_code}")
            return
        
        data = response.json()
        if 'data' not in data:
            print("Sem campo 'data'")
            return
        
        team_members = data['data']
        print(f"Team members obtidos: {len(team_members)}")
        
        for member in team_members:
            user_id = member['id']
            user_name = member.get('name', 'Unknown')
            
            print(f"\nInvestigando usuário {user_id} - {user_name}")
            
            # Tentar diferentes endpoints para este usuário
            user_endpoints = [
                f"/team-members/{user_id}",
                f"/team-members/{user_id}/expenses",
                f"/team-members/{user_id}/reports",
                f"/team-members/{user_id}/advances",
                f"/team-members/{user_id}/balance",
                f"/team-members/{user_id}/limits",
                f"/team-members/{user_id}/cards",
                f"/team-members/{user_id}/transactions",
                f"/users/{user_id}",
                f"/users/{user_id}/expenses",
                f"/users/{user_id}/reports",
                f"/users/{user_id}/advances",
                f"/users/{user_id}/balance",
                f"/users/{user_id}/limits",
                f"/users/{user_id}/cards",
                f"/users/{user_id}/transactions",
            ]
            
            for endpoint in user_endpoints:
                try:
                    url = f"{BASE_URL}{endpoint}"
                    response = requests.get(url, headers=headers)
                    
                    if response.status_code == 200:
                        endpoint_data = response.json()
                        print(f"  ✅ {endpoint}: {type(endpoint_data)}")
                        
                        if isinstance(endpoint_data, dict):
                            print(f"    Campos: {list(endpoint_data.keys())}")
                            
                            # Procurar campos financeiros
                            financial_fields = []
                            for key, value in endpoint_data.items():
                                if isinstance(value, (int, float)):
                                    field_name_lower = key.lower()
                                    if any(keyword in field_name_lower for keyword in ['value', 'amount', 'total', 'balance', 'limit']):
                                        financial_fields.append((key, value))
                            
                            if financial_fields:
                                print(f"    🎯 Campos financeiros: {financial_fields}")
                        
                        elif isinstance(endpoint_data, list):
                            print(f"    Lista com {len(endpoint_data)} itens")
                            if endpoint_data:
                                sample = endpoint_data[0]
                                print(f"    Campos do item: {list(sample.keys())}")
                    
                    elif response.status_code != 404:
                        print(f"  ❌ {endpoint}: {response.status_code}")
                        
                except Exception as e:
                    print(f"  ❌ {endpoint}: {e}")
            
            # Limitar a 3 usuários para não sobrecarregar
            if team_members.index(member) >= 2:
                break
    
    except Exception as e:
        print(f"Exceção: {e}")

def test_report_expenses_relationship():
    """Testa diferentes formas de obter expenses de reports"""
    print("\nTESTANDO RELACIONAMENTO REPORT-EXPENSES")
    print("="*80)
    
    # Obter alguns reports
    try:
        url = f"{BASE_URL}/reports"
        params = {"per_page": 10}
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code != 200:
            print(f"Erro ao obter reports: {response.status_code}")
            return
        
        data = response.json()
        if 'data' not in data:
            print("Sem campo 'data'")
            return
        
        reports = data['data']
        print(f"Reports obtidos: {len(reports)}")
        
        # Para cada report, tentar obter expenses
        for i, report in enumerate(reports[:5]):
            report_id = report['id']
            description = report.get('description', 'Sem descrição')
            
            print(f"\nReport {i+1}: {report_id} - {description}")
            
            # Tentar diferentes endpoints
            expense_endpoints = [
                f"/reports/{report_id}/expenses",
                f"/reports/{report_id}/expense",
                f"/reports/{report_id}/items",
                f"/reports/{report_id}/details",
                f"/expenses?report_id={report_id}",
                f"/expenses?report={report_id}",
                f"/expenses?reportId={report_id}",
            ]
            
            for endpoint in expense_endpoints:
                try:
                    url = f"{BASE_URL}{endpoint}"
                    response = requests.get(url, headers=headers)
                    
                    if response.status_code == 200:
                        expenses_data = response.json()
                        print(f"  ✅ {endpoint}: {type(expenses_data)}")
                        
                        if isinstance(expenses_data, dict):
                            print(f"    Campos: {list(expenses_data.keys())}")
                            
                            if 'data' in expenses_data and isinstance(expenses_data['data'], list):
                                expenses = expenses_data['data']
                                print(f"    Expenses: {len(expenses)}")
                                
                                if expenses:
                                    sample_expense = expenses[0]
                                    print(f"    Campos da expense: {list(sample_expense.keys())}")
                                    
                                    # Procurar campos financeiros
                                    financial_fields = []
                                    for key, value in sample_expense.items():
                                        if isinstance(value, (int, float)) and value > 0:
                                            field_name_lower = key.lower()
                                            if any(keyword in field_name_lower for keyword in ['value', 'amount', 'total']):
                                                financial_fields.append((key, value))
                                    
                                    if financial_fields:
                                        print(f"    🎯 Campos financeiros: {financial_fields}")
                                        return endpoint  # Retornar primeiro sucesso
                        
                        elif isinstance(expenses_data, list):
                            print(f"    Lista com {len(expenses_data)} itens")
                            if expenses_data:
                                sample = expenses_data[0]
                                print(f"    Campos do item: {list(sample.keys())}")
                    
                    elif response.status_code != 404:
                        print(f"  ❌ {endpoint}: {response.status_code}")
                        
                except Exception as e:
                    print(f"  ❌ {endpoint}: {e}")
    
    except Exception as e:
        print(f"Exceção: {e}")

def main():
    """Função principal"""
    print("INVESTIGAÇÃO COMPLETA DA API VEXPENSES")
    print("="*80)
    print("Objetivo: Encontrar como obter SALDO REEMBOLSAR, SALDO FINAL, SALDO CARTAO, REEMBOLSO, CARGA PARCIAL, CARGA FINAL")
    print("="*80)
    
    # 1. Descobrir endpoints
    doc_endpoint = discover_api_endpoints()
    
    # 2. Testar expenses com todos os filtros possíveis
    successful_filters = test_expenses_with_all_possible_filters()
    
    # 3. Investigar detalhes de team members
    investigate_team_member_details()
    
    # 4. Testar relacionamento report-expenses
    expenses_endpoint = test_report_expenses_relationship()
    
    # 5. Salvar resultados
    results = {
        'investigation_date': datetime.now().isoformat(),
        'documentation_endpoint': doc_endpoint,
        'successful_expenses_filters': successful_filters,
        'expenses_endpoint_found': expenses_endpoint
    }
    
    output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/api_complete_investigation.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n\nResultados salvos em: {output_file}")
    print("\n" + "="*80)
    print("INVESTIGAÇÃO DA API CONCLUÍDA!")
    print("="*80)

if __name__ == "__main__":
    main()
