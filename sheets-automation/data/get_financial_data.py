import requests
import json
from datetime import datetime, timedelta
import pandas as pd

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json"
}

def get_expenses_with_details():
    """Obtém expenses completos com todos os detalhes financeiros"""
    print("OBTENDO EXPENSES COM DETALHES")
    print("="*80)
    
    # Tentar diferentes abordagens para obter expenses
    approaches = [
        # 1. Expenses gerais com filtros
        {"endpoint": "/expenses", "params": {"paginate": "false", "per_page": 100}},
        {"endpoint": "/expenses", "params": {"paginate": "false", "per_page": 100, "start_date": "2026-04-01", "end_date": "2026-04-30"}},
        {"endpoint": "/expenses", "params": {"paginate": "false", "per_page": 100, "start_date": "2026-04-01", "end_date": "2026-04-15"}},
        {"endpoint": "/expenses", "params": {"paginate": "false", "per_page": 100, "start_date": "2026-04-16", "end_date": "2026-04-30"}},
        
        # 2. Por usuário específico
        {"endpoint": "/expenses", "params": {"paginate": "false", "per_page": 100, "user_id": 890792}},
        {"endpoint": "/expenses", "params": {"paginate": "false", "per_page": 100, "user_id": 890792, "start_date": "2026-04-01", "end_date": "2026-04-30"}},
        
        # 3. Por report_id
        {"endpoint": "/expenses", "params": {"paginate": "false", "per_page": 100, "report_id": 7603397}},
    ]
    
    all_expenses = []
    
    for i, approach in enumerate(approaches):
        print(f"\nAbordagem {i+1}: {approach}")
        
        try:
            url = f"{BASE_URL}{approach['endpoint']}"
            response = requests.get(url, headers=headers, params=approach['params'])
            
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                
                if 'data' in data and isinstance(data['data'], list):
                    expenses = data['data']
                    print(f"Encontrados {len(expenses)} expenses")
                    
                    if expenses:
                        # Analisar estrutura da primeira expense
                        sample_expense = expenses[0]
                        print(f"Campos da expense: {list(sample_expense.keys())}")
                        
                        # Procurar campos financeiros
                        financial_fields = []
                        for key, value in sample_expense.items():
                            if isinstance(value, (int, float)) and value > 0:
                                field_name_lower = key.lower()
                                if any(keyword in field_name_lower for keyword in ['value', 'amount', 'total', 'balance']):
                                    financial_fields.append((key, value))
                        
                        print(f"Campos financeiros: {financial_fields}")
                        
                        # Adicionar à lista completa
                        all_expenses.extend(expenses)
                        
                        # Se encontrou expenses, mostrar amostra
                        if len(expenses) >= 3:
                            for j in range(min(3, len(expenses))):
                                expense = expenses[j]
                                financial_data = {k: v for k, v in expense.items() if isinstance(v, (int, float))}
                                print(f"  Expense {j+1} - Financeiro: {financial_data}")
                else:
                    print("Sem campo 'data' ou não é lista")
            else:
                print(f"Erro: {response.text}")
                
        except Exception as e:
            print(f"Exceção: {e}")
    
    print(f"\nTotal de expenses coletados: {len(all_expenses)}")
    return all_expenses

