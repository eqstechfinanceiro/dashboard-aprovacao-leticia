import json
import pandas as pd
from datetime import datetime
import requests
import time

def load_api_data():
    """Carrega dados existentes da API"""
    print("Carregando dados existentes...")
    
    # Carregar reports.json
    with open('/home/haumea/Projects/dashboard-aprovacao-leticia/reports.json', 'r', encoding='utf-8') as f:
        reports_json = json.load(f)
    
    # Extrair o array de dados do JSON
    if isinstance(reports_json, dict) and 'data' in reports_json:
        reports_data = reports_json['data']
    else:
        reports_data = reports_json
    
    print(f"Reports carregados: {len(reports_data)} registros")
    return reports_data

def analyze_expenses_structure(reports_data):
    """Analisa estrutura detalhada das despesas para encontrar campos financeiros"""
    print("\n" + "="*80)
    print("ANÁLISE ESTRUTURAL DE EXPENSES")
    print("="*80)
    
    # Pegar amostra de expenses para análise
    sample_expenses = []
    for report in reports_data[:100]:  # Primeiros 100 relatórios
        if 'expenses' in report and report['expenses']:
            sample_expenses.extend(report['expenses'])
    
    print(f"Total de expenses amostrados: {len(sample_expenses)}")
    
    if not sample_expenses:
        print("Nenhuma expense encontrada nos dados")
        return {}
    
    # Analisar estrutura completa
    all_fields = set()
    field_types = {}
    field_values = {}
    
    for expense in sample_expenses[:50]:  # Primeiras 50 para análise detalhada
        for key, value in expense.items():
            all_fields.add(key)
            
            if key not in field_types:
                field_types[key] = set()
            field_types[key].add(type(value).__name__)
            
            if key not in field_values:
                field_values[key] = set()
            if value is not None and str(value) != '':
                field_values[key].add(str(value))
    
    print("\nCampos encontrados em expenses:")
    for field in sorted(all_fields):
        types = ', '.join(field_types[field])
        sample_vals = list(field_values[field])[:3]
        print(f"  {field}: {types} | Exemplos: {sample_vals}")
    
    # Campos financeiros potenciais
    financial_fields = []
    for field in all_fields:
        if any(keyword in field.lower() for keyword in ['value', 'amount', 'balance', 'saldo', 'total', 'sum']):
            financial_fields.append(field)
    
    print(f"\nCampos financeiros potenciais: {financial_fields}")
    
    return {
        'all_fields': list(all_fields),
        'financial_fields': financial_fields,
        'field_types': {k: list(v) for k, v in field_types.items()},
        'sample_expenses': sample_expenses[:10]
    }

def analyze_reports_structure(reports_data):
    """Analisa estrutura de Reports para encontrar dados financeiros"""
    print("\n" + "="*80)
    print("ANÁLISE ESTRUTURAL DE REPORTS")
    print("="*80)
    
    sample_reports = reports_data[:50]  # Primeiros 50 relatórios
    
    all_fields = set()
    field_types = {}
    field_values = {}
    
    for report in sample_reports:
        for key, value in report.items():
            all_fields.add(key)
            
            if key not in field_types:
                field_types[key] = set()
            field_types[key].add(type(value).__name__)
            
            if key not in field_values:
                field_values[key] = set()
            if value is not None and str(value) != '':
                field_values[key].add(str(value))
    
    print("\nCampos encontrados em reports:")
    for field in sorted(all_fields):
        types = ', '.join(field_types[field])
        sample_vals = list(field_values[field])[:3]
        print(f"  {field}: {types} | Exemplos: {sample_vals}")
    
    # Campos financeiros potenciais
    financial_fields = []
    for field in all_fields:
        if any(keyword in field.lower() for keyword in ['value', 'amount', 'balance', 'saldo', 'total', 'sum', 'payment']):
            financial_fields.append(field)
    
    print(f"\nCampos financeiros potenciais: {financial_fields}")
    
    return {
        'all_fields': list(all_fields),
        'financial_fields': financial_fields,
        'field_types': {k: list(v) for k, v in field_types.items()},
        'sample_reports': sample_reports[:5]
    }

