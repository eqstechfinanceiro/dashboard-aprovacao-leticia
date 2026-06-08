import requests
import json
from datetime import datetime, timedelta

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

def get_expenses_with_filters(start_date, end_date, user_id=None, payment_method_id=None, reimbursable=None):
    """Obtém expenses com filtros específicos"""
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
    
    if payment_method_id:
        params["search"] += f";payment_method_id:{payment_method_id}"
        params["searchFields"] += ";payment_method_id:="
    
    if reimbursable is not None:
        params["search"] += f";reimbursable:{'true' if reimbursable else 'false'}"
        params["searchFields"] += ";reimbursable:="
    
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

def investigate_1qz_discrepancy():
    """Investiga porquê o valor 1QZ está tão alto"""
    print("INVESTIGANDO DISCREPÂNCIA DO 1QZ")
    print("="*60)
    
    # O problema pode ser:
    # 1. A API está retornando expenses de todos os usuários
    # 2. A API está retornando expenses de períodos incorretos
    # 3. A API está retornando expenses duplicadas
    
    user_id = 896007  # CAIO FRANCESCONI
    
    # Testar sem filtro de usuário
    print("\n1. Testando SEM filtro de usuário:")
    expenses_all = get_expenses_with_filters('2026-05-01', '2026-05-15')
    total_all = sum(exp.get('value', 0) for exp in expenses_all if exp.get('value', 0) > 0)
    print(f"  Todos os usuários: {len(expenses_all)} expenses, R$ {total_all:.2f}")
    
    # Testar COM filtro de usuário
    print(f"\n2. Testando COM filtro de usuário ({user_id}):")
    expenses_user = get_expenses_with_filters('2026-05-01', '2026-05-15', user_id=user_id)
    total_user = sum(exp.get('value', 0) for exp in expenses_user if exp.get('value', 0) > 0)
    print(f"  Usuário específico: {len(expenses_user)} expenses, R$ {total_user:.2f}")
    
    # Verificar se os IDs são diferentes
    user_ids_in_all = set()
    for exp in expenses_all[:100]:  # Primeiras 100
        user_ids_in_all.add(exp.get('user_id'))
    
    print(f"  IDs de usuários encontrados (amostra): {sorted(list(user_ids_in_all))[:10]}")
    
    # Verificar se o filtro está funcionando
    if total_all == total_user:
        print("  ⚠️  O filtro de usuário NÃO está funcionando!")
        return False
    else:
        print("  ✅ O filtro de usuário está funcionando")
        return True

def test_specific_payment_methods():
    """Testa payment methods específicos para encontrar o 1QZ correto"""
    print("\nTESTANDO PAYMENT METHODS ESPECÍFICOS")
    print("="*60)
    
    user_id = 896007
    
    # Obter todos os payment methods
    try:
        url = f"{BASE_URL}/payment-methods"
        params = {"paginate": "false", "per_page": 100}
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                payment_methods = data['data']
                
                print(f"Testando {len(payment_methods)} payment methods...")
                
                # Procurar por payment methods que possam corresponder ao cartão corporativo
                target_value = 3900.00
                best_match = None
                smallest_diff = float('inf')
                
                for pm in payment_methods:
                    pm_id = pm.get('id')
                    pm_desc = pm.get('description', 'Unknown')
                    
                    # Testar expenses deste payment method para o usuário
                    expenses = get_expenses_with_filters('2026-05-01', '2026-05-15', user_id=user_id, payment_method_id=pm_id)
                    total = sum(exp.get('value', 0) for exp in expenses if exp.get('value', 0) > 0)
                    
                    diff = abs(total - target_value)
                    
                    if diff < smallest_diff:
                        smallest_diff = diff
                        best_match = (pm_id, pm_desc, total)
                    
                    if total > 0 and total < 10000:  # Valores razoáveis
                        print(f"  PM {pm_id} ({pm_desc[:30]}...): R$ {total:.2f}")
                
                if best_match:
                    print(f"\n✅ MELHOR CORRESPONDÊNCIA:")
                    print(f"  PM {best_match[0]} ({best_match[1]}): R$ {best_match[2]:.2f}")
                    print(f"  Diferença: R$ {smallest_diff:.2f}")
                    
                    return best_match
                
    except Exception as e:
        print(f"Erro ao testar payment methods: {e}")
    
    return None

