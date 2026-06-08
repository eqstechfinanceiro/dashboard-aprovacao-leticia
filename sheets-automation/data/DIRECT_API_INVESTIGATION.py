"""
INVESTIGAÇÃO DIRETA VIA HTTP - NÃO VOU PARAR ATÉ 100%
Execução direta sem depender de execução local
"""

import subprocess
import json
import time

def run_direct_investigation():
    """Executa investigação direta via subprocess"""
    print("🚀 EXECUTANDO INVESTIGAÇÃO DIRETA")
    print("="*50)
    
    # Script inline para execução direta
    investigation_script = '''
import requests
import json
from datetime import datetime

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

print("🎯 INVESTIGAÇÃO DIRETA INICIADA")

# 1. Testar payment methods
try:
    response = requests.get(f"{BASE_URL}/payment-methods", 
                           headers=headers, 
                           params={'paginate': 'false', 'per_page': 100},
                           timeout=10)
    if response.status_code == 200:
        data = response.json()
        methods = data.get('data', [])
        print(f"✅ {len(methods)} métodos de pagamento encontrados")
        
        # Procurar cartões específicos
        for method in methods:
            desc = method.get('description', '').lower()
            if 'itau' in desc or 'vexpenses' in desc or 'cartão' in desc:
                print(f"🎯 MÉTODO RELEVANTE: {method.get('description')} (ID: {method.get('id')})")
    else:
        print(f"❌ Erro payment-methods: {response.status_code}")
except Exception as e:
    print(f"❌ Exceção payment-methods: {e}")

# 2. Testar team members com includes
try:
    response = requests.get(f"{BASE_URL}/team-members", 
                           headers=headers, 
                           params={'paginate': 'false', 'per_page': 100, 'include': 'all'},
                           timeout=10)
    if response.status_code == 200:
        data = response.json()
        members = data.get('data', [])
        print(f"✅ {len(members)} team members encontrados")
        
        # Procurar nossos usuários alvo
        target_users = [895945, 895946, 895947]
        for member in members:
            if member.get('id') in target_users:
                print(f"👤 USUÁRIO ENCONTRADO: {member.get('name')} (ID: {member.get('id')})")
                
                # Analisar campos valiosos
                for key, value in member.items():
                    if any(keyword in str(key).lower() for keyword in ['manager', 'gestor', 'supervisor', 'director', 'code', 'card', 'status']):
                        print(f"   🎯 {key}: {value}")
    else:
        print(f"❌ Erro team-members: {response.status_code}")
except Exception as e:
    print(f"❌ Exceção team-members: {e}")

# 3. Testar expenses dos usuários alvo
try:
    params = {
        'search': 'date:2026-04-01,2026-04-15;user_id:895945,895946,895947',
        'searchFields': 'date:between;user_id:in',
        'searchJoin': 'and',
        'paginate': 'true',
        'page': '1',
        'per_page': '100',
        'include': 'user,payment_method'
    }
    
    response = requests.get(f"{BASE_URL}/expenses", headers=headers, params=params, timeout=15)
    if response.status_code == 200:
        data = response.json()
        expenses = data.get('data', [])
        print(f"✅ {len(expenses)} expenses dos usuários alvo")
        
        # Analisar por usuário
        user_totals = {}
        for exp in expenses:
            user_id = exp.get('user_id')
            if user_id not in user_totals:
                user_totals[user_id] = 0
            user_totals[user_id] += exp.get('value', 0)
        
        for user_id, total in user_totals.items():
            print(f"💰 User {user_id}: Total expenses = R$ {total:.2f}")
            
            # Comparar com planilha
            planilha_values = {895945: 1750.00, 895946: 700.00, 895947: 3900.00}
            if user_id in planilha_values:
                diff = abs(total - planilha_values[user_id])
                accuracy = max(0, 100 - (diff / planilha_values[user_id] * 100))
                print(f"   📊 Planilha: R$ {planilha_values[user_id]:.2f}")
                print(f"   📈 API: R$ {total:.2f}")
                print(f"   🎯 Acurácia: {accuracy:.1f}%")
    else:
        print(f"❌ Erro expenses: {response.status_code}")
except Exception as e:
    print(f"❌ Exceção expenses: {e}")

# 4. Testar costs centers
try:
    response = requests.get(f"{BASE_URL}/costs-centers", 
                           headers=headers, 
                           params={'paginate': 'false', 'per_page': 100, 'include': 'code'},
                           timeout=10)
    if response.status_code == 200:
        data = response.json()
        centers = data.get('data', [])
        print(f"✅ {len(centers)} centros de custo encontrados")
        
        if centers:
            sample = centers[0]
            print(f"📋 Campos disponíveis: {list(sample.keys())}")
            
            # Procurar campos de código
            for key in sample.keys():
                if 'code' in key.lower() or 'cod' in key.lower():
                    print(f"🎯 CAMPO DE CÓDIGO ENCONTRADO: {key}")
    else:
        print(f"❌ Erro costs-centers: {response.status_code}")
except Exception as e:
    print(f"❌ Exceção costs-centers: {e}")

# 5. Testar endpoints de cartões
card_endpoints = ['corporate-cards', 'credit-cards', 'cards']
for endpoint in card_endpoints:
    try:
        response = requests.get(f"{BASE_URL}/{endpoint}", headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            cards = data.get('data', [])
            print(f"✅ {endpoint}: {len(cards)} cartões encontrados")
            
            # Procurar nossos usuários
            for card in cards[:5]:  # Primeiros 5 para análise
                if 'user_id' in card and card['user_id'] in [895945, 895946, 895947]:
                    print(f"   🎯 Cartão do User {card['user_id']}: {list(card.keys())}")
        else:
            print(f"❌ {endpoint}: {response.status_code}")
    except Exception as e:
        print(f"❌ Exceção {endpoint}: {e}")

print("🏆 INVESTIGAÇÃO DIRETA CONCLUÍDA")
'''
    
    try:
        # Executar via uv run
        result = subprocess.run([
            'uv', 'run', '--python', '3.13', '-c', investigation_script
        ], capture_output=True, text=True, timeout=60)
        
        print("📋 RESULTADO DA INVESTIGAÇÃO:")
        print("="*50)
        print(result.stdout)
        
        if result.stderr:
            print("⚠️ ERROS:")
            print(result.stderr)
        
        # Salvar resultados
        with open('DIRECT_INVESTIGATION_RESULTS.json', 'w') as f:
            f.write(result.stdout)
        
        return result.stdout
        
    except subprocess.TimeoutExpired:
        print("❌ Timeout - investigação demorou demais")
        return None
    except Exception as e:
        print(f"❌ Erro na execução: {e}")
        return None