def get_advances_data():
    """Obtém dados de advances (adiantamentos)"""
    print("\nOBTENDO ADVANCES")
    print("="*80)
    
    approaches = [
        {"endpoint": "/advances", "params": {"paginate": "false", "per_page": 100}},
        {"endpoint": "/advances", "params": {"paginate": "false", "per_page": 100, "user_id": 890792}},
        {"endpoint": "/advances", "params": {"paginate": "false", "per_page": 100, "start_date": "2026-04-01", "end_date": "2026-04-30"}},
    ]
    
    all_advances = []
    
    for i, approach in enumerate(approaches):
        print(f"\nAbordagem {i+1}: {approach}")
        
        try:
            url = f"{BASE_URL}{approach['endpoint']}"
            response = requests.get(url, headers=headers, params=approach['params'])
            
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                
                if 'data' in data and isinstance(data['data'], list):
                    advances = data['data']
                    print(f"Encontrados {len(advances)} advances")
                    
                    if advances:
                        sample_advance = advances[0]
                        print(f"Campos do advance: {list(sample_advance.keys())}")
                        
                        # Procurar campos financeiros
                        financial_fields = []
                        for key, value in sample_advance.items():
                            if isinstance(value, (int, float)):
                                field_name_lower = key.lower()
                                if any(keyword in field_name_lower for keyword in ['value', 'amount', 'total']):
                                    financial_fields.append((key, value))
                        
                        print(f"Campos financeiros: {financial_fields}")
                        
                        # Mostrar amostra
                        for j in range(min(3, len(advances))):
                            advance = advances[j]
                            financial_data = {k: v for k, v in advance.items() if isinstance(v, (int, float))}
                            print(f"  Advance {j+1} - Financeiro: {financial_data}")
                        
                        all_advances.extend(advances)
                else:
                    print("Sem campo 'data' ou não é lista")
            else:
                print(f"Erro: {response.text}")
                
        except Exception as e:
            print(f"Exceção: {e}")
    
    print(f"\nTotal de advances coletados: {len(all_advances)}")
    return all_advances

def get_team_members_with_cards():
    """Obtém team members e tenta encontrar dados de cartão"""
    print("\nOBTENDO TEAM MEMBERS E CARTÕES")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/team-members"
        params = {"paginate": "false", "per_page": 100}
        response = requests.get(url, headers=headers, params=params)
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            if 'data' in data and isinstance(data['data'], list):
                team_members = data['data']
                print(f"Encontrados {len(team_members)} team members")
                
                if team_members:
                    sample_member = team_members[0]
                    print(f"Campos do team member: {list(sample_member.keys())}")
                    
                    # Procurar campos relacionados a cartão/saldo
                    card_related_fields = []
                    for key, value in sample_member.items():
                        field_name_lower = key.lower()
                        if any(keyword in field_name_lower for keyword in ['card', 'balance', 'limit', 'credit']):
                            card_related_fields.append((key, value))
                    
                    print(f"Campos relacionados a cartão: {card_related_fields}")
                    
                    # Tentar obter dados de cartão para alguns usuários
                    for i in range(min(5, len(team_members))):
                        member = team_members[i]
                        user_id = member.get('id')
                        user_name = member.get('name', 'Unknown')
                        
                        print(f"\nTestando cartões para usuário {user_id} - {user_name}")
                        
                        # Tentar diferentes endpoints de cartão
                        card_endpoints = [
                            f"/team-members/{user_id}/cards",
                            f"/team-members/{user_id}/card-limits",
                            f"/team-members/{user_id}/balance",
                            f"/team-members/{user_id}/limits",
                        ]
                        
                        for endpoint in card_endpoints:
                            try:
                                url = f"{BASE_URL}{endpoint}"
                                response = requests.get(url, headers=headers)
                                
                                if response.status_code == 200:
                                    card_data = response.json()
                                    print(f"  ✅ {endpoint}: {card_data.keys() if isinstance(card_data, dict) else type(card_data)}")
                                else:
                                    print(f"  ❌ {endpoint}: {response.status_code}")
                                    
                            except Exception as e:
                                print(f"  ❌ {endpoint}: {e}")
                
                return team_members
        else:
            print(f"Erro: {response.text}")
            
    except Exception as e:
        print(f"Exceção: {e}")
    
    return []