def investigate_report_excel_downloads():
    """Tenta baixar arquivos Excel dos reports para encontrar dados"""
    print("\nINVESTIGANDO ARQUIVOS EXCEL DOS REPORTS")
    print("="*60)
    
    try:
        url = f"{BASE_URL}/reports"
        params = {"paginate": "false", "per_page": 20}
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                reports = data['data']
                
                print(f"Analisando {len(reports)} reports...")
                
                for i, report in enumerate(reports[:5]):  # Primeiros 5
                    report_id = report.get('id')
                    description = report.get('description', '')
                    status = report.get('status', '')
                    
                    print(f"\nReport {i+1}:")
                    print(f"  ID: {report_id}")
                    print(f"  Description: {description}")
                    print(f"  Status: {status}")
                    
                    # Procurar por links de download
                    if 'file_url' in report:
                        file_url = report['file_url']
                        print(f"  File URL: {file_url}")
                        
                        # Tentar baixar o arquivo
                        try:
                            file_response = requests.get(file_url, headers=headers, timeout=10)
                            if file_response.status_code == 200:
                                print(f"  ✅ Arquivo baixado: {len(file_response.content)} bytes")
                                
                                # Salvar arquivo para análise
                                filename = f"/tmp/report_{report_id}.xlsx"
                                with open(filename, 'wb') as f:
                                    f.write(file_response.content)
                                print(f"  Salvo em: {filename}")
                            else:
                                print(f"  ❌ Erro ao baixar: {file_response.status_code}")
                        except Exception as e:
                            print(f"  ❌ Exceção ao baixar: {e}")
                    
                    # Procurar por outros campos que possam conter dados
                    for key, value in report.items():
                        if key not in ['id', 'description', 'status', 'created_at', 'updated_at', 'user_id']:
                            if isinstance(value, (int, float)) and value > 0:
                                print(f"  {key}: R$ {value:.2f}")
                            elif isinstance(value, str) and len(value) < 100:
                                print(f"  {key}: {value}")
                
    except Exception as e:
        print(f"Erro ao investigar reports: {e}")

def test_alternative_api_approaches():
    """Testa abordagens alternativas da API"""
    print("\nTESTANDO ABORDAGENS ALTERNATIVAS DA API")
    print("="*60)
    
    # 1. Testar diferentes combinações de filtros
    user_id = 896007
    
    filter_combinations = [
        # Apenas data
        ("date:2026-05-01,2026-05-15", "date:between"),
        
        # Data + usuário
        ("date:2026-05-01,2026-05-15;user_id:896007", "date:between;user_id:="),
        
        # Data + usuário + reembolsável
        ("date:2026-05-01,2026-05-15;user_id:896007;reimbursable:true", "date:between;user_id:=;reimbursable:="),
        
        # Data + usuário + não reembolsável
        ("date:2026-05-01,2026-05-15;user_id:896007;reimbursable:false", "date:between;user_id:=;reimbursable:="),
        
        # Períodos diferentes
        ("date:2026-04-01,2026-04-30;user_id:896007", "date:between;user_id:="),
        ("date:2026-03-01,2026-03-31;user_id:896007", "date:between;user_id:="),
    ]
    
    for search, search_fields in filter_combinations:
        try:
            params = {
                "search": search,
                "searchFields": search_fields,
                "searchJoin": "and",
                "paginate": "true",
                "page": "1",
                "per_page": "50",
                "include": "expense_type,costs_center,payment_method,user"
            }
            
            url = f"{BASE_URL}/expenses"
            response = requests.get(url, headers=headers, params=params)
            
            if response.status_code == 200:
                data = response.json()
                if 'data' in data:
                    expenses = data['data']
                    total = sum(exp.get('value', 0) for exp in expenses if exp.get('value', 0) > 0)
                    
                    print(f"  {search[:50]}...: {len(expenses)} expenses, R$ {total:.2f}")
                    
                    # Se estiver próximo de 3900, mostrar detalhes
                    if 3000 < total < 5000:
                        print(f"    ✅ PRÓXIMO DO VALOR ESPERADO!")
                        for exp in expenses[:5]:
                            print(f"      {exp.get('date')} - {exp.get('title', '')[:30]}... - R$ {exp.get('value', 0):.2f}")
            else:
                print(f"  {search[:50]}...: Erro {response.status_code}")
                
        except Exception as e:
            print(f"  {search[:50]}...: Exceção {e}")

