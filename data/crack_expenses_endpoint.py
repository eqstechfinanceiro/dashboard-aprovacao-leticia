import requests
import json
from datetime import datetime, timedelta
import pandas as pd

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

def test_expenses_with_search_pattern():
    """Testa expenses usando o padrão de busca descoberto"""
    print("TESTANDO EXPENSES COM PADRÃO DE BUSCA")
    print("="*80)
    
    # Baseado no código do backend, os parâmetros obrigatórios são:
    # - search: string de busca
    # - searchFields: campos onde buscar
    # - searchJoin: operador lógico (and/or)
    
    search_patterns = [
        # Padrão básico de data (funciona no backend)
        {
            "search": "date:2026-04-01,2026-04-30",
            "searchFields": "date:between",
            "searchJoin": "and",
            "description": "Data básica - Abril 2026"
        },
        
        # 1ª quinzena de abril
        {
            "search": "date:2026-04-01,2026-04-15",
            "searchFields": "date:between",
            "searchJoin": "and",
            "description": "1ª Quinzena de Abril 2026"
        },
        
        # 2ª quinzena de abril
        {
            "search": "date:2026-04-16,2026-04-30",
            "searchFields": "date:between",
            "searchJoin": "and",
            "description": "2ª Quinzena de Abril 2026"
        },
        
        # Com user_id
        {
            "search": "date:2026-04-01,2026-04-30;user_id:890792",
            "searchFields": "date:between;user_id:=",
            "searchJoin": "and",
            "description": "Abril 2026 + User ID 890792"
        },
        
        # Com status
        {
            "search": "date:2026-04-01,2026-04-30;on:true",
            "searchFields": "date:between;on:=",
            "searchJoin": "and",
            "description": "Abril 2026 + Ativos"
        },
        
        # Com reembolsável
        {
            "search": "date:2026-04-01,2026-04-30;reimbursable:true",
            "searchFields": "date:between;reimbursable:=",
            "searchJoin": "and",
            "description": "Abril 2026 + Reembolsáveis"
        },
        
        # Múltiplas condições complexas
        {
            "search": "date:2026-04-01,2026-04-30;user_id:890792;on:true;reimbursable:true",
            "searchFields": "date:between;user_id:=;on:=;reimbursable:=",
            "searchJoin": "and",
            "description": "Complexo - User + Ativo + Reembolsável"
        },
        
        # Por valor (se existir campo value)
        {
            "search": "date:2026-04-01,2026-04-30;value:>0",
            "searchFields": "date:between;value:>",
            "searchJoin": "and",
            "description": "Abril 2026 + Valor > 0"
        },
        
        # Por amount (se existir campo amount)
        {
            "search": "date:2026-04-01,2026-04-30;amount:>0",
            "searchFields": "date:between;amount:>",
            "searchJoin": "and",
            "description": "Abril 2026 + Amount > 0"
        },
        
        # Testar diferentes campos de valor
        {
            "search": "date:2026-04-01,2026-04-30",
            "searchFields": "date:between",
            "searchJoin": "and",
            "description": "Teste básico para validar padrão"
        }
    ]
    
    successful_patterns = []
    
    for i, pattern in enumerate(search_patterns):
        print(f"\nTestando {i+1}/{len(search_patterns)}: {pattern['description']}")
        print(f"  search: {pattern['search']}")
        print(f"  searchFields: {pattern['searchFields']}")
        print(f"  searchJoin: {pattern['searchJoin']}")
        
        try:
            params = {
                "search": pattern["search"],
                "searchFields": pattern["searchFields"],
                "searchJoin": pattern["searchJoin"],
                "paginate": "true",
                "page": "1",
                "per_page": "50"
            }
            
            # Adicionar include se especificado
            if "include" in pattern:
                params["include"] = pattern["include"]
            
            url = f"{BASE_URL}/expenses"
            response = requests.get(url, headers=headers, params=params)
            
            print(f"  Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"  ✅ SUCESSO!")
                
                if isinstance(data, dict):
                    print(f"    Campos: {list(data.keys())}")
                    
                    if 'data' in data and isinstance(data['data'], list):
                        expenses = data['data']
                        print(f"    Expenses encontrados: {len(expenses)}")
                        
                        if expenses:
                            sample_expense = expenses[0]
                            print(f"    Campos da expense: {list(sample_expense.keys())}")
                            
                            # Procurar campos financeiros
                            financial_fields = []
                            for key, value in sample_expense.items():
                                if isinstance(value, (int, float)):
                                    field_name_lower = key.lower()
                                    if any(keyword in field_name_lower for keyword in ['value', 'amount', 'total', 'balance', 'custo']):
                                        financial_fields.append((key, value))
                            
                            if financial_fields:
                                print(f"    🎯 CAMPOS FINANCEIROS: {financial_fields}")
                            
                            # Mostrar amostra de dados financeiros
                            for j in range(min(3, len(expenses))):
                                expense = expenses[j]
                                financial_data = {k: v for k, v in expense.items() if isinstance(v, (int, float))}
                                if financial_data:
                                    print(f"      Expense {j+1}: {financial_data}")
                            
                            successful_patterns.append({
                                'pattern': pattern,
                                'total_expenses': len(expenses),
                                'financial_fields': financial_fields,
                                'sample_expense': sample_expense
                            })
                            
                            # Se encontramos campos financeiros, vamos testar variações
                            if financial_fields:
                                print(f"  🔍 Testando variações deste padrão...")
                                test_variations_of_successful_pattern(pattern)
                        
                        elif 'pagination' in data:
                            pagination = data['pagination']
                            print(f"    Paginação: {pagination}")
                    
                    elif isinstance(data, list):
                        print(f"    Lista com {len(data)} itens")
                        if data:
                            sample = data[0]
                            print(f"    Campos do item: {list(sample.keys())}")
                
            else:
                print(f"  ❌ Erro: {response.text[:200]}")
                
        except Exception as e:
            print(f"  ❌ Exceção: {e}")
    
    return successful_patterns

def test_variations_of_successful_pattern(base_pattern):
    """Testa variações de um padrão que funcionou"""
    print(f"    Testando variações do padrão bem-sucedido...")
    
    variations = [
        # Variações de include
        {"include": "expense_type"},
        {"include": "expense_type,costs_center"},
        {"include": "expense_type,costs_center,payment_method"},
        {"include": "expense_type,costs_center,payment_method,user"},
        {"include": "user"},
        {"include": "report"},
        
        # Variações de paginação
        {"per_page": "100"},
        {"per_page": "200"},
        {"page": "2"},
        
        # Variações de searchJoin
        {"searchJoin": "or"},
        
        # Combinações
        {"include": "expense_type,costs_center", "per_page": "100"},
        {"include": "user", "searchJoin": "or"},
    ]
    
    for i, variation in enumerate(variations):
        try:
            params = {
                "search": base_pattern["search"],
                "searchFields": base_pattern["searchFields"],
                "searchJoin": base_pattern["searchJoin"],
                "paginate": "true",
                "page": "1",
                "per_page": "50"
            }
            
            # Adicionar variação
            params.update(variation)
            
            url = f"{BASE_URL}/expenses"
            response = requests.get(url, headers=headers, params=params)
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, dict) and 'data' in data:
                    expenses = data['data']
                    print(f"      ✅ Variação {i+1} ({list(variation.keys())}): {len(expenses)} expenses")
            else:
                print(f"      ❌ Variação {i+1} ({list(variation.keys())}: {response.status_code}")
                
        except Exception as e:
            print(f"      ❌ Variação {i+1}: {e}")

