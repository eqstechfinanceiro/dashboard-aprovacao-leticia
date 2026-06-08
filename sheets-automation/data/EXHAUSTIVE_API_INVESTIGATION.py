"""
INVESTIGAÇÃO EXAUSTIVA - 100% DOS DADOS DA PLANILHA QUINZENAL
Meta: Todos os campos da planilha 1QZ ABRIL 2026 validados contra API VExpenses
Abordagem: Testar absolutamente tudo, sem limites de tempo ou esforço
"""

import requests
import json
import pandas as pd
from datetime import datetime
import time

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

# Dados EXATOS da planilha 1QZ ABRIL 2026 - Nossa verdade absoluta
PLANILHA_ABRL_2026_EXACT = {
    'JONAS CAVALCANTI': {
        'user_id': 895945,
        'cpf': None,  # Verificar na API
        'status_colab': 'ATIVO',
        'centro_custo': None,  # Verificar na API
        'cod_centro_custo': None,
        'gestor': None,
        'direcao': None,
        'status_cartao': 'Cartão ativo',
        'obs': None,
        'regional': None,
        'quinzena_qz': 1750.00,
        'saldo_final': 6945.16,
        'saldo_cartao': 15.21,
        'saldo_reembolsar': -98.92,
        'adiantamento': 0.00,
        'carga_parcial': 0.00,
        'reembolso': 49.46,
        'carga_final': 49.46
    },
    'RODRIGO CESAR': {
        'user_id': 895946,
        'cpf': None,
        'status_colab': 'ATIVO',
        'centro_custo': None,
        'cod_centro_custo': None,
        'gestor': None,
        'direcao': None,
        'status_cartao': 'Cartão ativo',
        'obs': None,
        'regional': None,
        'quinzena_qz': 700.00,
        'saldo_final': 6626.04,
        'saldo_cartao': 0.00,
        'saldo_reembolsar': -428.82,
        'adiantamento': 0.00,
        'carga_parcial': 0.00,
        'reembolso': 214.41,
        'carga_final': 214.41
    },
    'CAIO FRANCESCONI': {
        'user_id': 895947,
        'cpf': None,
        'status_colab': 'ATIVO',
        'centro_custo': None,
        'cod_centro_custo': None,
        'gestor': None,
        'direcao': None,
        'status_cartao': 'Cartão ativo',
        'obs': None,
        'regional': None,
        'quinzena_qz': 3900.00,
        'saldo_final': 6504.20,
        'saldo_cartao': 0.00,
        'saldo_reembolsar': 1154.94,
        'adiantamento': 0.00,
        'carga_parcial': 0.00,
        'reembolso': 577.47,
        'carga_final': 577.47
    }
}

