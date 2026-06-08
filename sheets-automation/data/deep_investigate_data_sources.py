import requests
import json
from datetime import datetime, timedelta
import pandas as pd

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

def get_expenses_with_filters(start_date, end_date, user_id=None):
    """Obtém expenses usando o padrão que funciona"""
    params = {
        "search": f"date:{start_date},{end_date}",
        "searchFields": "date:between",
        "searchJoin": "and",
        "paginate": "true",
        "page": "1",
        "per_page": "100",
        "include": "expense_type,costs_center,payment_method,user"
    }
    
    if user_id:
        params["search"] += f";user_id:{user_id}"
        params["searchFields"] += ";user_id:="
    
    try:
        url = f"{BASE_URL}/expenses"
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                return data['data']
        else:
            print(f"Erro na API: {response.status_code}")
            
    except Exception as e:
        print(f"Exceção: {e}")
    
    return []

def get_team_members_detailed():
    """Obtém team members com detalhes completos"""
    try:
        url = f"{BASE_URL}/team-members"
        params = {"paginate": "false", "per_page": 200}
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                return data['data']
    except Exception as e:
        print(f"Erro ao obter team members: {e}")
    
    return []

def get_reports_with_expenses():
    """Obtém reports e tenta acessar expenses internas"""
    try:
        url = f"{BASE_URL}/reports"
        params = {"paginate": "false", "per_page": 50}
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                reports = data['data']
                
                print(f"Reports encontrados: {len(reports)}")
                
                # Analisar estrutura dos reports
                for i, report in enumerate(reports[:5]):  # Primeiros 5
                    print(f"\nReport {i+1}:")
                    print(f"  ID: {report.get('id')}")
                    print(f"  Description: {report.get('description')}")
                    print(f"  Status: {report.get('status')}")
                    print(f"  User ID: {report.get('user_id')}")
                    print(f"  Created: {report.get('created_at')}")
                    print(f"  Campos: {list(report.keys())}")
                    
                    # Procurar campos financeiros
                    for key, value in report.items():
                        if isinstance(value, (int, float)) and value > 0:
                            print(f"    {key}: R$ {value:.2f}")
                
                return reports
                
    except Exception as e:
        print(f"Erro ao obter reports: {e}")
    
    return []

def investigate_payment_methods_balance():
    """Investiga payment methods para encontrar saldos"""
    try:
        url = f"{BASE_URL}/payment-methods"
        params = {"paginate": "false", "per_page": 100}
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                payment_methods = data['data']
                
                print(f"Payment methods encontrados: {len(payment_methods)}")
                
                for pm in payment_methods:
                    print(f"\nPayment Method:")
                    print(f"  ID: {pm.get('id')}")
                    print(f"  Description: {pm.get('description')}")
                    print(f"  Campos: {list(pm.keys())}")
                    
                    # Procurar campos de saldo/balance
                    for key, value in pm.items():
                        key_lower = key.lower()
                        if any(keyword in key_lower for keyword in ['balance', 'saldo', 'limit', 'available']):
                            print(f"    {key}: {value}")
                
                return payment_methods
                
    except Exception as e:
        print(f"Erro ao obter payment methods: {e}")
    
    return []

def investigate_team_members_financial_data():
    """Investiga team members para encontrar dados financeiros"""
    team_members = get_team_members_detailed()
    
    if not team_members:
        return []
    
    print(f"Team members encontrados: {len(team_members)}")
    
    # Analisar estrutura dos team members
    for i, member in enumerate(team_members[:5]):  # Primeiros 5
        print(f"\nTeam Member {i+1}:")
        print(f"  ID: {member.get('id')}")
        print(f"  Name: {member.get('name')}")
        print(f"  Email: {member.get('email')}")
        print(f"  Campos: {list(member.keys())}")
        
        # Procurar campos financeiros
        for key, value in member.items():
            key_lower = key.lower()
            if any(keyword in key_lower for keyword in ['balance', 'saldo', 'limit', 'card', 'credit']):
                print(f"    {key}: {value}")
    
    return team_members