def analyze_payment_methods(reports_data):
    """Analisa PaymentMethods para identificar tipos de cartões"""
    print("\n" + "="*80)
    print("ANÁLISE DE PAYMENT METHODS")
    print("="*80)
    
    # Coletar todos os payment methods
    payment_methods = set()
    payment_method_details = {}
    
    for report in reports_data:
        if 'expenses' in report:
            for expense in report['expenses']:
                if 'payment_method' in expense:
                    pm = expense['payment_method']
                    if pm:
                        payment_methods.add(pm.get('name', str(pm)))
                        payment_method_details[pm.get('name', str(pm))] = pm
    
    print("\nPayment Methods encontrados:")
    for pm in sorted(payment_methods):
        details = payment_method_details.get(pm, {})
        print(f"  {pm}: {details}")
    
    # Procurar por cartões Itaú e VExpenses
    itau_methods = [pm for pm in payment_methods if 'itaú' in pm.lower() or 'itau' in pm.lower()]
    vexpenses_methods = [pm for pm in payment_methods if 'vexpenses' in pm.lower() or 'vex' in pm.lower()]
    
    print(f"\nMétodos Itaú: {itau_methods}")
    print(f"Métodos VExpenses: {vexpenses_methods}")
    
    return {
        'all_methods': list(payment_methods),
        'itau_methods': itau_methods,
        'vexpenses_methods': vexpenses_methods,
        'details': payment_method_details
    }

def analyze_advances(reports_data):
    """Analisa Advances para entender ADIANTAMENTO"""
    print("\n" + "="*80)
    print("ANÁLISE DE ADVANCES")
    print("="*80)
    
    advances_found = []
    
    for report in reports_data:
        if 'advance' in report and report['advance']:
            advances_found.append(report['advance'])
    
    print(f"Total de advances encontrados: {len(advances_found)}")
    
    if advances_found:
        print("\nEstrutura dos advances:")
        sample_advance = advances_found[0]
        for key, value in sample_advance.items():
            print(f"  {key}: {value} ({type(value).__name__})")
        
        # Valores de advances
        advance_values = [adv.get('value', 0) for adv in advances_found if 'value' in adv]
        if advance_values:
            print(f"\nValores de advances: min={min(advance_values)}, max={max(advance_values)}, avg={sum(advance_values)/len(advance_values)}")
    
    return {
        'count': len(advances_found),
        'sample': advances_found[:3] if advances_found else [],
        'values': [adv.get('value', 0) for adv in advances_found if 'value' in adv]
    }

def analyze_status_patterns(reports_data):
    """Analisa padrões de status que podem indicar saldos"""
    print("\n" + "="*80)
    print("ANÁLISE DE STATUS PATTERNS")
    print("="*80)
    
    # Status de reports
    report_statuses = set()
    for report in reports_data:
        if 'status' in report:
            report_statuses.add(report['status'])
    
    print(f"Status de reports: {report_statuses}")
    
    # Status de expenses
    expense_statuses = set()
    for report in reports_data:
        if 'expenses' in report:
            for expense in report['expenses']:
                if 'on' in expense:
                    expense_statuses.add(expense['on'])
                if 'status' in expense:
                    expense_statuses.add(expense['status'])
    
    print(f"Status de expenses: {expense_statuses}")
    
    # Procurar por campos que possam indicar situação financeira
    financial_status_fields = []
    for report in reports_data[:10]:
        for key, value in report.items():
            if any(keyword in str(value).lower() for keyword in ['pendente', 'aprovado', 'pago', 'reembolsado']):
                financial_status_fields.append((key, value))
    
    print(f"\nCampos com status financeiro: {financial_status_fields[:5]}")
    
    return {
        'report_statuses': list(report_statuses),
        'expense_statuses': list(expense_statuses),
        'financial_status_fields': financial_status_fields[:10]
    }

def calculate_financial_metrics(reports_data):
    """Tenta calcular métricas financeiras que possam corresponder aos campos da planilha"""
    print("\n" + "="*80)
    print("CÁLCULO DE MÉTRICAS FINANCEIRAS")
    print("="*80)
    
    # Agrupar por usuário
    user_metrics = {}
    
    for report in reports_data:
        user_id = report.get('user_id')
        if not user_id:
            continue
        
        if user_id not in user_metrics:
            user_metrics[user_id] = {
                'total_expenses': 0,
                'expenses_count': 0,
                'total_reports': 0,
                'approved_reports': 0,
                'paid_reports': 0,
                'advances': []
            }
        
        # Total de expenses
        if 'expenses' in report:
            for expense in report['expenses']:
                if expense.get('value'):
                    user_metrics[user_id]['total_expenses'] += expense['value']
                    user_metrics[user_id]['expenses_count'] += 1
        
        # Status dos reports
        user_metrics[user_id]['total_reports'] += 1
        if report.get('status') == 'APROVADO':
            user_metrics[user_id]['approved_reports'] += 1
        if report.get('status') == 'PAGO':
            user_metrics[user_id]['paid_reports'] += 1
        
        # Advances
        if 'advance' in report and report['advance']:
            user_metrics[user_id]['advances'].append(report['advance'])
    
    # Calcular métricas adicionais
    for user_id, metrics in user_metrics.items():
        # Total de advances
        advances_total = sum(adv.get('value', 0) for adv in metrics['advances'])
        metrics['total_advances'] = advances_total
        
        # Saldo potencial (expenses - advances)
        metrics['potential_balance'] = metrics['total_expenses'] - advances_total
    
    print(f"Usuários analisados: {len(user_metrics)}")
    
    # Mostrar amostra
    sample_users = list(user_metrics.items())[:5]
    for user_id, metrics in sample_users:
        print(f"\nUsuário {user_id}:")
        print(f"  Total Expenses: R$ {metrics['total_expenses']:.2f}")
        print(f"  Total Advances: R$ {metrics['total_advances']:.2f}")
        print(f"  Saldo Potencial: R$ {metrics['potential_balance']:.2f}")
        print(f"  Reports: {metrics['total_reports']} (Aprovados: {metrics['approved_reports']}, Pagos: {metrics['paid_reports']})")
    
    return user_metrics