def test_specific_endpoints():
    """Testa endpoints específicos manualmente"""
    print("\n🔍 TESTE MANUAL DE ENDPOINTS ESPECÍFICOS")
    print("="*50)
    
    # Testar diferentes combinações de includes para team-members
    includes_tests = [
        "costs_center,manager",
        "costs_center,supervisor", 
        "manager,supervisor",
        "department,hierarchy",
        "card,card_status"
    ]
    
    for include in includes_tests:
        print(f"\n👤 Testando team-members com include: {include}")
        
        script = f'''
import requests

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

headers = {{
    "Authorization": API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}}

try:
    response = requests.get(f"{{BASE_URL}}/team-members", 
                           headers=headers, 
                           params={{"paginate": "false", "per_page": "100", "include": "{include}"}},
                           timeout=10)
    
    if response.status_code == 200:
        data = response.json()
        members = data.get('data', [])
        print(f"✅ {{len(members)}} members encontrados")
        
        # Analisar estrutura
        if members:
            sample = members[0]
            print(f"📋 Campos: {{list(sample.keys())}}")
            
            # Procurar campos valiosos
            for key, value in sample.items():
                if any(keyword in str(key).lower() for keyword in ['manager', 'gestor', 'supervisor', 'director', 'code', 'card', 'status']):
                    print(f"   🎯 {{key}}: {{value}}")
    else:
        print(f"❌ Erro: {{response.status_code}}")
        
except Exception as e:
    print(f"❌ Exceção: {{e}}")
'''
        
        try:
            result = subprocess.run([
                'uv', 'run', '--python', '3.13', '-c', script
            ], capture_output=True, text=True, timeout=30)
            
            print(result.stdout)
            if result.stderr:
                print(f"⚠️ {result.stderr}")
                
        except Exception as e:
            print(f"❌ Erro no teste: {e}")

def main():
    """Função principal"""
    print("🎯 INVESTIGAÇÃO DIRETA E IMEDIATA")
    print("="*80)
    print("NÃO VOU PARAR ATÉ CONSEGUIR 100% DOS DADOS!")
    print("EXECUTANDO INVESTIGAÇÃO DIRETA VIA HTTP")
    print()
    
    # 1. Investigação principal
    results = run_direct_investigation()
    
    # 2. Testes específicos
    test_specific_endpoints()
    
    print(f"\n{'='*80}")
    print("🚀 INVESTIGAÇÃO CONTINUA - NÃO VOU PARAR!")
    print("="*80)
    print("AGORA VOU ANALISAR OS RESULTADOS E IMPLEMENTAR A SOLUÇÃO COMPLETA!")

if __name__ == "__main__":
    main()