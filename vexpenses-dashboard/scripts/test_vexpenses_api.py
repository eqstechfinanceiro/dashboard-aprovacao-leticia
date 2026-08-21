import requests
import json
from datetime import datetime, timedelta

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json"
}

def test_endpoint(endpoint, params=None):
    """Testa um endpoint da API e retorna a resposta"""
    url = f"{BASE_URL}{endpoint}"
    print(f"\n{'='*80}")
    print(f"TESTANDO: {url}")
    if params:
        print(f"PARAMS: {params}")
    print(f"{'='*80}")
    
    try:
        response = requests.get(url, headers=headers, params=params)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Success: {data.get('message', 'OK')}")
            print(f"Data keys: {data.keys() if isinstance(data, dict) else 'N/A'}")
            
            if 'data' in data and isinstance(data['data'], list):
                print(f"Total items: {len(data['data'])}")
                if len(data['data']) > 0:
                    print(f"First item keys: {data['data'][0].keys()}")
                    print(f"First item (sample): {json.dumps(data['data'][0], indent=2, default=str)[:500]}")
            elif 'data' in data and isinstance(data['data'], dict):
                print(f"Data keys: {data['data'].keys()}")
                print(f"Data (sample): {json.dumps(data['data'], indent=2, default=str)[:500]}")
            
            return data
        else:
            print(f"Error: {response.text}")
            return None
    except Exception as e:
        print(f"Exception: {e}")
        return None

# 1. Testar team-members (já testado na doc)
print("\n" + "="*80)
print("1. TEAM MEMBERS")
print("="*80)
team_members = test_endpoint("/team-members", params={"paginate": "false", "per_page": 5})

# 2. Testar reports primeiro (para ter report_id disponível)
print("\n" + "="*80)
print("2. REPORTS")
print("="*80)
reports = test_endpoint("/reports", params={"paginate": "false", "per_page": 5})

# Testar reports por status
if reports:
    reports_status = test_endpoint("/reports", params={"paginate": "false", "per_page": 5, "status": "APPROVED"})

# 3. Testar expenses com diferentes filtros
print("\n" + "="*80)
print("3. EXPENSES")
print("="*80)

# Testar expenses com diferentes combinações de filtros
test_filters = [
    {"report_id": reports['data'][0]['id']} if reports and 'data' in reports and len(reports['data']) > 0 else None,
    {"user_id": team_members['data'][0]['id']} if team_members and 'data' in team_members and len(team_members['data']) > 0 else None,
    {"start_date": "2026-04-01", "end_date": "2026-04-30"},
    {"report_id": reports['data'][0]['id'], "start_date": "2026-04-01", "end_date": "2026-04-30"} if reports and 'data' in reports and len(reports['data']) > 0 else None,
]

for i, filters in enumerate(test_filters):
    if filters:
        print(f"\nTestando filtros {i+1}: {filters}")
        test_endpoint("/expenses", params={**filters, "paginate": "false", "per_page": 5})

# 3.5 Testar endpoint de relatório específico para ver se inclui despesas
print("\n" + "="*80)
print("3.5 REPORT DETAIL")
print("="*80)
if reports and 'data' in reports and len(reports['data']) > 0:
    report_id = reports['data'][0]['id']
    print(f"\nTestando endpoint /reports/{report_id}")
    report_detail = test_endpoint(f"/reports/{report_id}")
    
    # 3.6 Testar endpoint para obter despesas de um relatório específico
    print("\n" + "="*80)
    print("3.6 REPORT EXPENSES")
    print("="*80)
    print(f"\nTestando endpoint /reports/{report_id}/expenses")
    report_expenses = test_endpoint(f"/reports/{report_id}/expenses")

# 4. Testar cost-centers
print("\n" + "="*80)
print("4. COST CENTERS")
print("="*80)
cost_centers = test_endpoint("/cost-centers", params={"paginate": "false", "per_page": 10})

# 5. Testar projects
print("\n" + "="*80)
print("5. PROJECTS")
print("="*80)
projects = test_endpoint("/projects", params={"paginate": "false", "per_page": 10})

# 6. Testar approval-flows
print("\n" + "="*80)
print("6. APPROVAL FLOWS")
print("="*80)
approval_flows = test_endpoint("/approval-flows", params={"paginate": "false", "per_page": 10})

# 7. Testar expense-limit-policies (para ver limites)
print("\n" + "="*80)
print("7. EXPENSE LIMIT POLICIES")
print("="*80)
# Este endpoint pode não existir, vamos tentar
limit_policies = test_endpoint("/expense-limit-policies", params={"paginate": "false", "per_page": 10})

# 8. Testar endpoints relacionados a cartões (cards)
print("\n" + "="*80)
print("8. CARDS / CARDS LIMITS")
print("="*80)

# Tentar diferentes endpoints relacionados a cartões
card_endpoints = [
    "/cards",
    "/card-limits",
    "/cards-limits",
    "/team-members/cards",
    "/team-members/{user_id}/cards" if team_members and 'data' in team_members and len(team_members['data']) > 0 else None,
]

for endpoint in card_endpoints:
    if endpoint and "{user_id}" in endpoint:
        endpoint = endpoint.replace("{user_id}", str(team_members['data'][0]['id']))
    if endpoint:
        print(f"\nTestando endpoint: {endpoint}")
        test_endpoint(endpoint)

# 9. Testar endpoint de parâmetros de team-member
print("\n" + "="*80)
print("9. TEAM MEMBER PARAMETERS")
print("="*80)
if team_members and 'data' in team_members and len(team_members['data']) > 0:
    user_id = team_members['data'][0]['id']
    print(f"\nTestando endpoint /team-members/{user_id}/parameters")
    test_endpoint(f"/team-members/{user_id}/parameters")

print("\n" + "="*80)
print("TESTES CONCLUÍDOS")
print("="*80)