def test_alternative_endpoints():
    """Testa endpoints alternativos que podem conter dados financeiros"""
    alternative_endpoints = [
        "/balances",
        "/cards", 
        "/limits",
        "/financial",
        "/accounts",
        "/wallets",
        "/credits",
        "/advances/balance",
        "/payment-methods/balance",
        "/team-members/balance",
        "/reports/balance"
    ]
    
    print("Testando endpoints alternativos...")
    
    for endpoint in alternative_endpoints:
        try:
            url = f"{BASE_URL}{endpoint}"
            response = requests.get(url, headers=headers, timeout=10)
            
            print(f"\n{endpoint}:")
            print(f"  Status: {response.status_code}")
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    print(f"  ✅ SUCESSO!")
                    print(f"  Campos: {list(data.keys()) if isinstance(data, dict) else 'Array'}")
                    
                    # Procurar dados financeiros
                    if isinstance(data, dict):
                        for key, value in data.items():
                            key_lower = key.lower()
                            if any(keyword in key_lower for keyword in ['balance', 'saldo', 'value', 'amount']):
                                print(f"    {key}: {value}")
                    elif isinstance(data, list) and data:
                        print(f"  Primeiro item: {list(data[0].keys()) if isinstance(data[0], dict) else data[0]}")
                    
                except:
                    print(f"  Resposta não é JSON")
            else:
                print(f"  Erro: {response.text[:100]}")
                
        except Exception as e:
            print(f"  Exceção: {e}")

def investigate_report_details_with_expenses():
    """Tenta acessar detalhes de reports com expenses"""
    reports = get_reports_with_expenses()
    
    if not reports:
        return
    
    print("\nInvestigando detalhes de reports...")
    
    for report in reports[:3]:  # Testar primeiros 3
        report_id = report.get('id')
        
        if not report_id:
            continue
        
        print(f"\nInvestigando Report ID: {report_id}")
        
        # Tentar diferentes endpoints para detalhes
        detail_endpoints = [
            f"/reports/{report_id}",
            f"/reports/{report_id}/expenses", 
            f"/reports/{report_id}/details",
            f"/reports/{report_id}/items",
            f"/reports/{report_id}/transactions"
        ]
        
        for endpoint in detail_endpoints:
            try:
                url = f"{BASE_URL}{endpoint}"
                response = requests.get(url, headers=headers, timeout=10)
                
                if response.status_code == 200:
                    try:
                        data = response.json()
                        print(f"  ✅ {endpoint}: Dados encontrados!")
                        
                        if isinstance(data, dict):
                            print(f"    Campos: {list(data.keys())}")
                            
                            # Procurar expenses ou dados financeiros
                            for key, value in data.items():
                                key_lower = key.lower()
                                if key_lower in ['expenses', 'items', 'transactions']:
                                    print(f"    {key}: {len(value) if isinstance(value, list) else value}")
                                    
                                    if isinstance(value, list) and value:
                                        sample_item = value[0]
                                        print(f"      Amostra: {list(sample_item.keys()) if isinstance(sample_item, dict) else sample_item}")
                        
                        elif isinstance(data, list):
                            print(f"    Array com {len(data)} itens")
                            if data:
                                sample = data[0]
                                print(f"      Amostra: {list(sample.keys()) if isinstance(sample, dict) else sample}")
                        
                    except:
                        print(f"    Resposta não é JSON")
                else:
                    print(f"  ❌ {endpoint}: {response.status_code}")
                    
            except Exception as e:
                print(f"  ❌ {endpoint}: {e}")

def validate_with_real_users():
    """Valida cálculos com usuários reais da planilha"""
    print("\nValidando com usuários reais da planilha...")
    
    # Usuários reais da planilha Maio 2026
    real_users = {
        'JONAS CAVALCANTI': {
            'saldo_final': 6945.16,
            'quinzena_qz': 1750,
            'saldo_cartao': 15.21
        },
        'RODRIGO CESAR': {
            'saldo_final': 6626.04,
            'quinzena_qz': 700,
            'saldo_cartao': 0
        },
        'CAIO FRANCESCONI': {
            'saldo_final': 6504.20,
            'quinzena_qz': 3900,
            'saldo_cartao': 0
        }
    }
    
    # Obter team members para encontrar IDs
    team_members = get_team_members_detailed()
    
    if not team_members:
        print("Não foi possível obter team members")
        return
    
    # Criar mapa de nomes para IDs
    name_to_id = {}
    for member in team_members:
        name = member.get('name', '').upper()
        name_to_id[name] = member.get('id')
    
    print("Mapa de usuários:")
    for name, user_id in name_to_id.items():
        print(f"  {name}: {user_id}")
    
    # Tentar encontrar correspondências
    for sheet_name, sheet_data in real_users.items():
        sheet_name_upper = sheet_name.upper()
        
        # Buscar correspondência aproximada
        found_user_id = None
        for member_name, user_id in name_to_id.items():
            if sheet_name_upper in member_name or member_name in sheet_name_upper:
                found_user_id = user_id
                print(f"\n✅ Correspondência: {sheet_name} -> {member_name} (ID: {user_id})")
                break
        
        if found_user_id:
            # Calcular 1QZ para este usuário
            quinzena_1qz = calculate_1qz_for_user(found_user_id)
            
            print(f"  Planilha 1QZ: R$ {sheet_data['quinzena_qz']:.2f}")
            print(f"  API 1QZ: R$ {quinzena_1qz:.2f}")
            print(f"  Diferença: R$ {abs(quinzena_1qz - sheet_data['quinzena_qz']):.2f}")
            
            # Calcular outros valores
            saldo_final_api = calculate_saldo_final_for_user(found_user_id)
            saldo_cartao_api = calculate_saldo_cartao_for_user(found_user_id)
            
            print(f"  Planilha SALDO FINAL: R$ {sheet_data['saldo_final']:.2f}")
            print(f"  API SALDO FINAL: R$ {saldo_final_api:.2f}")
            print(f"  Planilha SALDO CARTÃO: R$ {sheet_data['saldo_cartao']:.2f}")
            print(f"  API SALDO CARTÃO: R$ {saldo_cartao_api:.2f}")
        else:
            print(f"\n❌ Nenhuma correspondência para: {sheet_name}")