def analyze_reports_for_financial_data():
    """Analisa reports em detalhe para encontrar dados financeiros"""
    print("\nANALISANDO REPORTS PARA DADOS FINANCEIROS")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/reports"
        params = {"paginate": "false", "per_page": 50}
        response = requests.get(url, headers=headers, params=params)
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            if 'data' in data and isinstance(data['data'], list):
                reports = data['data']
                print(f"Encontrados {len(reports)} reports")
                
                if reports:
                    sample_report = reports[0]
                    print(f"Campos do report: {list(sample_report.keys())}")
                    
                    # Procurar campos financeiros
                    financial_fields = []
                    for key, value in sample_report.items():
                        if isinstance(value, (int, float)):
                            field_name_lower = key.lower()
                            if any(keyword in field_name_lower for keyword in ['value', 'amount', 'total', 'balance']):
                                financial_fields.append((key, value))
                    
                    print(f"Campos financeiros: {financial_fields}")
                    
                    # Analisar reports com diferentes status
                    status_analysis = {}
                    for report in reports:
                        status = report.get('status', 'UNKNOWN')
                        if status not in status_analysis:
                            status_analysis[status] = []
                        
                        financial_data = {k: v for k, v in report.items() if isinstance(v, (int, float))}
                        if financial_data:
                            status_analysis[status].append(financial_data)
                    
                    print(f"\nAnálise por status:")
                    for status, data_list in status_analysis.items():
                        print(f"  {status}: {len(data_list)} reports com dados financeiros")
                        if data_list:
                            print(f"    Exemplo: {data_list[0]}")
                    
                    # Tentar obter detalhes de um report específico
                    if reports:
                        report_id = reports[0]['id']
                        print(f"\nObtendo detalhes do report {report_id}")
                        
                        detail_url = f"{BASE_URL}/reports/{report_id}"
                        detail_response = requests.get(detail_url, headers=headers)
                        
                        if detail_response.status_code == 200:
                            detail_data = detail_response.json()
                            print(f"Detalhes do report: {detail_data.keys() if isinstance(detail_data, dict) else type(detail_data)}")
                            
                            if isinstance(detail_data, dict) and 'data' in detail_data:
                                report_detail = detail_data['data']
                                print(f"Campos do detalhe: {list(report_detail.keys())}")
                                
                                # Procurar por expenses no detalhe
                                if 'expenses' in report_detail:
                                    expenses = report_detail['expenses']
                                    print(f"Expenses no detalhe: {len(expenses)}")
                                    
                                    if expenses:
                                        sample_expense = expenses[0]
                                        print(f"Campos da expense no detalhe: {list(sample_expense.keys())}")
                                        
                                        # Mostrar dados financeiros das expenses
                                        for j in range(min(3, len(expenses))):
                                            expense = expenses[j]
                                            financial_data = {k: v for k, v in expense.items() if isinstance(v, (int, float))}
                                            print(f"  Expense {j+1}: {financial_data}")
                
                return reports
        else:
            print(f"Erro: {response.text}")
            
    except Exception as e:
        print(f"Exceção: {e}")
    
    return []

def main():
    """Função principal"""
    print("INVESTIGAÇÃO DE DADOS FINANCEIROS VEXPENSES")
    print("="*80)
    print("Buscando dados para SALDO REEMBOLSAR, SALDO FINAL, SALDO CARTAO, REEMBOLSO, CARGA PARCIAL, CARGA FINAL")
    print("="*80)
    
    # Coletar todos os dados
    expenses = get_expenses_with_details()
    advances = get_advances_data()
    team_members = get_team_members_with_cards()
    reports = analyze_reports_for_financial_data()
    
    # Salvar resultados
    results = {
        'investigation_date': datetime.now().isoformat(),
        'expenses': {
            'count': len(expenses),
            'sample': expenses[:5] if expenses else [],
            'financial_fields_found': bool(expenses)
        },
        'advances': {
            'count': len(advances),
            'sample': advances[:3] if advances else [],
            'financial_fields_found': bool(advances)
        },
        'team_members': {
            'count': len(team_members),
            'sample': team_members[:3] if team_members else [],
            'card_fields_found': any('card' in str(member).lower() or 'balance' in str(member).lower() for member in team_members)
        },
        'reports': {
            'count': len(reports),
            'sample': reports[:3] if reports else [],
            'financial_fields_found': any(any(isinstance(v, (int, float)) and v > 0 for v in report.values()) for report in reports)
        }
    }
    
    output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/financial_data_complete.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n\nResultados salvos em: {output_file}")
    print("\n" + "="*80)
    print("INVESTIGAÇÃO FINANCEIRA CONCLUÍDA!")
    print("="*80)

if __name__ == "__main__":
    main()
