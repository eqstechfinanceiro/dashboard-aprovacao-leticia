"""
INVESTIGAÇÃO ULTIMATIVA - NÃO VOU PARAR ATÉ 100% DOS DADOS
Teste absoluto de todas as possibilidades da API VExpenses
"""

import requests
import json
from datetime import datetime
import time

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

# Dados EXATOS da planilha - nossa verdade absoluta
PLANILHA_TARGET = {
    895945: {  # JONAS CAVALCANTI
        'quinzena_qz': 1750.00,
        'saldo_final': 6945.16,
        'saldo_cartao': 15.21,
        'saldo_reembolsar': -98.92,
        'carga_final': 49.46
    },
    895946: {  # RODRIGO CESAR
        'quinzena_qz': 700.00,
        'saldo_final': 6626.04,
        'saldo_cartao': 0.00,
        'saldo_reembolsar': -428.82,
        'carga_final': 214.41
    },
    895947: {  # CAIO FRANCESCONI
        'quinzena_qz': 3900.00,
        'saldo_final': 6504.20,
        'saldo_cartao': 0.00,
        'saldo_reembolsar': 1154.94,
        'carga_final': 577.47
    }
}

def test_endpoint(url, params=None, description=""):
    """Testa endpoint e retorna resultados"""
    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            return {
                'success': True,
                'data': data,
                'status': response.status_code,
                'description': description
            }
        else:
            return {
                'success': False,
                'error': response.text[:200],
                'status': response.status_code,
                'description': description
            }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'description': description
        }

def investigate_payment_methods():
    """Investiga métodos de pagamento para encontrar cartões específicos"""
    print("💳 INVESTIGANDO MÉTODOS DE PAGAMENTO")
    
    # Testar payment-methods
    result = test_endpoint(f"{BASE_URL}/payment-methods", 
                          {'paginate': 'false', 'per_page': 100},
                          "Métodos de pagamento")
    
    if result['success']:
        data = result['data']
        print(f"✅ {len(data.get('data', []))} métodos encontrados")
        
        # Analisar métodos
        payment_methods = []
        if 'data' in data:
            for method in data['data']:
                payment_methods.append({
                    'id': method.get('id'),
                    'description': method.get('description', '').lower(),
                    'name': method.get('name', '').lower()
                })
        
        # Procurar por cartões específicos
        cartao_itau = None
        cartao_vexpenses = None
        
        for method in payment_methods:
            desc = method['description']
            if 'itau' in desc or 'itaú' in desc:
                cartao_itau = method
                print(f"🎯 CARTÃO ITAÚ ENCONTRADO: {method}")
            if 'vexpenses' in desc or 'cartão vexpenses' in desc:
                cartao_vexpenses = method
                print(f"🎯 CARTÃO VEXPENSES ENCONTRADO: {method}")
        
        return payment_methods, cartao_itau, cartao_vexpenses
    
    return [], None, None

def investigate_expenses_by_payment_method(payment_methods, cartao_itau, cartao_vexpenses):
    """Investiga expenses por método de pagamento específico"""
    print("\n💰 INVESTIGANDO EXPENSES POR MÉTODO DE PAGAMENTO")
    
    target_users = [895945, 895946, 895947]
    results = {}
    
    # Testar cada método de pagamento
    for method in payment_methods[:10]:  # Primeiros 10 para não sobrecarregar
        method_id = method['id']
        method_name = method['description']
        
        print(f"\n🔍 Testando método: {method_name}")
        
        # Buscar expenses deste método no período de Abril
        params = {
            'search': f'date:2026-04-01,2026-04-15;payment_method_id:{method_id}',
            'searchFields': 'date:between;payment_method_id:=',
            'searchJoin': 'and',
            'paginate': 'true',
            'page': '1',
            'per_page': '100',
            'include': 'user,payment_method'
        }
        
        result = test_endpoint(f"{BASE_URL}/expenses", params, f"Expenses com {method_name}")
        
        if result['success']:
            data = result['data']
            expenses = data.get('data', [])
            
            print(f"  ✅ {len(expenses)} expenses encontradas")
            
            # Filtrar nossos usuários alvo
            user_expenses = {}
            for expense in expenses:
                user_id = expense.get('user_id')
                if user_id in target_users:
                    if user_id not in user_expenses:
                        user_expenses[user_id] = []
                    user_expenses[user_id].append(expense)
            
            if user_expenses:
                print(f"  📊 Expenses dos nossos usuários:")
                total_by_method = 0
                
                for user_id, user_exp_list in user_expenses.items():
                    total = sum(exp.get('value', 0) for exp in user_exp_list)
                    total_by_method += total
                    print(f"    User {user_id}: {len(user_exp_list)} expenses = R$ {total:.2f}")
                    
                    # Guardar para análise
                    if method_id not in results:
                        results[method_id] = {}
                    results[method_id][user_id] = {
                        'method_name': method_name,
                        'total': total,
                        'count': len(user_exp_list),
                        'expenses': user_exp_list
                    }
                
                print(f"  💰 Total por método: R$ {total_by_method:.2f}")
    
    return results