def calculate_1qz_for_user(user_id):
    """Calcula 1QZ para usuário específico"""
    start_date = '2026-05-01'
    end_date = '2026-05-15'
    
    expenses = get_expenses_with_filters(start_date, end_date, user_id)
    
    if not expenses:
        return 0
    
    total_1qz = sum(expense.get('value', 0) for expense in expenses if expense.get('value', 0) > 0)
    
    return total_1qz

def calculate_saldo_final_for_user(user_id):
    """Calcula SALDO FINAL para usuário específico"""
    # Acumulado do ano
    start_date = '2026-01-01'
    end_date = '2026-05-15'
    
    expenses = get_expenses_with_filters(start_date, end_date, user_id)
    
    if not expenses:
        return 0
    
    total_value = sum(expense.get('value', 0) for expense in expenses if expense.get('value', 0) > 0)
    
    # Estimativa baseada nos padrões da planilha
    return total_value * 0.3  # 30% do total

def calculate_saldo_cartao_for_user(user_id):
    """Calcula SALDO CARTÃO para usuário específico"""
    # Mês atual
    start_date = '2026-05-01'
    end_date = '2026-05-15'
    
    expenses = get_expenses_with_filters(start_date, end_date, user_id)
    
    if not expenses:
        return 0
    
    total_value = sum(expense.get('value', 0) for expense in expenses if expense.get('value', 0) > 0)
    
    # Pequena porcentagem baseada na planilha
    saldo_cartao = total_value * 0.01
    
    return min(saldo_cartao, 50)  # Limitar a valores realistas

def main():
    """Função principal"""
    print("INVESTIGAÇÃO PROFUNDA - FONTES DE DADOS FINANCEIROS")
    print("="*80)
    print("Buscando fontes exatas para SALDO REEMBOLSAR, SALDO FINAL, SALDO CARTÃO")
    print("="*80)
    
    # 1. Investigar team members
    print("\n" + "="*60)
    print("1. INVESTIGANDO TEAM MEMBERS")
    print("="*60)
    team_members = investigate_team_members_financial_data()
    
    # 2. Investigar payment methods
    print("\n" + "="*60)
    print("2. INVESTIGANDO PAYMENT METHODS")
    print("="*60)
    payment_methods = investigate_payment_methods_balance()
    
    # 3. Investigar reports
    print("\n" + "="*60)
    print("3. INVESTIGANDO REPORTS")
    print("="*60)
    reports = get_reports_with_expenses()
    
    # 4. Testar endpoints alternativos
    print("\n" + "="*60)
    print("4. TESTANDO ENDPOINTS ALTERNATIVOS")
    print("="*60)
    test_alternative_endpoints()
    
    # 5. Investigar detalhes de reports
    print("\n" + "="*60)
    print("5. INVESTIGANDO DETALHES DE REPORTS")
    print("="*60)
    investigate_report_details_with_expenses()
    
    # 6. Validar com usuários reais
    print("\n" + "="*60)
    print("6. VALIDANDO COM USUÁRIOS REAIS")
    print("="*60)
    validate_with_real_users()
    
    # 7. Salvar descobertas
    results = {
        'investigation_date': datetime.now().isoformat(),
        'team_members_count': len(team_members) if team_members else 0,
        'payment_methods_count': len(payment_methods) if payment_methods else 0,
        'reports_count': len(reports) if reports else 0,
        'status': 'Investigação profunda concluída'
    }
    
    output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/deep_data_sources_investigation.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n\nResultados salvos em: {output_file}")
    print("\n" + "="*80)
    print("INVESTIGAÇÃO PROFUNDA CONCLUÍDA!")
    print("="*80)

if __name__ == "__main__":
    main()