class ExhaustiveInvestigator:
    def __init__(self):
        self.test_results = []
        self.successful_endpoints = []
        self.failed_attempts = []
        self.discovered_data = {}
        self.investigation_log = []
        
    def log(self, message, level="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_entry = f"[{timestamp}] {level}: {message}"
        print(log_entry)
        self.investigation_log.append(log_entry)
        
    def test_endpoint_exhaustive(self, endpoint, params_list, description):
        """Testa endpoint com lista exaustiva de parâmetros"""
        self.log(f"INVESTIGANDO: {endpoint} - {description}")
        
        results = []
        
        for i, params in enumerate(params_list, 1):
            self.log(f"  Teste {i}/{len(params_list)}: {params}")
            
            try:
                response = requests.get(f"{BASE_URL}/{endpoint}", 
                                     headers=headers, params=params, timeout=15)
                
                if response.status_code == 200:
                    data = response.json()
                    
                    if 'data' in data and data['data']:
                        result = {
                            'params': params,
                            'status': 'SUCCESS',
                            'data_count': len(data['data']),
                            'sample_data': data['data'][:2],
                            'response_structure': list(data.keys()),
                            'data_fields': list(data['data'][0].keys()) if data['data'] else []
                        }
                        results.append(result)
                        self.log(f"    ✅ SUCESSO: {len(data['data'])} registros")
                        
                        # Analisar estrutura dos dados
                        self.analyze_data_structure(endpoint, params, data['data'][0] if data['data'] else {})
                        
                    else:
                        result = {
                            'params': params,
                            'status': 'EMPTY',
                            'response_structure': list(data.keys())
                        }
                        results.append(result)
                        self.log(f"    ⚠️ VAZIO: Sem dados")
                        
                else:
                    result = {
                        'params': params,
                        'status': 'ERROR',
                        'error_code': response.status_code,
                        'error_message': response.text[:200]
                    }
                    results.append(result)
                    self.log(f"    ❌ ERRO: {response.status_code}")
                    
            except Exception as e:
                result = {
                    'params': params,
                    'status': 'EXCEPTION',
                    'error': str(e)
                }
                results.append(result)
                self.log(f"    ❌ EXCEÇÃO: {e}")
            
            time.sleep(0.3)  # Rate limiting
        
        return results
    
    def analyze_data_structure(self, endpoint, params, sample_data):
        """Analisa estrutura de dados para encontrar campos valiosos"""
        
        valuable_fields = []
        
        for key, value in sample_data.items():
            # Campos potencialmente úteis
            if any(keyword in str(key).lower() for keyword in [
                'manager', 'gestor', 'supervisor', 'director', 'direção',
                'code', 'cod', 'id', 'card', 'cartão', 'status',
                'note', 'obs', 'observation', 'comment',
                'advance', 'adiantamento', 'anticipation',
                'payment', 'pagamento', 'bank', 'banco',
                'hierarchy', 'organizational', 'department'
            ]):
                valuable_fields.append({
                    'field': key,
                    'value': value,
                    'type': type(value).__name__
                })
        
        if valuable_fields:
            self.log(f"    🎯 CAMPOS VALIOSOS ENCONTRADOS:")
            for field in valuable_fields:
                self.log(f"      • {field['field']}: {field['value']} ({field['type']})")
            
            self.discovered_data[f"{endpoint}_{str(params)}"] = valuable_fields
    
    def investigate_payment_methods(self):
        """Investiga métodos de pagamento (cartão itaú, vexpenses, etc)"""
        self.log("="*80)
        self.log("INVESTIGAÇÃO EXAUSTIVA - MÉTODOS DE PAGAMENTO")
        self.log("="*80)
        
        # 1. Endpoint payment_methods
        payment_params = [
            {'paginate': 'false', 'per_page': 100},
            {'paginate': 'false', 'per_page': 100, 'include': 'card'},
            {'paginate': 'false', 'per_page': 100, 'include': 'bank'},
            {'paginate': 'false', 'per_page': 100, 'include': 'all'},
            {'paginate': 'false', 'per_page': 100, 'type': 'card'},
            {'paginate': 'false', 'per_page': 100, 'type': 'bank'},
        ]
        
        payment_results = self.test_endpoint_exhaustive('payment-methods', payment_params, 
                                                      "Métodos de pagamento")
        
        # 2. Testar expenses filtradas por payment_method
        self.log("\n🔍 TESTANDO EXPENSES POR MÉTODO DE PAGAMENTO")
        
        # Primeiro, obter todos os métodos disponíveis
        all_methods = []
        for result in payment_results:
            if result['status'] == 'SUCCESS' and result['sample_data']:
                for method in result['sample_data']:
                    if 'id' in method and 'description' in method:
                        all_methods.append(method)
        
        self.log(f"📋 {len(all_methods)} métodos de pagamento encontrados")
        
        # Testar expenses para cada método
        for method in all_methods[:5]:  # Primeiros 5 para não sobrecarregar
            method_id = method['id']
            method_name = method['description']
            
            self.log(f"\n💳 Testando expenses com método: {method_name} (ID: {method_id})")
            
            expense_params = [
                {
                    'search': f'date:2026-04-01,2026-04-15;payment_method_id:{method_id}',
                    'searchFields': 'date:between;payment_method_id:=',
                    'searchJoin': 'and',
                    'paginate': 'true',
                    'page': '1',
                    'per_page': '50',
                    'include': 'user,payment_method'
                },
                {
                    'search': f'date:2026-04-01,2026-04-15;payment_method_id:{method_id}',
                    'searchFields': 'date:between;payment_method_id:=',
                    'searchJoin': 'and',
                    'paginate': 'true',
                    'page': '1',
                    'per_page': '50',
                    'include': 'user,payment_method,costs_center'
                }
            ]
            
            method_results = self.test_endpoint_exhaustive('expenses', expense_params,
                                                          f"Expenses com {method_name}")
            
            # Analisar resultados para nossos usuários
            for result in method_results:
                if result['status'] == 'SUCCESS' and result['sample_data']:
                    user_expenses = {}
                    for expense in result['sample_data']:
                        user_id = expense.get('user_id')
                        if user_id in [895945, 895946, 895947]:
                            if user_id not in user_expenses:
                                user_expenses[user_id] = []
                            user_expenses[user_id].append(expense)
                    
                    if user_expenses:
                        self.log(f"    📊 Expenses encontradas para nossos usuários:")
                        for user_id, expenses in user_expenses.items():
                            total = sum(exp.get('value', 0) for exp in expenses)
                            self.log(f"      User {user_id}: {len(expenses)} expenses = R$ {total:.2f}")
    
    def investigate_card_data(self):
        """Investiga dados de cartões corporativos"""
        self.log("="*80)
        self.log("INVESTIGAÇÃO EXAUSTIVA - DADOS DE CARTÕES")
        self.log("="*80)
        
        # Testar múltiplos endpoints de cartão
        card_endpoints = [
            ('corporate-cards', "Cartões corporativos"),
            ('credit-cards', "Cartões de crédito"),
            ('cards', "Cartões gerais"),
            ('team-members-cards', "Cartões de team members"),
        ]
        
        for endpoint, description in card_endpoints:
            self.log(f"\n🔍 Investigando: {description}")
            
            card_params = [
                {'paginate': 'false', 'per_page': 100},
                {'paginate': 'false', 'per_page': 100, 'include': 'user'},
                {'paginate': 'false', 'per_page': 100, 'include': 'user,status'},
                {'paginate': 'false', 'per_page': 100, 'include': 'all'},
                {'paginate': 'false', 'per_page': 100, 'show_status': 'true'},
                {'paginate': 'false', 'per_page': 100, 'active': 'true'},
            ]
            
            results = self.test_endpoint_exhaustive(endpoint, card_params, description)
            
            # Analisar se encontrou dados dos nossos usuários
            for result in results:
                if result['status'] == 'SUCCESS' and result['sample_data']:
                    for card in result['sample_data']:
                        if 'user_id' in card and card['user_id'] in [895945, 895946, 895947]:
                            self.log(f"    🎯 Cartão encontrado para User {card['user_id']}:")
                            for key, value in card.items():
                                self.log(f"      {key}: {value}")
    
    def investigate_organizational_structure(self):
        """Investiga estrutura organizacional para gestores e direção"""
        self.log("="*80)
        self.log("INVESTIGAÇÃO EXAUSTIVA - ESTRUTURA ORGANIZACIONAL")
        self.log("="*80)
        
        # Testar endpoints organizacionais
        org_endpoints = [
            ('departments', "Departamentos"),
            ('organizations', "Organizações"),
            ('hierarchy', "Hierarquia"),
            ('managers', "Gestores"),
            ('supervisors', "Supervisores"),
        ]
        
        for endpoint, description in org_endpoints:
            self.log(f"\n🔍 Investigando: {description}")
            
            org_params = [
                {'paginate': 'false', 'per_page': 100},
                {'paginate': 'false', 'per_page': 100, 'include': 'manager'},
                {'paginate': 'false', 'per_page': 100, 'include': 'supervisor'},
                {'paginate': 'false', 'per_page': 100, 'include': 'all'},
                {'paginate': 'false', 'per_page': 100, 'show_hierarchy': 'true'},
            ]
            
            self.test_endpoint_exhaustive(endpoint, org_params, description)
    
    def investigate_cost_centers_deep(self):
        """Investiga centros de custo em profundidade"""
        self.log("="*80)
        self.log("INVESTIGAÇÃO EXAUSTIVA - CENTROS DE CUSTO")
        self.log("="*80)
        
        # Parâmetros exaustivos para cost-centers
        cc_params = [
            {'paginate': 'false', 'per_page': 100},
            {'paginate': 'false', 'per_page': 100, 'include': 'code'},
            {'paginate': 'false', 'per_page': 100, 'include': 'manager'},
            {'paginate': 'false', 'per_page': 100, 'include': 'supervisor'},
            {'paginate': 'false', 'per_page': 100, 'include': 'department'},
            {'paginate': 'false', 'per_page': 100, 'include': 'all'},
            {'paginate': 'false', 'per_page': 100, 'show_code': 'true'},
            {'paginate': 'false', 'per_page': 100, 'fields': 'code,name,manager'},
            {'paginate': 'false', 'per_page': 100, 'include': 'manager,supervisor,department'},
        ]
        
        results = self.test_endpoint_exhaustive('costs-centers', cc_params, "Centros de custo")
        
        # Analisar centros de custo dos nossos usuários
        self.log("\n🔍 ANALISANDO CENTROS DE CUSTO DOS USUÁRIOS")
        
        # Obter team members para saber os centros de custo
        tm_params = [
            {'paginate': 'false', 'per_page': 100, 'include': 'costs_center'},
            {'paginate': 'false', 'per_page': 100, 'include': 'all'},
        ]
        
        tm_results = self.test_endpoint_exhaustive('team-members', tm_params, "Team members com centros de custo")
        
        for result in tm_results:
            if result['status'] == 'SUCCESS' and result['sample_data']:
                for tm in result['sample_data']:
                    if tm.get('id') in [895945, 895946, 895947]:
                        self.log(f"👤 User {tm['id']} - {tm.get('name', 'Unknown')}:")
                        if 'costs_center' in tm and tm['costs_center']:
                            cc = tm['costs_center']
                            if isinstance(cc, dict) and 'data' in cc:
                                cc_data = cc['data']
                                self.log(f"   🏢 Centro de Custo:")
                                for key, value in cc_data.items():
                                    self.log(f"      {key}: {value}")
    
    def investigate_advances_and_payments(self):
        """Investiga adiantamentos e pagamentos"""
        self.log("="*80)
        self.log("INVESTIGAÇÃO EXAUSTIVA - ADIANTAMENTOS E PAGAMENTOS")
        self.log("="*80)
        
        # Testar endpoints de adiantamentos
        advance_params = [
            {'paginate': 'false', 'per_page': 100},
            {'paginate': 'false', 'per_page': 100, 'include': 'user'},
            {'paginate': 'false', 'per_page': 100, 'include': 'payment'},
            {'paginate': 'false', 'per_page': 100, 'include': 'all'},
        ]
        
        advance_endpoints = [
            ('advances', "Adiantamentos"),
            ('anticipations', "Antecipações"),
            ('payments', "Pagamentos"),
            ('advances-requests', "Solicitações de adiantamento"),
        ]
        
        for endpoint, description in advance_endpoints:
            self.log(f"\n🔍 Investigando: {description}")
            self.test_endpoint_exhaustive(endpoint, advance_params, description)
        
        # Testar expenses com filtros de adiantamento
        self.log("\n💰 TESTANDO EXPENSES COM FILTROS DE ADIANTAMENTO")
        
        advance_expense_params = [
            {
                'search': 'date:2026-04-01,2026-04-15;title:adiantamento',
                'searchFields': 'date:between;title:contains',
                'searchJoin': 'and',
                'paginate': 'true',
                'page': '1',
                'per_page': '50',
                'include': 'user'
            },
            {
                'search': 'date:2026-04-01,2026-04-15;title:advance',
                'searchFields': 'date:between;title:contains',
                'searchJoin': 'and',
                'paginate': 'true',
                'page': '1',
                'per_page': '50',
                'include': 'user'
            },
            {
                'search': 'date:2026-04-01,2026-04-15;title:anticipation',
                'searchFields': 'date:between;title:contains',
                'searchJoin': 'and',
                'paginate': 'true',
                'page': '1',
                'per_page': '50',
                'include': 'user'
            }
        ]
        
        self.test_endpoint_exhaustive('expenses', advance_expense_params, 
                                      "Expenses com termos de adiantamento")
    
    def investigate_user_specific_data(self):
        """Investiga dados específicos dos usuários alvo"""
        self.log("="*80)
        self.log("INVESTIGAÇÃO EXAUSTIVA - DADOS ESPECÍFICOS DOS USUÁRIOS")
        self.log("="*80)
        
        target_users = [895945, 895946, 895947]
        
        for user_id in target_users:
            self.log(f"\n👤 INVESTIGANDO USER {user_id}")
            
            # Testar endpoints específicos do usuário
            user_endpoints = [
                f'team-members/{user_id}',
                f'users/{user_id}',
                f'expenses/user/{user_id}',
                f'reports/user/{user_id}',
                f'advances/user/{user_id}',
                f'payments/user/{user_id}',
            ]
            
            for endpoint in user_endpoints:
                self.log(f"  🔍 Testando: {endpoint}")
                
                try:
                    response = requests.get(f"{BASE_URL}/{endpoint}", 
                                         headers=headers, timeout=10)
                    
                    if response.status_code == 200:
                        data = response.json()
                        self.log(f"    ✅ SUCESSO: {endpoint}")
                        
                        if 'data' in data:
                            user_data = data['data']
                            if isinstance(user_data, dict):
                                self.log(f"    📋 Campos encontrados: {list(user_data.keys())}")
                                
                                # Campos valiosos
                                for key, value in user_data.items():
                                    if any(keyword in str(key).lower() for keyword in [
                                        'manager', 'gestor', 'supervisor', 'director',
                                        'code', 'cod', 'card', 'status',
                                        'advance', 'adiantamento', 'payment'
                                    ]):
                                        self.log(f"      🎯 {key}: {value}")
                    
                    else:
                        self.log(f"    ❌ ERRO: {response.status_code}")
                        
                except Exception as e:
                    self.log(f"    ❌ EXCEÇÃO: {e}")
            
            # Testar expenses do usuário com diferentes filtros
            self.log(f"  💰 Testando expenses do User {user_id}")
            
            expense_filters = [
                {
                    'search': f'date:2026-04-01,2026-04-15;user_id:{user_id}',
                    'searchFields': 'date:between;user_id:=',
                    'searchJoin': 'and',
                    'paginate': 'true',
                    'page': '1',
                    'per_page': '100',
                    'include': 'payment_method,costs_center'
                },
                {
                    'search': f'date:2026-04-01,2026-04-15;user_id:{user_id};reimbursable:true',
                    'searchFields': 'date:between;user_id:=;reimbursable:=',
                    'searchJoin': 'and',
                    'paginate': 'true',
                    'page': '1',
                    'per_page': '100'
                },
                {
                    'search': f'date:2026-04-01,2026-04-15;user_id:{user_id}',
                    'searchFields': 'date:between;user_id:=',
                    'searchJoin': 'and',
                    'paginate': 'true',
                    'page': '1',
                    'per_page': '100',
                    'include': 'all'
                }
            ]
            
            for i, params in enumerate(expense_filters, 1):
                self.log(f"    🔍 Filtro {i}: {params}")
                
                try:
                    response = requests.get(f"{BASE_URL}/expenses", 
                                         headers=headers, params=params, timeout=10)
                    
                    if response.status_code == 200:
                        data = response.json()
                        if 'data' in data and data['data']:
                            self.log(f"      ✅ {len(data['data'])} expenses encontradas")
                            
                            # Analisar valores
                            total = sum(exp.get('value', 0) for exp in data['data'])
                            reimbursable_total = sum(exp.get('value', 0) for exp in data['data'] if exp.get('reimbursable'))
                            
                            self.log(f"      💰 Total: R$ {total:.2f}")
                            self.log(f"      🔄 Reembolsável: R$ {reimbursable_total:.2f}")
                            
                            # Analisar métodos de pagamento
                            payment_methods = {}
                            for exp in data['data']:
                                pm = exp.get('payment_method')
                                if pm and 'data' in pm:
                                    pm_name = pm['data'].get('description', 'Unknown')
                                    if pm_name not in payment_methods:
                                        payment_methods[pm_name] = 0
                                    payment_methods[pm_name] += exp.get('value', 0)
                            
                            if payment_methods:
                                self.log(f"      💳 Métodos de pagamento:")
                                for method, amount in payment_methods.items():
                                    self.log(f"        {method}: R$ {amount:.2f}")
                    
                except Exception as e:
                    self.log(f"      ❌ Erro no filtro {i}: {e}")
    
    def investigate_reports_and_documents(self):
        """Investiga reports e documentos que possam conter os dados"""
        self.log("="*80)
        self.log("INVESTIGAÇÃO EXAUSTIVA - REPORTS E DOCUMENTOS")
        self.log("="*80)
        
        # Testar diferentes tipos de reports
        report_params = [
            {'paginate': 'false', 'per_page': 100},
            {'paginate': 'false', 'per_page': 100, 'include': 'user'},
            {'paginate': 'false', 'per_page': 100, 'include': 'all'},
            {'paginate': 'false', 'per_page': 100, 'type': 'card'},
            {'paginate': 'false', 'per_page': 100, 'type': 'financial'},
            {'paginate': 'false', 'per_page': 100, 'type': 'summary'},
        ]
        
        self.test_endpoint_exhaustive('reports', report_params, "Reports gerais")
        
        # Testar reports específicos dos usuários
        self.log("\n👤 TESTANDO REPORTS ESPECÍFICOS DOS USUÁRIOS")
        
        for user_id in [895945, 895946, 895947]:
            self.log(f"\n🔍 Reports do User {user_id}:")
            
            user_report_params = [
                {
                    'search': f'user_id:{user_id};date:2026-04-01,2026-04-15',
                    'searchFields': 'user_id:=;date:between',
                    'searchJoin': 'and',
                    'paginate': 'true',
                    'page': '1',
                    'per_page': '50'
                },
                {
                    'search': f'user_id:{user_id}',
                    'searchFields': 'user_id:=',
                    'searchJoin': 'and',
                    'paginate': 'true',
                    'page': '1',
                    'per_page': '50',
                    'include': 'all'
                }
            ]
            
            self.test_endpoint_exhaustive('reports', user_report_params, 
                                          f"Reports do User {user_id}")
    
    def run_complete_investigation(self):
        """Executa investigação completa e exaustiva"""
        self.log("🚀 INICIANDO INVESTIGAÇÃO EXAUSTIVA COMPLETA")
        self.log("="*80)
        self.log("META: 100% dos dados da planilha 1QZ ABRIL 2026")
        self.log("ABORDAGEM: Testar absolutamente tudo sem limites")
        self.log()
        
        start_time = datetime.now()
        
        # 1. Investigar métodos de pagamento
        self.investigate_payment_methods()
        
        # 2. Investigar dados de cartões
        self.investigate_card_data()
        
        # 3. Investigar estrutura organizacional
        self.investigate_organizational_structure()
        
        # 4. Investigar centros de custo em profundidade
        self.investigate_cost_centers_deep()
        
        # 5. Investigar adiantamentos e pagamentos
        self.investigate_advances_and_payments()
        
        # 6. Investigar dados específicos dos usuários
        self.investigate_user_specific_data()
        
        # 7. Investigar reports e documentos
        self.investigate_reports_and_documents()
        
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        # Compilar resultados completos
        investigation_results = {
            'investigation_metadata': {
                'start_time': start_time.isoformat(),
                'end_time': end_time.isoformat(),
                'duration_seconds': duration,
                'total_tests': len(self.investigation_log),
                'successful_endpoints': len(self.successful_endpoints),
                'discovered_data_points': len(self.discovered_data)
            },
            'planilha_reference': PLANILHA_ABRL_2026_EXACT,
            'discovered_data': self.discovered_data,
            'investigation_log': self.investigation_log,
            'next_steps': []
        }
        
        # Salvar resultados completos
        with open('EXHAUSTIVE_INVESTIGATION_RESULTS.json', 'w', encoding='utf-8') as f:
            json.dump(investigation_results, f, ensure_ascii=False, indent=2, default=str)
        
        self.log("="*80)
        self.log("🏆 INVESTIGAÇÃO EXAUSTIVA CONCLUÍDA")
        self.log("="*80)
        self.log(f"⏱️  Duração: {duration:.1f} segundos")
        self.log(f"🔍 Testes realizados: {len(self.investigation_log)}")
        self.log(f"📊 Dados descobertos: {len(self.discovered_data)}")
        self.log(f"📁 Resultados salvos: EXHAUSTIVE_INVESTIGATION_RESULTS.json")
        
        return investigation_results

def main():
    """Função principal"""
    print("🎯 INVESTIGAÇÃO EXAUSTIVA - 100% DOS DADOS DA PLANILHA")
    print("="*80)
    print("NÃO VOU PARAR ATÉ TER TODOS OS CAMPOS VALIDADOS!")
    print("ABORDAGEM: TESTAR ABSOLUTAMENTE TUDO!")
    print()
    
    investigator = ExhaustiveInvestigator()
    results = investigator.run_complete_investigation()
    
    print("\n🚀 PRÓXIMA FASE: ANÁLISE DOS RESULTADOS E IMPLEMENTAÇÃO")
    print("Vou analisar tudo que descobri e implementar a solução completa!")

if __name__ == "__main__":
    main()