def investigate_team_members_complete():
    """Investiga team members com todos os includes possíveis"""
    print("\n👥 INVESTIGANDO TEAM MEMBERS COMPLETOS")
    
    includes_list = [
        'costs_center',
        'manager',
        'supervisor', 
        'department',
        'hierarchy',
        'card',
        'card_status',
        'all',
        'costs_center,manager',
        'costs_center,manager,supervisor',
        'costs_center,manager,supervisor,department',
        'costs_center,card',
        'manager,supervisor',
        'manager,supervisor,department'
    ]
    
    target_users = [895945, 895946, 895947]
    user_data = {}
    
    for include in includes_list:
        print(f"\n🔍 Testando include: {include}")
        
        params = {
            'paginate': 'false',
            'per_page': '1000',
            'include': include
        }
        
        result = test_endpoint(f"{BASE_URL}/team-members", params, f"Team members com {include}")
        
        if result['success']:
            data = result['data']
            members = data.get('data', [])
            
            print(f"  ✅ {len(members)} members encontrados")
            
            # Filtrar nossos usuários
            for member in members:
                user_id = member.get('id')
                if user_id in target_users:
                    if user_id not in user_data:
                        user_data[user_id] = {}
                    
                    user_data[user_id][include] = member
                    
                    # Analisar campos valiosos
                    valuable_fields = []
                    for key, value in member.items():
                        if any(keyword in str(key).lower() for keyword in [
                            'manager', 'gestor', 'supervisor', 'director', 'direção',
                            'code', 'cod', 'card', 'status', 'department', 'hierarchy'
                        ]):
                            valuable_fields.append(f"{key}: {value}")
                    
                    if valuable_fields:
                        print(f"    🎯 User {user_id}: {', '.join(valuable_fields[:3])}")
    
    return user_data

def investigate_cost_centers_deep():
    """Investiga centros de custo em profundidade"""
    print("\n🏢 INVESTIGANDO CENTROS DE CUSTO EM PROFUNDIDADE")
    
    params_list = [
        {'paginate': 'false', 'per_page': 100},
        {'paginate': 'false', 'per_page': 100, 'include': 'code'},
        {'paginate': 'false', 'per_page': 100, 'include': 'manager'},
        {'paginate': 'false', 'per_page': 100, 'include': 'supervisor'},
        {'paginate': 'false', 'per_page': 100, 'include': 'department'},
        {'paginate': 'false', 'per_page': 100, 'include': 'all'},
        {'paginate': 'false', 'per_page': 100, 'show_code': 'true'},
        {'paginate': 'false', 'per_page': 100, 'fields': 'code,name,manager'},
        {'paginate': 'false', 'per_page': 100, 'include': 'manager,supervisor,department'},
        {'paginate': 'false', 'per_page': 100, 'show_manager': 'true'},
        {'paginate': 'false', 'per_page': 100, 'show_supervisor': 'true'}
    ]
    
    cost_centers_data = {}
    
    for i, params in enumerate(params_list, 1):
        print(f"\n🔍 Teste {i}/{len(params_list)}: {params}")
        
        result = test_endpoint(f"{BASE_URL}/costs-centers", params, f"Cost centers teste {i}")
        
        if result['success']:
            data = result['data']
            centers = data.get('data', [])
            
            print(f"  ✅ {len(centers)} centros encontrados")
            
            # Analisar estrutura
            if centers:
                sample = centers[0]
                print(f"  📋 Campos: {list(sample.keys())}")
                
                # Procurar campos valiosos
                valuable_fields = []
                for key, value in sample.items():
                    if any(keyword in str(key).lower() for keyword in [
                        'code', 'cod', 'manager', 'gestor', 'supervisor', 
                        'director', 'department', 'hierarchy'
                    ]):
                        valuable_fields.append(key)
                
                if valuable_fields:
                    print(f"  🎯 Campos valiosos: {valuable_fields}")
                
                cost_centers_data[f"teste_{i}"] = {
                    'params': params,
                    'count': len(centers),
                    'fields': list(sample.keys()),
                    'valuable_fields': valuable_fields,
                    'sample': sample
                }
    
    return cost_centers_data