def analyze_expenses_for_financial_calculations(expenses_data):
    """Analisa expenses para encontrar padrões de cálculo financeiro"""
    print("\nANALISANDO EXPENSES PARA CÁLCULOS FINANCEIROS")
    print("="*80)
    
    if not expenses_data:
        print("Nenhum dado de expenses para analisar")
        return
    
    # Agrupar por usuário
    user_expenses = {}
    total_expenses = 0
    
    for pattern_result in expenses_data:
        expenses = pattern_result.get('sample_expense', {})
        if not expenses:
            continue
        
        # Se temos uma lista de expenses, processar
        if isinstance(expenses, list):
            for expense in expenses:
                user_id = expense.get('user_id')
                if user_id not in user_expenses:
                    user_expenses[user_id] = []
                user_expenses[user_id].append(expense)
                total_expenses += 1
        else:
            # Single expense
            user_id = expenses.get('user_id')
            if user_id not in user_expenses:
                user_expenses[user_id] = []
            user_expenses[user_id].append(expenses)
            total_expenses += 1
    
    print(f"Total de expenses analisadas: {total_expenses}")
    print(f"Usuários únicos: {len(user_expenses)}")
    
    # Calcular métricas por usuário
    user_metrics = {}
    
    for user_id, expenses in user_expenses.items():
        metrics = {
            'total_expenses': len(expenses),
            'total_value': 0,
            'total_amount': 0,
            'by_date': {},
            'by_type': {},
            'by_payment_method': {}
        }
        
        for expense in expenses:
            # Soma de valores
            for key, value in expense.items():
                if isinstance(value, (int, float)) and value > 0:
                    field_name_lower = key.lower()
                    
                    if 'value' in field_name_lower:
                        metrics['total_value'] += value
                    elif 'amount' in field_name_lower:
                        metrics['total_amount'] += value
                    
                    # Agrupar por data
                    if 'date' in expense:
                        date = expense['date']
                        if date not in metrics['by_date']:
                            metrics['by_date'][date] = 0
                        metrics['by_date'][date] += value
                    
                    # Agrupar por tipo
                    if 'expense_type' in expense:
                        expense_type = expense['expense_type']
                        if isinstance(expense_type, dict) and 'description' in expense_type:
                            type_name = expense_type['description']
                            if type_name not in metrics['by_type']:
                                metrics['by_type'][type_name] = 0
                            metrics['by_type'][type_name] += value
                    
                    # Agrupar por método de pagamento
                    if 'payment_method' in expense:
                        payment_method = expense['payment_method']
                        if isinstance(payment_method, dict) and 'description' in payment_method:
                            method_name = payment_method['description']
                            if method_name not in metrics['by_payment_method']:
                                metrics['by_payment_method'][method_name] = 0
                            metrics['by_payment_method'][method_name] += value
        
        user_metrics[user_id] = metrics
    
    # Mostrar métricas
    print(f"\nMétricas por usuário:")
    for user_id, metrics in user_metrics.items():
        print(f"\nUsuário {user_id}:")
        print(f"  Total expenses: {metrics['total_expenses']}")
        print(f"  Total value: R$ {metrics['total_value']:.2f}")
        print(f"  Total amount: R$ {metrics['total_amount']:.2f}")
        
        if metrics['by_type']:
            print(f"  Por tipo: {metrics['by_type']}")
        
        if metrics['by_payment_method']:
            print(f"  Por método pagamento: {metrics['by_payment_method']}")
    
    return user_metrics

