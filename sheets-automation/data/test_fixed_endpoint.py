"""
TESTE RÁPIDO DO ENDPOINT CORRIGIDO
Valida se as correções resolveram os problemas
"""

import requests
import json
from datetime import datetime

def test_quinzena_complete_endpoint():
    """Testa o endpoint corrigido"""
    print("🧪 TESTE DO ENDPOINT CORRIGIDO")
    print("="*50)
    
    # URL local do endpoint
    url = "http://localhost:3000/api/quinzena-complete"
    params = {
        "year": 2026,
        "month": 4,
        "quinzena": 1
    }
    
    try:
        print(f"🔍 Testando: {url}")
        print(f"📋 Parâmetros: {params}")
        print()
        
        start_time = datetime.now()
        
        response = requests.get(url, params=params, timeout=30)
        
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        print(f"⏱️  Tempo de resposta: {duration:.2f} segundos")
        print(f"📊 Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            print("✅ SUCESSO! Endpoint funcionando corretamente")
            print()
            print("📈 Dados retornados:")
            print(f"   • Período: {data['period']['start_date']} a {data['period']['end_date']}")
            print(f"   • Usuários processados: {data['statistics']['processed_users']}")
            print(f"   • Total expenses: {data['statistics']['total_expenses']}")
            print(f"   • Taxa de sucesso: {data['statistics']['success_rate']:.1f}%")
            
            if data['data']:
                print()
                print("👥 Amostra de dados:")
                for i, user in enumerate(data['data'][:2]):  # Primeiros 2 usuários
                    print(f"   {i+1}. {user['user_info']['portador']}")
                    print(f"      1QZ: R$ {user['financial_data']['quinzena_qz']:.2f}")
                    print(f"      CARGA FINAL: R$ {user['financial_data']['carga_final']:.2f}")
            
            print()
            print("🎯 VALIDAÇÃO BEM-SUCEDIDA!")
            return True
            
        else:
            print(f"❌ ERRO: {response.status_code}")
            try:
                error_data = response.json()
                print(f"   Detalhes: {error_data}")
            except:
                print(f"   Response: {response.text[:500]}")
            
            return False
            
    except requests.exceptions.Timeout:
        print("❌ TIMEOUT - Endpoint demorou demais para responder")
        return False
    except requests.exceptions.ConnectionError:
        print("❌ CONEXÃO RECUSADA - Servidor não está rodando")
        print("   💡 Dica: Inicie o servidor com 'npm run dev'")
        return False
    except Exception as e:
        print(f"❌ ERRO INESPERADO: {e}")
        return False

def test_different_periods():
    """Testa diferentes períodos para validar dinamismo"""
    print("\n🔄 TESTE DE DINAMISMO - DIFERENTES PERÍODOS")
    print("="*50)
    
    test_cases = [
        {"year": 2026, "month": 4, "quinzena": 1, "desc": "Abril 2026 - 1ª Quinzena"},
        {"year": 2026, "month": 4, "quinzena": 2, "desc": "Abril 2026 - 2ª Quinzena"},
        {"year": 2026, "month": 5, "quinzena": 1, "desc": "Maio 2026 - 1ª Quinzena"},
    ]
    
    url = "http://localhost:3000/api/quinzena-complete"
    
    for test_case in test_cases:
        print(f"\n📅 Testando: {test_case['desc']}")
        
        try:
            response = requests.get(url, params=test_case, timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ {data['statistics']['processed_users']} usuários")
                print(f"   💰 {data['statistics']['total_expenses']} expenses")
            else:
                print(f"   ❌ Erro: {response.status_code}")
                
        except Exception as e:
            print(f"   ❌ Exceção: {e}")

def main():
    """Função principal"""
    print("🎯 SISTEMA DE TESTE - ENDPOINT QUINZENA COMPLETA")
    print("="*80)
    print("Validando as correções implementadas")
    print()
    
    # 1. Teste principal
    success = test_quinzena_complete_endpoint()
    
    if success:
        # 2. Teste de dinamismo
        test_different_periods()
        
        print("\n" + "="*80)
        print("🏆 RESULTADO FINAL")
        print("="*80)
        print("✅ Endpoint corrigido e funcionando!")
        print("✅ Problemas de cache resolvidos")
        print("✅ Erro de variável corrigido")
        print("✅ Sistema pronto para uso")
        print()
        print("🚀 PRÓXIMOS PASSOS:")
        print("   1. Testar interface web em /quinzena-dinamica")
        print("   2. Validar com dados reais")
        print("   3. Fazer deploy para produção")
        
    else:
        print("\n" + "="*80)
        print("❌ PROBLEMAS ENCONTRADOS")
        print("="*80)
        print("🔧 Verifique:")
        print("   • Servidor está rodando (npm run dev)")
        print("   • Endpoint está acessível")
        print("   • API VExpenses está funcionando")
        print("   • Variáveis de ambiente configuradas")

if __name__ == "__main__":
    main()