def investigate_user_specific_endpoints():
    """Investiga endpoints específicos dos usuários"""
    print("\n🎯 INVESTIGANDO ENDPOINTS ESPECÍFICOS DOS USUÁRIOS")
    
    target_users = [895945, 895946, 895947]
    user_specific_data = {}
    
    for user_id in target_users:
        print(f"\n👤 INVESTIGANDO USER {user_id}")
        
        # Lista de endpoints específicos do usuário
        user_endpoints = [
            f'team-members/{user_id}',
            f'users/{user_id}',
            f'expenses/user/{user_id}',
            f'reports/user/{user_id}',
            f'advances/user/{user_id}',
            f'payments/user/{user_id}',
            f'cards/user/{user_id}',
            f'balance/user/{user_id}'
        ]
        
        user_data = {}
        
        for endpoint in user_endpoints:
            print(f"  🔍 Testando: {endpoint}")
            
            result = test_endpoint(f"{BASE_URL}/{endpoint}", description=f"User {user_id} - {endpoint}")
            
            if result['success']:
                data = result['data']
                print(f"    ✅ SUCESSO: {endpoint}")
                
                # Analisar estrutura
                if isinstance(data, dict):
                    print(f"    📋 Campos: {list(data.keys())}")
                    
                    # Procurar campos valiosos
                    valuable_data = {}
                    for key, value in data.items():
                        if any(keyword in str(key).lower() for keyword in [
                            'manager', 'gestor', 'supervisor', 'director', 'direção',
                            'code', 'cod', 'card', 'status', 'department',
                            'advance', 'adiantamento', 'payment', 'balance',
                            'saldo', 'limit', 'credit'
                        ]):
                            valuable_data[key] = value
                    
                    if valuable_data:
                        print(f"    🎯 Dados valiosos: {len(valuable_data)} campos")
                        for key, value in list(valuable_data.items())[:3]:
                            print(f"      {key}: {value}")
                    
                    user_data[endpoint] = valuable_data
                else:
                    print(f"    📋 Tipo de dado: {type(data)}")
                    if isinstance(data, list) and data:
                        print(f"    📋 Primeiro item campos: {list(data[0].keys()) if data[0] else []}")
            
            else:
                print(f"    ❌ ERRO: {result.get('error', 'Unknown error')}")
        
        user_specific_data[user_id] = user_data
    
    return user_specific_data

def investigate_expenses_advanced():
    """Investiga expenses com filtros avançados"""
    print("\n💰 INVESTIGANDO EXPENSES COM FILTROS AVANÇADOS")
    
    target_users = [895945, 895946, 895947]
    
    # Filtros avançados para encontrar dados específicos
    advanced_filters = [
        # Filtro por cartão Itaú
        {
            'search': 'date:2026-04-01,2026-04-15;payment_method.description:itau',
            'searchFields': 'date:between;payment_method.description:contains',
            'searchJoin': 'and',
            'paginate': 'true',
            'page': '1',
            'per_page': '100',
            'include': 'user,payment_method'
        },
        # Filtro por cartão VExpenses
        {
            'search': 'date:2026-04-01,2026-04-15;payment_method.description:vexpenses',
            'searchFields': 'date:between;payment_method.description:contains',
            'searchJoin': 'and',
            'paginate': 'true',
            'page': '1',
            'per_page': '100',
            'include': 'user,payment_method'
        },
        # Filtro por tipo de cartão
        {
            'search': 'date:2026-04-01,2026-04-15;payment_method.description:cartão',
            'searchFields': 'date:between;payment_method.description:contains',
            'searchJoin': 'and',
            'paginate': 'true',
            'page': '1',
            'per_page': '100',
            'include': 'user,payment_method'
        },
        # Filtro por reembolsável
        {
            'search': 'date:2026-04-01,2026-04-15;reimbursable:true',
            'searchFields': 'date:between;reimbursable:=',
            'searchJoin': 'and',
            'paginate': 'true',
            'page': '1',
            'per_page': '100',
            'include': 'user'
        },
        # Filtro por valor alto
        {
            'search': 'date:2026-04-01,2026-04-15;value:>1000',
            'searchFields': 'date:between;value:>',
            'searchJoin': 'and',
            'paginate': 'true',
            'page': '1',
            'per_page': '100',
            'include': 'user'
        }
    ]
    
    expenses_results = {}
    
    for i, params in enumerate(advanced_filters, 1):
        print(f"\n🔍 Filtro avançado {i}/{len(advanced_filters)}")
        print(f"   📋 {params}")
        
        result = test_endpoint(f"{BASE_URL}/expenses", params, f"Filtro avançado {i}")
        
        if result['success']:
            data = result['data']
            expenses = data.get('data', [])
            
            print(f"  ✅ {len(expenses)} expenses encontradas")
            
            # Filtrar nossos usuários
            user_expenses = {}
            for expense in expenses:
                user_id = expense.get('user_id')
                if user_id in target_users:
                    if user_id not in user_expenses:
                        user_expenses[user_id] = []
                    user_expenses[user_id].append(expense)
            
            if user_expenses:
                print(f"  📊 Nossos usuários:")
                for user_id, exp_list in user_expenses.items():
                    total = sum(exp.get('value', 0) for exp in exp_list)
                    print(f"    User {user_id}: {len(exp_list)} expenses = R$ {total:.2f}")
                    
                    # Analisar métodos de pagamento
                    payment_methods = {}
                    for exp in exp_list:
                        pm = exp.get('payment_method')
                        if pm and 'data' in pm:
                            pm_name = pm['data'].get('description', 'Unknown')
                            if pm_name not in payment_methods:
                                payment_methods[pm_name] = 0
                            payment_methods[pm_name] += exp.get('value', 0)
                    
                    if payment_methods:
                        print(f"      💳 Métodos: {list(payment_methods.keys())}")
                
                expenses_results[f"filtro_{i}"] = {
                    'params': params,
                    'user_expenses': user_expenses
                }
    
    return expenses_results

