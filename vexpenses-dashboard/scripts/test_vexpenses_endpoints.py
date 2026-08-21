#!/usr/bin/env python3
"""
Script para testar endpoints da API VExpenses que podem conter dados financeiros e organizacionais.
"""

import requests
import json
from datetime import datetime

# Configurações
API_URL = "https://api.vexpenses.com/v2"
API_KEY = "SUA_API_KEY_AQUI"  # Substituir pela API key real

headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

def test_endpoint(endpoint, params=None, method="GET"):
    """Testa um endpoint da API"""
    url = f"{API_URL}{endpoint}"
    print(f"\n{'='*80}")
    print(f"TESTANDO: {method} {url}")
    if params:
        print(f"PARAMS: {params}")
    print(f"{'='*80}")

    try:
        if method == "GET":
            response = requests.get(url, headers=headers, params=params, timeout=30)
        else:
            response = requests.post(url, headers=headers, json=params, timeout=30)

        print(f"STATUS: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print("SUCESSO!")
            print(json.dumps(data, indent=2, ensure_ascii=False)[:2000])
            return data
        else:
            print(f"ERRO: {response.text}")
            return None

    except Exception as e:
        print(f"EXCEPTION: {e}")
        return None

def main():
    print("TESTANDO ENDPOINTS DA API VEXPENSES PARA DADOS FINANCEIROS E ORGANIZACIONAIS")
    print(f"API URL: {API_URL}")
    print(f"Data/Hora: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # 1. Testar expenses com filtros avançados (simulando relatório "Despesas por Usuário")
    print("\n" + "="*80)
    print("1. EXPENSES - Relatório por usuário com filtros")
    print("="*80)

    # Filtro por período (abril 2026)
    test_endpoint(
        "/expenses",
        params={
            "search": "date:2026-04-01,2026-04-30",
            "searchFields": "date:between",
            "include": "user,costs_center,payment_method,expense_type,report",
            "paginate": "false"
        }
    )

    # 2. Testar expenses com filtro de reembolsáveis
    print("\n" + "="*80)
    print("2. EXPENSES - Apenas reembolsáveis")
    print("="*80)

    test_endpoint(
        "/expenses",
        params={
            "search": "date:2026-04-01,2026-04-30;reimbursable:1",
            "searchFields": "date:between;reimbursable:=",
            "include": "user,costs_center,payment_method",
            "paginate": "false"
        }
    )

    # 3. Testar expenses agrupadas por usuário
    print("\n" + "="*80)
    print("3. EXPENSES - Por usuário específico")
    print("="*80)

    # Primeiro pegar um user_id válido
    team_members = test_endpoint("/team-members", params={"paginate": "false"})
    if team_members and team_members.get("data"):
        first_user_id = team_members["data"][0]["id"]
        print(f"Usando user_id: {first_user_id}")

        test_endpoint(
            "/expenses",
            params={
                "search": f"user_id:{first_user_id}",
                "searchFields": "user_id:=",
                "include": "user,costs_center,payment_method,report",
                "paginate": "false"
            }
        )

    # 4. Testar reports com dados financeiros
    print("\n" + "="*80)
    print("4. REPORTS - Relatórios com dados completos")
    print("="*80)

    test_endpoint(
        "/reports",
        params={
            "include": "user,expense",
            "search": "created_at:2026-04-01,2026-04-30",
            "searchFields": "created_at:between",
            "paginate": "false"
        }
    )

    # 5. Testar advances (adiantamentos)
    print("\n" + "="*80)
    print("5. ADVANCES - Adiantamentos")
    print("="*80)

    test_endpoint("/advances", params={"paginate": "false"})

    # 6. Testar reimbursements (reembolsos)
    print("\n" + "="*80)
    print("6. REIMBURSEMENTS - Reembolsos")
    print("="*80)

    test_endpoint("/reimbursements", params={"paginate": "false"})

    # 7. Testar cards (mesmo que tenha falhado antes)
    print("\n" + "="*80)
    print("7. CARDS - Cartões")
    print("="*80)

    test_endpoint("/cards", params={"paginate": "false"})

    # 8. Testar card-limits
    print("\n" + "="*80)
    print("8. CARD-LIMITS - Limites de cartão")
    print("="*80)

    test_endpoint("/card-limits", params={"paginate": "false"})

    # 9. Testar cards-limits (variação)
    print("\n" + "="*80)
    print("9. CARDS-LIMITS - Limites de cartão (variação)")
    print("="*80)

    test_endpoint("/cards-limits", params={"paginate": "false"})

    # 10. Testar expense-limit-policies
    print("\n" + "="*80)
    print("10. EXPENSE-LIMIT-POLICIES - Políticas de limite")
    print("="*80)

    test_endpoint("/expense-limit-policies", params={"paginate": "false"})

    # 11. Testar cost-centers
    print("\n" + "="*80)
    print("11. COST-CENTERS - Centros de custo")
    print("="*80)

    test_endpoint("/cost-centers", params={"paginate": "false"})

    # 12. Testar approvals (aprovações)
    print("\n" + "="*80)
    print("12. APPROVALS - Aprovações")
    print("="*80)

    test_endpoint("/approvals", params={"paginate": "false"})

    # 13. Testar routes (rotas)
    print("\n" + "="*80)
    print("13. ROUTES - Rotas")
    print("="*80)

    test_endpoint("/routes", params={"paginate": "false"})

    # 14. Testar companies (empresas)
    print("\n" + "="*80)
    print("14. COMPANIES - Empresas")
    print("="*80)

    test_endpoint("/companies", params={"paginate": "false"})

    # 15. Testar team-members com include para dados organizacionais
    print("\n" + "="*80)
    print("15. TEAM-MEMBERS - Com includes avançados")
    print("="*80)

    test_endpoint(
        "/team-members",
        params={
            "include": "costsCenters,projects,approval_flow,expense_limit_policy",
            "paginate": "false"
        }
    )

    print("\n" + "="*80)
    print("FIM DOS TESTES")
    print("="*80)

if __name__ == "__main__":
    main()