def discover_hidden_endpoints():
    """Tenta descobrir endpoints ocultos"""
    print("\nDESCOBRINDO ENDPOINTS OCULTOS")
    print("="*60)
    
    # Endpoints que podem conter dados financeiros
    hidden_endpoints = [
        "/v2/advances",
        "/v2/advances/balance", 
        "/v2/balances",
        "/v2/cards",
        "/v2/limits",
        "/v2/financial",
        "/v2/accounts",
        "/v2/wallets",
        "/v2/credits",
        "/v2/statements",
        "/v2/summary",
        "/v2/dashboard",
        "/v2/analytics",
        "/v2/reports/summary",
        "/v2/users/balance",
        "/v2/team-members/balance",
        "/v2/payment-methods/balance",
        "/v2/expenses/summary",
        "/v2/expenses/total"
    ]
    
    for endpoint in hidden_endpoints:
        try:
            url = f"{BASE_URL}{endpoint}"
            response = requests.get(url, headers=headers, timeout=5)
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    print(f"  ✅ {endpoint}: SUCESSO!")
                    
                    if isinstance(data, dict):
                        print(f"    Campos: {list(data.keys())[:10]}...")
                        
                        # Procurar campos financeiros
                        for key, value in data.items():
                            key_lower = key.lower()
                            if any(keyword in key_lower for keyword in ['balance', 'saldo', 'total', 'value', 'amount']):
                                print(f"      {key}: {value}")
                    elif isinstance(data, list) and data:
                        print(f"    Array com {len(data)} itens")
                        
                except:
                    print(f"  ✅ {endpoint}: Resposta não JSON")
            else:
                print(f"  ❌ {endpoint}: {response.status_code}")
                
        except Exception as e:
            print(f"  ❌ {endpoint}: {e}")

def main():
    """Função principal"""
    print("DESCOBRINDO FONTES REAIS DE DADOS")
    print("="*80)
    print("Investigação profunda para encontrar os dados corretos")
    print("="*80)
    
    # 1. Investigar discrepância do 1QZ
    filter_working = investigate_1qz_discrepancy()
    
    # 2. Testar payment methods específicos
    best_pm = test_specific_payment_methods()
    
    # 3. Investigar arquivos Excel dos reports
    investigate_report_excel_downloads()
    
    # 4. Testar abordagens alternativas
    test_alternative_api_approaches()
    
    # 5. Descobrir endpoints ocultos
    discover_hidden_endpoints()
    
    # 6. Conclusões
    print("\n" + "="*80)
    print("CONCLUSÕES DA INVESTIGAÇÃO")
    print("="*80)
    
    if not filter_working:
        print("❌ Filtro de usuário não está funcionando corretamente")
        print("   A API pode estar retornando dados de todos os usuários")
    
    if best_pm:
        print(f"✅ Payment method promissor encontrado: {best_pm[1]}")
        print(f"   Valor: R$ {best_pm[2]:.2f}")
    else:
        print("❌ Nenhum payment method corresponde ao valor esperado")
    
    print("\nPRÓXIMOS PASSOS:")
    print("1. Investigar por que o filtro de usuário não funciona")
    print("2. Encontrar a fonte real dos dados da planilha")
    print("3. Implementar solução 100% automatizada")
    
    # Salvar resultados
    results = {
        'investigation_date': datetime.now().isoformat(),
        'filter_working': filter_working,
        'best_payment_method': best_pm,
        'status': 'Investigação de fontes reais concluída'
    }
    
    output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/real_data_sources_discovery.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\nResultados salvos em: {output_file}")

if __name__ == "__main__":
    main()