def main():
    """Função principal - investigação completa"""
    print("🚀 INVESTIGAÇÃO ULTIMATIVA - 100% DOS DADOS OU NADA!")
    print("="*80)
    print("NÃO VOU PARAR ATÉ CONSEGUIR TODOS OS CAMPOS DA PLANILHA!")
    print()
    
    start_time = datetime.now()
    
    # 1. Investigar métodos de pagamento
    payment_methods, cartao_itau, cartao_vexpenses = investigate_payment_methods()
    
    # 2. Investigar expenses por método de pagamento
    expenses_by_payment = investigate_expenses_by_payment_method(payment_methods, cartao_itau, cartao_vexpenses)
    
    # 3. Investigar team members completos
    team_members_data = investigate_team_members_complete()
    
    # 4. Investigar centros de custo profundos
    cost_centers_data = investigate_cost_centers_deep()
    
    # 5. Investigar endpoints específicos dos usuários
    user_specific_data = investigate_user_specific_endpoints()
    
    # 6. Investigar expenses com filtros avançados
    expenses_advanced = investigate_expenses_advanced()
    
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    
    # Compilar todos os resultados
    ultimate_results = {
        'investigation_summary': {
            'start_time': start_time.isoformat(),
            'end_time': end_time.isoformat(),
            'duration_seconds': duration,
            'planilha_target': PLANILHA_TARGET
        },
        'payment_methods': {
            'methods': payment_methods,
            'cartao_itau': cartao_itau,
            'cartao_vexpenses': cartao_vexpenses
        },
        'expenses_by_payment': expenses_by_payment,
        'team_members_data': team_members_data,
        'cost_centers_data': cost_centers_data,
        'user_specific_data': user_specific_data,
        'expenses_advanced': expenses_advanced
    }
    
    # Salvar resultados
    with open('ULTIMATE_INVESTIGATION_RESULTS.json', 'w', encoding='utf-8') as f:
        json.dump(ultimate_results, f, ensure_ascii=False, indent=2, default=str)
    
    print(f"\n{'='*80}")
    print("🏆 INVESTIGAÇÃO ULTIMATIVA CONCLUÍDA!")
    print("="*80)
    print(f"⏱️  Duração: {duration:.1f} segundos")
    print(f"📁 Resultados: ULTIMATE_INVESTIGATION_RESULTS.json")
    print(f"🎯 MÉTODOS DE PAGAMENTO: {len(payment_methods)}")
    print(f"👥 TEAM MEMBERS: {len(team_members_data)} usuários analisados")
    print(f"🏢 CENTROS DE CUSTO: {len(cost_centers_data)} testes")
    print(f"🎯 ENDPOINTS ESPECÍFICOS: {len(user_specific_data)} usuários")
    print(f"💰 EXPENSES AVANÇADAS: {len(expenses_advanced)} filtros")
    
    print(f"\n🚀 AGORA VOU ANALISAR TUDO E IMPLEMENTAR A SOLUÇÃO 100%!")

if __name__ == "__main__":
    main()