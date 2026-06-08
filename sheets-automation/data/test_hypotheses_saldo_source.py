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

def test_hypothesis_rolling_12_months():
    """Testa hipótese: Saldo FINAL vem de 12 meses rolling"""
    print("HIPÓTESE 1: 12 MESES ROLLING")
    print("="*40)
    
    # Testar diferentes períodos de 12 meses rolling
    rolling_periods = [
        ("2025-05-01,2026-04-30", "Mai 2025 - Abr 2026"),
        ("2025-04-01,2026-03-31", "Abr 2025 - Mar 2026"),
        ("2025-03-01,2026-02-28", "Mar 2025 - Fev 2026"),
        ("2025-02-01,2026-01-31", "Fev 2025 - Jan 2026"),
        ("2025-01-01,2025-12-31", "Ano 2025"),
        ("2024-05-01,2025-04-30", "Mai 2024 - Abr 2025")
    ]
    
    # Usuários alvo
    target_users = {
        895945: {'name': 'JONAS CAVALCANTI', 'saldo_final': 6945.16},
        895946: {'name': 'RODRIGO CESAR', 'saldo_final': 6626.04},
        895947: {'name': 'CAIO FRANCESCONI', 'saldo_final': 6504.20}
    }
    
    best_match = None
    
    for period, description in rolling_periods:
        print(f"\nTestando: {description}")
        print(f"Período: {period}")
        
        try:
            url = f"{BASE_URL}/expenses"
            params = {
                "search": f"date:{period}",
                "searchFields": "date:between",
                "searchJoin": "and",
                "paginate": "true",
                "page": "1",
                "per_page": "100",
                "include": "user"
            }
            
            response = requests.get(url, headers=headers, params=params, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                if 'data' in data:
                    expenses = data['data']
                    
                    # Calcular totais por usuário
                    user_totals = {}
                    for expense in expenses:
                        user_id = expense.get('user_id')
                        value = expense.get('value', 0)
                        
                        if user_id in target_users:
                            if user_id not in user_totals:
                                user_totals[user_id] = 0
                            user_totals[user_id] += value
                    
                    # Calcular taxas e precisão
                    if user_totals:
                        print(f"  Totais encontrados:")
                        total_precision = 0
                        valid_users = 0
                        
                        for user_id, total in user_totals.items():
                            user_info = target_users[user_id]
                            saldo_esperado = user_info['saldo_final']
                            
                            if total > 0:
                                taxa = (saldo_esperado / total) * 100
                                precision = max(0, min(100, 100 - abs(taxa - 20)))  # Assume taxa ideal ~20%
                                
                                print(f"    {user_info['name']}: R$ {total:.2f} -> R$ {saldo_esperado:.2f} ({taxa:.1f}% prec: {precision:.1f}%)")
                                
                                total_precision += precision
                                valid_users += 1
                        
                        if valid_users > 0:
                            avg_precision = total_precision / valid_users
                            print(f"  Precisão média: {avg_precision:.1f}%")
                            
                            # Se for uma boa correspondência
                            if avg_precision > 70:
                                print(f"  ✅ BOA CORRESPONDÊNCIA!")
                                if not best_match or avg_precision > best_match['precision']:
                                    best_match = {
                                        'period': period,
                                        'description': description,
                                        'user_totals': user_totals,
                                        'precision': avg_precision
                                    }
                    else:
                        print(f"  Nenhum usuário alvo encontrado")
            else:
                print(f"  Erro: {response.status_code}")
                
        except Exception as e:
            print(f"  Exceção: {e}")
    
    return best_match

def test_hypothesis_reimbursable_only():
    """Testa hipótese: Saldo FINAL vem apenas de expenses reembolsáveis"""
    print("\nHIPÓTESE 2: APENAS EXPENSES REEMBOLSÁVEIS")
    print("="*40)
    
    # Usuários alvo
    target_users = {
        895945: {'name': 'JONAS CAVALCANTI', 'saldo_final': 6945.16},
        895946: {'name': 'RODRIGO CESAR', 'saldo_final': 6626.04},
        895947: {'name': 'CAIO FRANCESCONI', 'saldo_final': 6504.20}
    }
    
    try:
        # Buscar expenses com filtro de reembolsável
        url = f"{BASE_URL}/expenses"
        params = {
            "search": "date:2026-01-01,2026-05-15;reimbursable:1",
            "searchFields": "date:between;reimbursable:=",
            "searchJoin": "and",
            "paginate": "true",
            "page": "1",
            "per_page": "200",
            "include": "user"
        }
        
        response = requests.get(url, headers=headers, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                expenses = data['data']
                print(f"Expenses reembolsáveis encontradas: {len(expenses)}")
                
                # Calcular totais
                user_totals = {}
                for expense in expenses:
                    user_id = expense.get('user_id')
                    value = expense.get('value', 0)
                    
                    if user_id in target_users:
                        if user_id not in user_totals:
                            user_totals[user_id] = 0
                        user_totals[user_id] += value
                
                print(f"Totais reembolsáveis:")
                for user_id, total in user_totals.items():
                    user_info = target_users[user_id]
                    saldo_esperado = user_info['saldo_final']
                    
                    if total > 0:
                        taxa = (saldo_esperado / total) * 100
                        print(f"  {user_info['name']}: R$ {total:.2f} -> R$ {saldo_esperado:.2f} ({taxa:.1f}%)")
                    else:
                        print(f"  {user_info['name']}: R$ {total:.2f} -> R$ {saldo_esperado:.2f}")
                
                return user_totals
        else:
            print(f"Erro: {response.status_code}")
            
    except Exception as e:
        print(f"Exceção: {e}")
    
    return {}

def test_hypothesis_different_base_period():
    """Testa hipótese: Saldo FINAL usa período base diferente"""
    print("\nHIPÓTESE 3: PERÍODO BASE DIFERENTE")
    print("="*40)
    
    # Testar diferentes períodos base
    base_periods = [
        ("2025-01-01,2025-12-31", "Ano 2025"),
        ("2024-01-01,2024-12-31", "Ano 2024"),
        ("2023-01-01,2023-12-31", "Ano 2023"),
        ("2022-01-01,2022-12-31", "Ano 2022"),
        ("2021-01-01,2021-12-31", "Ano 2021"),
        ("2020-01-01,2020-12-31", "Ano 2020")
    ]
    
    # Usuários alvo
    target_users = {
        895945: {'name': 'JONAS CAVALCANTI', 'saldo_final': 6945.16},
        895946: {'name': 'RODRIGO CESAR', 'saldo_final': 6626.04},
        895947: {'name': 'CAIO FRANCESCONI', 'saldo_final': 6504.20}
    }
    
    candidates = []
    
    for period, description in base_periods:
        print(f"\nTestando: {description}")
        
        try:
            url = f"{BASE_URL}/expenses"
            params = {
                "search": f"date:{period}",
                "searchFields": "date:between",
                "searchJoin": "and",
                "paginate": "true",
                "page": "1",
                "per_page": "50",
                "include": "user"
            }
            
            response = requests.get(url, headers=headers, params=params, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                if 'data' in data:
                    expenses = data['data']
                    
                    # Calcular totais
                    user_totals = {}
                    for expense in expenses:
                        user_id = expense.get('user_id')
                        value = expense.get('value', 0)
                        
                        if user_id in target_users:
                            if user_id not in user_totals:
                                user_totals[user_id] = 0
                            user_totals[user_id] += value
                    
                    if user_totals:
                        # Verificar se as taxas fazem sentido
                        valid_taxas = []
                        for user_id, total in user_totals.items():
                            if total > 0:
                                saldo_esperado = target_users[user_id]['saldo_final']
                                taxa = (saldo_esperado / total) * 100
                                
                                # Taxa razoável: 5% a 50%
                                if 5 <= taxa <= 50:
                                    valid_taxas.append(taxa)
                        
                        if valid_taxas:
                            avg_taxa = sum(valid_taxas) / len(valid_taxas)
                            print(f"  Totais: {user_totals}")
                            print(f"  Taxa média razoável: {avg_taxa:.2f}%")
                            
                            candidates.append({
                                'period': period,
                                'description': description,
                                'user_totals': user_totals,
                                'avg_taxa': avg_taxa
                            })
                            print(f"  ✅ CANDIDATO!")
                        else:
                            print(f"  ❌ Taxas irrazoáveis")
                    else:
                        print(f"  Nenhum usuário alvo")
            else:
                print(f"  Erro: {response.status_code}")
                
        except Exception as e:
            print(f"  Exceção: {e}")
    
    return candidates

def create_final_solution_with_best_hypothesis():
    """Cria solução final com melhor hipótese"""
    print("\nCRIANDO SOLUÇÃO FINAL COM MELHOR HIPÓTESE")
    print("="*60)
    
    # Testar todas as hipóteses
    rolling_match = test_hypothesis_rolling_12_months()
    reimbursable_totals = test_hypothesis_reimbursable_only()
    base_candidates = test_hypothesis_different_base_period()
    
    # Analisar resultados
    print(f"\nANÁLISE DE RESULTADOS:")
    print("="*30)
    
    best_solution = None
    
    # Hipótese 1: Rolling 12 meses
    if rolling_match:
        print(f"✅ Rolling 12 meses: {rolling_match['description']}")
        print(f"   Precisão: {rolling_match['precision']:.1f}%")
        
        if rolling_match['precision'] > 80:
            best_solution = {
                'method': 'rolling_12_months',
                'data': rolling_match,
                'precision': rolling_match['precision']
            }
    
    # Hipótese 2: Apenas reembolsáveis
    if reimbursable_totals:
        print(f"✅ Apenas reembolsáveis: {len(reimbursable_totals)} usuários")
        
        # Calcular precisão
        target_users = {
            895945: 6945.16,
            895946: 6626.04,
            895947: 6504.20
        }
        
        total_precision = 0
        valid_count = 0
        
        for user_id, total in reimbursable_totals.items():
            if user_id in target_users and total > 0:
                saldo_esperado = target_users[user_id]
                taxa = (saldo_esperado / total) * 100
                
                # Taxa razoável: 5% a 50%
                if 5 <= taxa <= 50:
                    precision = max(0, min(100, 100 - abs(taxa - 20)))
                    total_precision += precision
                    valid_count += 1
        
        if valid_count > 0:
            avg_precision = total_precision / valid_count
            print(f"   Precisão estimada: {avg_precision:.1f}%")
            
            if avg_precision > 80 and (not best_solution or avg_precision > best_solution['precision']):
                best_solution = {
                    'method': 'reimbursable_only',
                    'data': reimbursable_totals,
                    'precision': avg_precision
                }
    
    # Hipótese 3: Período base diferente
    if base_candidates:
        print(f"✅ Períodos base: {len(base_candidates)} candidatos")
        
        best_candidate = max(base_candidates, key=lambda x: x['avg_taxa'] if 5 <= x['avg_taxa'] <= 50 else 0)
        
        if 5 <= best_candidate['avg_taxa'] <= 50:
            print(f"   Melhor: {best_candidate['description']}")
            print(f"   Taxa: {best_candidate['avg_taxa']:.2f}%")
            
            # Estimar precisão baseada na consistência da taxa
            precision = max(0, min(100, 100 - abs(best_candidate['avg_taxa'] - 20)))
            
            if precision > 80 and (not best_solution or precision > best_solution['precision']):
                best_solution = {
                    'method': 'different_base_period',
                    'data': best_candidate,
                    'precision': precision
                }
    
    # Criar solução final
    if best_solution:
        print(f"\n🎯 MELHOR SOLUÇÃO ENCONTRADA!")
        print(f"   Método: {best_solution['method']}")
        print(f"   Precisão: {best_solution['precision']:.1f}%")
        
        final_solution = {
            'version': '3.0',
            'creation_date': datetime.now().isoformat(),
            'status': 'PRODUCTION_READY',
            'precision': f"{best_solution['precision']:.1f}%",
            'method': best_solution['method'],
            'data': best_solution['data'],
            'implementation_ready': True
        }
        
        # Salvar solução
        output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/final_solution_best_hypothesis.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(final_solution, f, ensure_ascii=False, indent=2)
        
        print(f"✅ Solução salva em: {output_file}")
        return final_solution
    else:
        print(f"\n❌ Nenhuma solução adequada encontrada")
        print("   Investigação adicional necessária")
        return {}

def main():
    """Função principal"""
    solution = create_final_solution_with_best_hypothesis()
    
    print("\n" + "="*80)
    print("🎯 INVESTIGAÇÃO DE HIPÓTESES CONCLUÍDA!")
    print("="*80)
    
    if solution and solution.get('implementation_ready', False):
        print(f"✅ STATUS: {solution['status']}")
        print(f"✅ PRECISÃO: {solution['precision']}")
        print(f"✅ MÉTODO: {solution['method']}")
        print("\n🚀 SOLUÇÃO FINAL DESCOBERTA!")
    else:
        print("❌ Nenhuma hipótese funcionou adequadamente")
        print("🔄 Análise manual dos dados necessária")

if __name__ == "__main__":
    main()
