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

def investigate_complete_annual_data():
    """Investiga dados anuais completos para encontrar a verdadeira base"""
    print("INVESTIGANDO DADOS ANUAIS COMPLETOS")
    print("="*50)
    
    # Vamos tentar diferentes períodos anuais
    annual_periods = [
        ("2025-01-01,2025-12-31", "Ano 2025 completo"),
        ("2024-01-01,2024-12-31", "Ano 2024 completo"),
        ("2023-01-01,2023-12-31", "Ano 2023 completo"),
        ("2025-06-01,2026-05-31", "12 meses até maio 2026"),
        ("2025-05-01,2026-04-30", "12 meses até abril 2026")
    ]
    
    # Usuários alvo
    target_users = [895945, 895946, 895947]
    
    for period, description in annual_periods:
        print(f"\nTestando período: {description}")
        print(f"Datas: {period}")
        
        try:
            url = f"{BASE_URL}/expenses"
            params = {
                "search": f"date:{period}",
                "searchFields": "date:between",
                "searchJoin": "and",
                "paginate": "true",
                "page": "1",
                "per_page": "50",  # Reduzir para evitar timeout
                "include": "user"
            }
            
            response = requests.get(url, headers=headers, params=params, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                if 'data' in data:
                    expenses = data['data']
                    print(f"  Expenses encontradas: {len(expenses)}")
                    
                    # Processar apenas usuários alvo
                    user_totals = {}
                    for expense in expenses:
                        user_id = expense.get('user_id')
                        value = expense.get('value', 0)
                        
                        if user_id in target_users:
                            if user_id not in user_totals:
                                user_totals[user_id] = 0
                            user_totals[user_id] += value
                    
                    if user_totals:
                        print(f"  Totais dos usuários alvo:")
                        for user_id, total in user_totals.items():
                            print(f"    ID {user_id}: R$ {total:.2f}")
                        
                        # Verificar se esses totais fazem sentido com os saldos
                        expected_saldos = {
                            895945: 6945.16,  # JONAS
                            895946: 6626.04,  # RODRIGO
                            895947: 6504.20   # CAIO
                        }
                        
                        print(f"  Análise de taxas:")
                        for user_id, total in user_totals.items():
                            if user_id in expected_saldos:
                                saldo = expected_saldos[user_id]
                                if total > 0:
                                    taxa = (saldo / total) * 100
                                    print(f"    ID {user_id}: R$ {total:.2f} -> R$ {saldo:.2f} ({taxa:.2f}%)")
                                else:
                                    print(f"    ID {user_id}: R$ {total:.2f} -> R$ {saldo:.2f} (total zero)")
                        
                        # Se as taxas parecerem razoáveis (entre 5% e 50%), este pode ser o período correto
                        all_taxas = []
                        for user_id, total in user_totals.items():
                            if user_id in expected_saldos and total > 0:
                                taxa = (expected_saldos[user_id] / total) * 100
                                all_taxas.append(taxa)
                        
                        if all_taxas:
                            avg_taxa = sum(all_taxas) / len(all_taxa)
                            if 5 <= avg_taxa <= 50:  # Taxa razoável
                                print(f"  ✅ Taxa média razoável: {avg_taxa:.2f}%")
                                print(f"  🎯 PERÍODO CANDIDATO: {description}")
                                return {
                                    'period': period,
                                    'description': description,
                                    'user_totals': user_totals,
                                    'avg_taxa': avg_taxa
                                }
                            else:
                                print(f"  ❌ Taxa média irrazoável: {avg_taxa:.2f}%")
            else:
                print(f"  Erro: {response.status_code}")
                
        except Exception as e:
            print(f"  Exceção: {e}")
    
    return None

def investigate_reports_for_saldo_data():
    """Investiga reports para encontrar dados de saldo"""
    print("\nINVESTIGANDO REPORTS PARA DADOS DE SALDO")
    print("="*50)
    
    try:
        url = f"{BASE_URL}/reports"
        params = {"paginate": "false", "per_page": 50}
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                reports = data['data']
                
                # Procurar reports que possam conter dados de saldo
                saldo_candidates = []
                
                for report in reports:
                    description = report.get('description', '').upper()
                    
                    # Procurar por palavras-chave
                    if any(keyword in description for keyword in [
                        'SALDO', 'BALANCE', 'ACUMULADO', 'TOTAL', 'RESUMO',
                        'MENSAL', 'ANUAL', 'PERÍODO', 'EXTRATO'
                    ]):
                        # Coletar campos financeiros
                        financial_fields = {}
                        for key, value in report.items():
                            if isinstance(value, (int, float)) and value > 0:
                                financial_fields[key] = value
                        
                        if financial_fields:
                            saldo_candidates.append({
                                'report': report,
                                'financial_fields': financial_fields
                            })
                
                print(f"Reports candidatos a dados de saldo: {len(saldo_candidates)}")
                
                # Analisar candidatos
                for i, candidate in enumerate(saldo_candidates[:10]):  # Primeiros 10
                    report = candidate['report']
                    fields = candidate['financial_fields']
                    
                    print(f"\nReport {i+1}: {report.get('description', '')}")
                    print(f"  ID: {report.get('id')}")
                    print(f"  Campos financeiros: {len(fields)}")
                    
                    for field_name, field_value in fields.items():
                        print(f"    {field_name}: R$ {field_value:.2f}")
                    
                    # Verificar se algum valor corresponde aos saldos esperados
                    expected_saldos = [6945.16, 6626.04, 6504.20]
                    
                    for field_name, field_value in fields.items():
                        for expected in expected_saldos:
                            if abs(field_value - expected) < 100:  # Tolerância de 100
                                print(f"    ✅ CORRESPONDÊNCIA: {field_name} R$ {field_value:.2f} ~ R$ {expected:.2f}")
                
                return saldo_candidates
                
    except Exception as e:
        print(f"Erro ao investigar reports: {e}")
    
    return []

def investigate_payment_methods():
    """Investiga payment methods para entender estrutura de saldos"""
    print("\nINVESTIGANDO PAYMENT METHODS")
    print("="*50)
    
    try:
        url = f"{BASE_URL}/payment-methods"
        params = {"paginate": "false", "per_page": 50}
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                methods = data['data']
                
                print(f"Payment methods encontrados: {len(methods)}")
                
                # Procurar por métodos que possam ter saldos
                for method in methods[:10]:  # Primeiros 10
                    method_id = method.get('id')
                    name = method.get('name', '')
                    description = method.get('description', '')
                    
                    print(f"\nMethod: {name}")
                    print(f"  ID: {method_id}")
                    print(f"  Description: {description}")
                    
                    # Verificar se tem campos financeiros
                    for key, value in method.items():
                        if isinstance(value, (int, float)) and value > 0:
                            print(f"  {key}: R$ {value:.2f}")
                
    except Exception as e:
        print(f"Erro ao investigar payment methods: {e}")

def create_hypothesis_analysis():
    """Cria análise de hipóteses sobre a fonte dos saldos"""
    print("\nANÁLISE DE HIPÓTESES")
    print("="*50)
    
    # Hipótese 1: Saldo FINAL vem de período diferente (ex: 12 meses rolling)
    print("HIPÓTESE 1: SALDO FINAL vem de período rolling de 12 meses")
    
    # Hipótese 2: Saldo FINAL é acumulado de todos os tempos
    print("HIPÓTESE 2: SALDO FINAL é acumulado histórico")
    
    # Hipótese 3: Saldo FINAL vem de reports específicos
    print("HIPÓTESE 3: SALDO FINAL vem de reports específicos")
    
    # Hipótese 4: Saldo FINAL é calculado com base em critérios diferentes
    print("HIPÓTESE 4: SALDO FINAL usa critérios diferentes (ex: apenas expenses reembolsáveis)")
    
    # Hipótese 5: Dados da planilha são de outro período/ano
    print("HIPÓTESE 5: Dados da planilha são de período diferente")
    
    return True

def main():
    """Função principal"""
    print("INVESTIGAÇÃO PROFUNDA - FONTE VERDADEIRA DOS SALDOS")
    print("="*80)
    print("Descobrindo por que as taxas calculadas estão incorretas")
    print("="*80)
    
    # 1. Investigar períodos anuais diferentes
    annual_candidate = investigate_complete_annual_data()
    
    # 2. Investigar reports para dados de saldo
    report_candidates = investigate_reports_for_saldo_data()
    
    # 3. Investigar payment methods
    investigate_payment_methods()
    
    # 4. Análise de hipóteses
    create_hypothesis_analysis()
    
    # 5. Compilar descobertas
    findings = {
        'investigation_date': datetime.now().isoformat(),
        'annual_candidate': annual_candidate,
        'report_candidates_count': len(report_candidates) if report_candidates else 0,
        'next_steps': [
            'Testar períodos anuais alternativos',
            'Analisar reports com dados de saldo',
            'Investigar critérios de cálculo diferentes',
            'Verificar se dados são de outro ano/período'
        ]
    }
    
    # Salvar descobertas
    output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/saldo_source_investigation.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(findings, f, ensure_ascii=False, indent=2)
    
    print(f"\n\nDescobertas salvas em: {output_file}")
    print("\n" + "="*80)
    print("🔍 INVESTIGAÇÃO CONCLUÍDA!")
    print("="*80)
    
    if annual_candidate:
        print(f"✅ Período anual candidato encontrado: {annual_candidate['description']}")
        print(f"✅ Taxa média: {annual_candidate['avg_taxa']:.2f}%")
    else:
        print("❌ Nenhum período anual candidato encontrado")
        print("🔄 Investigação adicional necessária")

if __name__ == "__main__":
    main()