def test_advanced_financial_calculations():
    """Testa cálculos financeiros avançados"""
    print("\nTESTANDO CÁLCULOS FINANCEIROS AVANÇADOS")
    print("="*80)
    
    # Testar diferentes períodos para calcular quinzenas
    periods = [
        ("2026-04-01", "2026-04-15", "1ª Quinzena Abril"),
        ("2026-04-16", "2026-04-30", "2ª Quinzena Abril"),
        ("2026-03-01", "2026-03-15", "1ª Quinzena Março"),
        ("2026-03-16", "2026-03-31", "2ª Quinzena Março"),
    ]
    
    period_results = {}
    
    for start_date, end_date, description in periods:
        print(f"\nTestando período: {description}")
        
        try:
            params = {
                "search": f"date:{start_date},{end_date}",
                "searchFields": "date:between",
                "searchJoin": "and",
                "paginate": "true",
                "page": "1",
                "per_page": "100",
                "include": "expense_type,costs_center,payment_method,user"
            }
            
            url = f"{BASE_URL}/expenses"
            response = requests.get(url, headers=headers, params=params)
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, dict) and 'data' in data:
                    expenses = data['data']
                    print(f"  ✅ {len(expenses)} expenses encontradas")
                    
                    # Calcular totais
                    total_value = 0
                    user_totals = {}
                    
                    for expense in expenses:
                        user_id = expense.get('user_id')
                        expense_value = 0
                        
                        # Procurar campo de valor
                        for key, value in expense.items():
                            if isinstance(value, (int, float)) and value > 0:
                                field_name_lower = key.lower()
                                if 'value' in field_name_lower or 'amount' in field_name_lower:
                                    expense_value = value
                                    break
                        
                        total_value += expense_value
                        
                        if user_id not in user_totals:
                            user_totals[user_id] = 0
                        user_totals[user_id] += expense_value
                    
                    print(f"  Valor total: R$ {total_value:.2f}")
                    print(f"  Usuários: {len(user_totals)}")
                    
                    # Top 5 usuários
                    top_users = sorted(user_totals.items(), key=lambda x: x[1], reverse=True)[:5]
                    print(f"  Top 5 usuários:")
                    for user_id, value in top_users:
                        print(f"    User {user_id}: R$ {value:.2f}")
                    
                    period_results[description] = {
                        'total_expenses': len(expenses),
                        'total_value': total_value,
                        'user_totals': user_totals,
                        'top_users': top_users
                    }
                    
            else:
                print(f"  ❌ Erro: {response.status_code}")
                
        except Exception as e:
            print(f"  ❌ Exceção: {e}")
    
    return period_results

def main():
    """Função principal"""
    print("QUEBRANDO O BLOQUEIO DO ENDPOINT /expenses")
    print("="*80)
    print("Estratégia: Usar padrão de busca descoberto no backend")
    print("="*80)
    
    # 1. Testar padrões de busca
    successful_patterns = test_expenses_with_search_pattern()
    
    # 2. Analisar dados financeiros
    financial_analysis = analyze_expenses_for_financial_calculations(successful_patterns)
    
    # 3. Testar cálculos avançados
    advanced_calculations = test_advanced_financial_calculations()
    
    # 4. Salvar resultados
    results = {
        'investigation_date': datetime.now().isoformat(),
        'successful_patterns': successful_patterns,
        'financial_analysis': financial_analysis,
        'advanced_calculations': advanced_calculations,
        'breakthrough': len(successful_patterns) > 0
    }
    
    output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/expenses_breakthrough.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n\nResultados salvos em: {output_file}")
    print("\n" + "="*80)
    print("BREAKTHROUGH DO ENDPOINT /expenses!")
    print("="*80)
    
    if successful_patterns:
        print(f"🎯 ENCONTRADO {len(successful_patterns)} padrões funcionais!")
        print("Agora podemos calcular os dados financeiros da planilha!")
    else:
        print("❌ Nenhum padrão funcionou. Precisamos investigar mais.")

if __name__ == "__main__":
    main()
