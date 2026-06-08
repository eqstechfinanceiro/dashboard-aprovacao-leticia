"""
SISTEMA DE DESCOBERTA AUTOMÁTICA - QUEBRA DA API VEXPENSES
Implementação completa para encontrar dados ocultos e campos faltantes
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

class APIBreakthroughSystem:
    def __init__(self):
        self.discovered_data = {}
        self.successful_endpoints = []
        self.failed_attempts = []
        
    def test_hidden_parameters(self, base_endpoint, params_list):
        """Testa parâmetros ocultos em endpoints"""
        print(f"🔍 Testando parâmetros ocultos em: {base_endpoint}")
        
        results = []
        
        for params in params_list:
            try:
                response = requests.get(f"{BASE_URL}/{base_endpoint}", 
                                     headers=headers, params=params, timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    if 'data' in data and data['data']:
                        results.append({
                            'params': params,
                            'status': 'SUCCESS',
                            'data_count': len(data['data']),
                            'sample_data': data['data'][:2] if data['data'] else [],
                            'response_keys': list(data.keys())
                        })
                        print(f"  ✅ SUCESSO: {params} -> {len(data['data'])} registros")
                    else:
                        results.append({
                            'params': params,
                            'status': 'EMPTY',
                            'message': 'Sem dados retornados'
                        })
                else:
                    results.append({
                        'params': params,
                        'status': 'ERROR',
                        'error_code': response.status_code,
                        'error_message': response.text[:100]
                    })
                    print(f"  ❌ ERRO: {params} -> {response.status_code}")
                    
            except Exception as e:
                results.append({
                    'params': params,
                    'status': 'EXCEPTION',
                    'error': str(e)
                })
                print(f"  ❌ EXCEÇÃO: {params}")
            
            time.sleep(0.5)  # Rate limiting
        
        return results
    
    def discover_manager_data(self):
        """Descobre dados de gestores e direção"""
        print("\n🎯 DESCOBRINDO DADOS DE GESTORES E DIREÇÃO")
        print("="*50)
        
        # Estratégias para encontrar gestores
        strategies = [
            # Team members com includes diferentes
            {
                'endpoint': 'team-members',
                'params_list': [
                    {'paginate': 'false', 'per_page': 100, 'include': 'manager'},
                    {'paginate': 'false', 'per_page': 100, 'include': 'manager,supervisor'},
                    {'paginate': 'false', 'per_page': 100, 'include': 'hierarchy'},
                    {'paginate': 'false', 'per_page': 100, 'include': 'organization'},
                    {'paginate': 'false', 'per_page': 100, 'show_hierarchy': 'true'},
                    {'paginate': 'false', 'per_page': 100, 'include': 'department'},
                ]
            },
            # Cost centers com dados de gestão
            {
                'endpoint': 'costs-centers',
                'params_list': [
                    {'paginate': 'false', 'per_page': 100, 'include': 'manager'},
                    {'paginate': 'false', 'per_page': 100, 'include': 'supervisor'},
                    {'paginate': 'false', 'per_page': 100, 'include': 'department'},
                    {'paginate': 'false', 'per_page': 100, 'show_manager': 'true'},
                ]
            },
            # Endpoints organizacionais
            {
                'endpoint': 'departments',
                'params_list': [
                    {'paginate': 'false', 'per_page': 100},
                    {'paginate': 'false', 'per_page': 100, 'include': 'manager'},
                ]
            },
            {
                'endpoint': 'organizations',
                'params_list': [
                    {'paginate': 'false', 'per_page': 100},
                    {'paginate': 'false', 'per_page': 100, 'include': 'hierarchy'},
                ]
            }
        ]
        
        manager_data = {}
        
        for strategy in strategies:
            endpoint = strategy['endpoint']
            print(f"\n🔍 Testando endpoint: {endpoint}")
            
            results = self.test_hidden_parameters(endpoint, strategy['params_list'])
            
            # Analisar resultados
            for result in results:
                if result['status'] == 'SUCCESS':
                    # Analisar dados para encontrar campos de gestão
                    sample = result['sample_data'][0] if result['sample_data'] else {}
                    
                    management_fields = []
                    for key, value in sample.items():
                        if any(keyword in str(key).lower() for keyword in 
                              ['manager', 'gestor', 'supervisor', 'director', 'direção', 'hierarchy']):
                            management_fields.append(key)
                    
                    if management_fields:
                        manager_data[endpoint] = {
                            'successful_params': result['params'],
                            'management_fields': management_fields,
                            'data_count': result['data_count'],
                            'sample_data': result['sample_data']
                        }
                        print(f"  🎯 CAMPOS DE GESTÃO ENCONTRADOS: {management_fields}")
        
        return manager_data
    
    def discover_card_status_data(self):
        """Descobre dados de status de cartão"""
        print("\n💳 DESCOBRINDO DADOS DE STATUS DE CARTÃO")
        print("="*50)
        
        strategies = [
            # Corporate cards
            {
                'endpoint': 'corporate-cards',
                'params_list': [
                    {'paginate': 'false', 'per_page': 100},
                    {'paginate': 'false', 'per_page': 100, 'include': 'status'},
                    {'paginate': 'false', 'per_page': 100, 'include': 'user'},
                    {'paginate': 'false', 'per_page': 100, 'include': 'user,status'},
                ]
            },
            # Cards endpoint
            {
                'endpoint': 'cards',
                'params_list': [
                    {'paginate': 'false', 'per_page': 100},
                    {'paginate': 'false', 'per_page': 100, 'include': 'status'},
                    {'paginate': 'false', 'per_page': 100, 'include': 'user'},
                ]
            },
            # Team members com dados de cartão
            {
                'endpoint': 'team-members',
                'params_list': [
                    {'paginate': 'false', 'per_page': 100, 'include': 'card'},
                    {'paginate': 'false', 'per_page': 100, 'include': 'card_status'},
                    {'paginate': 'false', 'per_page': 100, 'show_card': 'true'},
                ]
            }
        ]
        
        card_data = {}
        
        for strategy in strategies:
            endpoint = strategy['endpoint']
            print(f"\n🔍 Testando endpoint: {endpoint}")
            
            results = self.test_hidden_parameters(endpoint, strategy['params_list'])
            
            for result in results:
                if result['status'] == 'SUCCESS':
                    sample = result['sample_data'][0] if result['sample_data'] else {}
                    
                    card_fields = []
                    for key, value in sample.items():
                        if any(keyword in str(key).lower() for keyword in 
                              ['card', 'cartão', 'status', 'active', 'blocked']):
                            card_fields.append(key)
                    
                    if card_fields:
                        card_data[endpoint] = {
                            'successful_params': result['params'],
                            'card_fields': card_fields,
                            'data_count': result['data_count'],
                            'sample_data': result['sample_data']
                        }
                        print(f"  🎯 CAMPOS DE CARTÃO ENCONTRADOS: {card_fields}")
        
        return card_data
    
    def discover_advances_data(self):
        """Descobre dados de adiantamentos"""
        print("\n💰 DESCOBRINDO DADOS DE ADIANTAMENTOS")
        print("="*50)
        
        strategies = [
            # Advances endpoint
            {
                'endpoint': 'advances',
                'params_list': [
                    {'paginate': 'false', 'per_page': 100},
                    {'paginate': 'false', 'per_page': 100, 'include': 'user'},
                    {'paginate': 'false', 'per_page': 100, 'include': 'payment'},
                ]
            },
            # Anticipations
            {
                'endpoint': 'anticipations',
                'params_list': [
                    {'paginate': 'false', 'per_page': 100},
                    {'paginate': 'false', 'per_page': 100, 'include': 'user'},
                ]
            },
            # Payments com tipos específicos
            {
                'endpoint': 'payments',
                'params_list': [
                    {'paginate': 'false', 'per_page': 100, 'type': 'advance'},
                    {'paginate': 'false', 'per_page': 100, 'payment_type': 'adiantamento'},
                    {'paginate': 'false', 'per_page': 100, 'include': 'advance'},
                ]
            },
            # Team members com adiantamentos
            {
                'endpoint': 'team-members',
                'params_list': [
                    {'paginate': 'false', 'per_page': 100, 'include': 'advances'},
                    {'paginate': 'false', 'per_page': 100, 'include': 'anticipations'},
                ]
            }
        ]
        
        advances_data = {}
        
        for strategy in strategies:
            endpoint = strategy['endpoint']
            print(f"\n🔍 Testando endpoint: {endpoint}")
            
            results = self.test_hidden_parameters(endpoint, strategy['params_list'])
            
            for result in results:
                if result['status'] == 'SUCCESS':
                    sample = result['sample_data'][0] if result['sample_data'] else {}
                    
                    advance_fields = []
                    for key, value in sample.items():
                        if any(keyword in str(key).lower() for keyword in 
                              ['advance', 'adiantamento', 'anticipation', 'payment']):
                            advance_fields.append(key)
                    
                    if advance_fields:
                        advances_data[endpoint] = {
                            'successful_params': result['params'],
                            'advance_fields': advance_fields,
                            'data_count': result['data_count'],
                            'sample_data': result['sample_data']
                        }
                        print(f"  🎯 CAMPOS DE ADIANTAMENTO ENCONTRADOS: {advance_fields}")
        
        return advances_data
    
    def discover_cost_center_codes(self):
        """Descobre códigos de centro de custo"""
        print("\n🏢 DESCOBRINDO CÓDIGOS DE CENTRO DE CUSTO")
        print("="*50)
        
        strategies = [
            {
                'endpoint': 'costs-centers',
                'params_list': [
                    {'paginate': 'false', 'per_page': 100, 'include': 'code'},
                    {'paginate': 'false', 'per_page': 100, 'show_code': 'true'},
                    {'paginate': 'false', 'per_page': 100, 'fields': 'code,name'},
                    {'paginate': 'false', 'per_page': 100, 'include': 'all'},
                ]
            }
        ]
        
        code_data = {}
        
        for strategy in strategies:
            endpoint = strategy['endpoint']
            print(f"\n🔍 Testando endpoint: {endpoint}")
            
            results = self.test_hidden_parameters(endpoint, strategy['params_list'])
            
            for result in results:
                if result['status'] == 'SUCCESS':
                    sample = result['sample_data'][0] if result['sample_data'] else {}
                    
                    code_fields = []
                    for key, value in sample.items():
                        if any(keyword in str(key).lower() for keyword in 
                              ['code', 'cod', 'id', 'number']):
                            code_fields.append(key)
                    
                    if code_fields:
                        code_data[endpoint] = {
                            'successful_params': result['params'],
                            'code_fields': code_fields,
                            'data_count': result['data_count'],
                            'sample_data': result['sample_data']
                        }
                        print(f"  🎯 CAMPOS DE CÓDIGO ENCONTRADOS: {code_fields}")
        
        return code_data
    
    def discover_obs_data(self):
        """Descobre dados de observações"""
        print("\n📝 DESCOBRINDO DADOS DE OBSERVAÇÕES")
        print("="*50)
        
        strategies = [
            {
                'endpoint': 'team-members',
                'params_list': [
                    {'paginate': 'false', 'per_page': 100, 'include': 'notes'},
                    {'paginate': 'false', 'per_page': 100, 'include': 'observations'},
                    {'paginate': 'false', 'per_page': 100, 'include': 'comments'},
                    {'paginate': 'false', 'per_page': 100, 'show_obs': 'true'},
                ]
            },
            {
                'endpoint': 'user-notes',
                'params_list': [
                    {'paginate': 'false', 'per_page': 100},
                    {'paginate': 'false', 'per_page': 100, 'include': 'user'},
                ]
            }
        ]
        
        obs_data = {}
        
        for strategy in strategies:
            endpoint = strategy['endpoint']
            print(f"\n🔍 Testando endpoint: {endpoint}")
            
            results = self.test_hidden_parameters(endpoint, strategy['params_list'])
            
            for result in results:
                if result['status'] == 'SUCCESS':
                    sample = result['sample_data'][0] if result['sample_data'] else {}
                    
                    obs_fields = []
                    for key, value in sample.items():
                        if any(keyword in str(key).lower() for keyword in 
                              ['note', 'obs', 'observation', 'comment', 'description']):
                            obs_fields.append(key)
                    
                    if obs_fields:
                        obs_data[endpoint] = {
                            'successful_params': result['params'],
                            'obs_fields': obs_fields,
                            'data_count': result['data_count'],
                            'sample_data': result['sample_data']
                        }
                        print(f"  🎯 CAMPOS DE OBS ENCONTRADOS: {obs_fields}")
        
        return obs_data
    
    def run_complete_discovery(self):
        """Executa descoberta completa de todos os campos faltantes"""
        print("🚀 SISTEMA DE DESCOBERTA AUTOMÁTICA - INICIADO")
        print("="*80)
        print("Objetivo: Encontrar todos os campos faltantes da planilha quinzenal")
        print()
        
        start_time = datetime.now()
        
        # Executar todas as descobertas
        discovery_results = {
            'timestamp': start_time.isoformat(),
            'manager_data': self.discover_manager_data(),
            'card_data': self.discover_card_status_data(),
            'advances_data': self.discover_advances_data(),
            'code_data': self.discover_cost_center_codes(),
            'obs_data': self.discover_obs_data()
        }
        
        # Compilar resultados
        total_discoveries = 0
        successful_fields = []
        
        for category, data in discovery_results.items():
            if category != 'timestamp':
                total_discoveries += len(data)
                for endpoint, info in data.items():
                    for field in info.get('management_fields', []) + info.get('card_fields', []) + info.get('advance_fields', []) + info.get('code_fields', []) + info.get('obs_fields', []):
                        successful_fields.append({
                            'category': category,
                            'endpoint': endpoint,
                            'field': field,
                            'params': info['successful_params']
                        })
        
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        discovery_results['summary'] = {
            'duration_seconds': duration,
            'total_discoveries': total_discoveries,
            'successful_fields': successful_fields,
            'success_rate': (total_discoveries / 25) * 100  # 25 estratégias totais
        }
        
        # Salvar resultados
        with open('api_breakthrough_discovery_results.json', 'w', encoding='utf-8') as f:
            json.dump(discovery_results, f, ensure_ascii=False, indent=2, default=str)
        
        # Exibir resumo
        print(f"\n{'='*80}")
        print("🎯 DESCobERTA CONCLUÍDA - RESUMO")
        print(f"{'='*80}")
        print(f"⏱️  Duração: {duration:.1f} segundos")
        print(f"🔍 Descobertas: {total_discoveries}")
        print(f"✅ Campos encontrados: {len(successful_fields)}")
        print(f"📊 Taxa de sucesso: {discovery_results['summary']['success_rate']:.1f}%")
        
        if successful_fields:
            print(f"\n🏆 CAMPOS DESCOBERTOS:")
            for field_info in successful_fields[:10]:  # Primeiros 10
                print(f"   • {field_info['field']} (endpoint: {field_info['endpoint']})")
        
        print(f"\n📁 Resultados salvos em: api_breakthrough_discovery_results.json")
        
        return discovery_results

def main():
    """Função principal"""
    print("🎯 SISTEMA COMPLETO DE DESCOBERTA AUTOMÁTICA")
    print("="*80)
    print("Vamos descobrir TODOS os campos faltantes da planilha quinzenal!")
    print()
    
    # Inicializar sistema
    breakthrough_system = APIBreakthroughSystem()
    
    # Executar descoberta completa
    results = breakthrough_system.run_complete_discovery()
    
    # Próximos passos
    print(f"\n🚀 PRÓXIMOS PASSOS:")
    print("="*50)
    print("1. Analisar os campos descobertos")
    print("2. Implementar integração com os novos endpoints")
    print("3. Criar sistema de mesclagem de dados")
    print("4. Implementar cálculos automáticos completos")
    print("5. Validar com dados reais de Abril 2026")
    
    return results

if __name__ == "__main__":
    main()