def search_for_balance_patterns(reports_data):
    """Procura por padrões que possam indicar saldos"""
    print("\n" + "="*80)
    print("PROCURA POR PADRÕES DE SALDO")
    print("="*80)
    
    # Procurar por campos que possam conter saldos
    balance_candidates = []
    
    for report in reports_data[:100]:
        for key, value in report.items():
            if isinstance(value, (int, float)) and abs(value) > 0:
                # Verificar se o campo pode ser um saldo
                field_name_lower = key.lower()
                if any(keyword in field_name_lower for keyword in ['balance', 'saldo', 'amount', 'value', 'total']):
                    balance_candidates.append((key, value, type(value).__name__))
    
    print(f"Candidatos a saldos encontrados: {len(balance_candidates)}")
    for field, value, type_name in balance_candidates[:10]:
        print(f"  {field}: {value} ({type_name})")
    
    # Procurar por cálculos que possam gerar saldos
    calculation_patterns = []
    
    # Verificar se total_expenses - advance_value gera algum campo conhecido
    for report in reports_data[:50]:
        if 'expenses' in report and 'advance' in report:
            total_expenses = sum(exp.get('value', 0) for exp in report['expenses'] if exp.get('value'))
            advance_value = report['advance'].get('value', 0) if report['advance'] else 0
            
            potential_balance = total_expenses - advance_value
            
            # Verificar se este valor aparece em algum campo
            for key, value in report.items():
                if isinstance(value, (int, float)) and abs(value - potential_balance) < 0.01:
                    calculation_patterns.append((key, total_expenses, advance_value, potential_balance))
    
    print(f"\nPadrões de cálculo encontrados: {len(calculation_patterns)}")
    for pattern in calculation_patterns[:5]:
        field, expenses, advance, balance = pattern
        print(f"  {field}: {expenses} - {advance} = {balance}")
    
    return {
        'balance_candidates': balance_candidates[:20],
        'calculation_patterns': calculation_patterns[:10]
    }

def main():
    """Função principal de investigação"""
    print("INICIANDO INVESTIGAÇÃO DE DADOS FINANCEIROS")
    print("="*80)
    
    # Carregar dados
    reports_data = load_api_data()
    
    # Análises
    expenses_analysis = analyze_expenses_structure(reports_data)
    reports_analysis = analyze_reports_structure(reports_data)
    payment_methods = analyze_payment_methods(reports_data)
    advances_analysis = analyze_advances(reports_data)
    status_patterns = analyze_status_patterns(reports_data)
    financial_metrics = calculate_financial_metrics(reports_data)
    balance_patterns = search_for_balance_patterns(reports_data)
    
    # Salvar resultados
    results = {
        'investigation_date': datetime.now().isoformat(),
        'data_source': 'reports.json',
        'total_reports_analyzed': len(reports_data),
        'expenses_analysis': expenses_analysis,
        'reports_analysis': reports_analysis,
        'payment_methods': payment_methods,
        'advances_analysis': advances_analysis,
        'status_patterns': status_patterns,
        'financial_metrics_sample': dict(list(financial_metrics.items())[:10]),
        'balance_patterns': balance_patterns
    }
    
    output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/financial_data_investigation.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n\nInvestigação salva em: {output_file}")
    print("\n" + "="*80)
    print("INVESTIGAÇÃO CONCLUÍDA!")
    print("="*80)

if __name__ == "__main__":
    main()
