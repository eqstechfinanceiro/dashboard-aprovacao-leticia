import requests
import json
import pandas as pd
from datetime import datetime
import io
import openpyxl

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json"
}

def download_report_excel(report_id, report_description):
    """Baixa o arquivo Excel de um relatório específico"""
    print(f"\nBAIXANDO EXCEL DO REPORT {report_id} - {report_description}")
    print("="*60)
    
    try:
        # Primeiro, obter o relatório para pegar o link do Excel
        report_url = f"{BASE_URL}/reports/{report_id}"
        response = requests.get(report_url, headers=headers)
        
        if response.status_code != 200:
            print(f"Erro ao obter relatório: {response.status_code}")
            return None
        
        report_data = response.json()
        if 'data' not in report_data:
            print("Relatório não tem campo 'data'")
            return None
        
        report = report_data['data']
        excel_link = report.get('excel_link')
        
        if not excel_link:
            print("Relatório não tem link para Excel")
            return None
        
        print(f"Link Excel: {excel_link}")
        
        # Baixar o arquivo Excel
        excel_response = requests.get(excel_link, headers=headers)
        
        if excel_response.status_code != 200:
            print(f"Erro ao baixar Excel: {excel_response.status_code}")
            return None
        
        # Tentar ler o Excel
        try:
            # Salvar em memória
            excel_file = io.BytesIO(excel_response.content)
            
            # Ler com pandas
            excel_data = pd.read_excel(excel_file, sheet_name=None)
            
            print(f"Excel baixado com {len(excel_data)} abas:")
            for sheet_name, df in excel_data.items():
                print(f"  - {sheet_name}: {len(df)} linhas, {len(df.columns)} colunas")
                print(f"    Colunas: {list(df.columns)}")
                
                # Procurar por dados financeiros
                financial_columns = []
                for col in df.columns:
                    col_lower = str(col).lower()
                    if any(keyword in col_lower for keyword in ['valor', 'value', 'total', 'saldo', 'amount']):
                        financial_columns.append(col)
                
                if financial_columns:
                    print(f"    Colunas financeiras: {financial_columns}")
                    
                    # Mostrar amostra de dados financeiros
                    for col in financial_columns:
                        sample_values = df[col].dropna().head(3).tolist()
                        print(f"      {col}: {sample_values}")
            
            return excel_data
            
        except Exception as e:
            print(f"Erro ao ler Excel: {e}")
            return None
            
    except Exception as e:
        print(f"Exceção: {e}")
        return None

def analyze_multiple_reports():
    """Analisa múltiplos relatórios para encontrar padrões financeiros"""
    print("ANALISANDO MÚLTIPLOS RELATÓRIOS")
    print("="*80)
    
    # Obter lista de relatórios
    try:
        url = f"{BASE_URL}/reports"
        params = {"paginate": "false", "per_page": 20}
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code != 200:
            print(f"Erro ao obter relatórios: {response.status_code}")
            return
        
        data = response.json()
        if 'data' not in data:
            print("Resposta não tem campo 'data'")
            return
        
        reports = data['data']
        print(f"Encontrados {len(reports)} relatórios")
        
        # Filtrar relatórios interessantes
        interesting_reports = []
        
        for report in reports:
            # Relatórios de abril 2026 (nosso alvo)
            description = report.get('description', '').lower()
            if 'abril' in description or '04' in description or '2026' in description:
                interesting_reports.append(report)
            
            # Relatórios aprovados (provavelmente têm dados financeiros)
            elif report.get('status') == 'APROVADO':
                interesting_reports.append(report)
        
        print(f"Relatórios interessantes: {len(interesting_reports)}")
        
        # Analisar alguns relatórios
        analyzed_reports = []
        
        for i, report in enumerate(interesting_reports[:5]):  # Primeiros 5
            report_id = report['id']
            description = report.get('description', 'Sem descrição')
            status = report.get('status', 'Unknown')
            
            print(f"\n{'='*80}")
            print(f"RELATÓRIO {i+1}: {report_id} - {description} - {status}")
            print(f"{'='*80}")
            
            excel_data = download_report_excel(report_id, description)
            
            if excel_data is not None:
                analyzed_reports.append({
                    'report_id': report_id,
                    'description': description,
                    'status': status,
                    'excel_data': excel_data,
                    'sheets': list(excel_data.keys())
                })
        
        return analyzed_reports
        
    except Exception as e:
        print(f"Exceção: {e}")
        return []

def search_for_financial_patterns(analyzed_reports):
    """Procura por padrões financeiros nos relatórios analisados"""
    print("\nPROCURANDO POR PADRÕES FINANCEIROS")
    print("="*80)
    
    all_financial_data = []
    
    for report_info in analyzed_reports:
        print(f"\nAnalisando relatório: {report_info['description']}")
        
        excel_data = report_info['excel_data']
        
        for sheet_name, df in excel_data.items():
            print(f"\nAba: {sheet_name}")
            
            # Procurar colunas que possam corresponder aos campos da planilha
            target_columns = [
                'saldo reembolsar', 'saldo final', 'saldo cartao', 
                'reembolso', 'carga parcial', 'carga final',
                '1qz', 'adiantamento'
            ]
            
            found_columns = []
            for col in df.columns:
                col_lower = str(col).lower().strip()
                for target in target_columns:
                    if target in col_lower or col_lower in target:
                        found_columns.append((col, target))
                        break
            
            if found_columns:
                print(f"  Colunas correspondentes encontradas: {found_columns}")
                
                # Analisar dados dessas colunas
                for col, target in found_columns:
                    non_null_values = df[col].dropna()
                    if len(non_null_values) > 0:
                        print(f"    {col} ({target}): {len(non_null_values)} valores não nulos")
                        
                        # Tentar identificar padrões
                        if target == '1qz':
                            # Valores de 1QZ devem ser positivos e significativos
                            positive_values = non_null_values[non_null_values > 0]
                            if len(positive_values) > 0:
                                print(f"      Valores positivos (1QZ): min={positive_values.min():.2f}, max={positive_values.max():.2f}, avg={positive_values.mean():.2f}")
                        
                        elif 'saldo' in target:
                            # Saldos podem ser positivos ou negativos
                            print(f"      Saldos: min={non_null_values.min():.2f}, max={non_null_values.max():.2f}, avg={non_null_values.mean():.2f}")
                        
                        # Mostrar alguns valores
                        sample_values = non_null_values.head(5).tolist()
                        print(f"      Amostra: {sample_values}")
            
            # Salvar dados financeiros encontrados
            financial_cols = [col for col, _ in found_columns]
            if financial_cols:
                financial_df = df[['description'] if 'description' in df.columns else [] + financial_cols]
                if not financial_df.empty:
                    all_financial_data.append({
                        'report': report_info['description'],
                        'sheet': sheet_name,
                        'data': financial_df.to_dict('records')[:10]  # Primeiras 10 linhas
                    })
    
    return all_financial_data

def try_expenses_endpoint_with_correct_filters():
    """Tenta o endpoint expenses com os filtros corretos"""
    print("\nTENTANDO ENDPOINT EXPENSES COM FILTROS CORRETOS")
    print("="*80)
    
    # A API disse que "Filter fields are required"
    # Vamos tentar diferentes combinações de filtros obrigatórios
    filter_combinations = [
        # Tentar com apenas user_id
        {"user_id": 890792},
        
        # Tentar com datas
        {"start_date": "2026-04-01", "end_date": "2026-04-30"},
        
        # Tentar com report_id
        {"report_id": 7603397},
        
        # Tentar combinações
        {"user_id": 890792, "start_date": "2026-04-01", "end_date": "2026-04-30"},
        {"report_id": 7603397, "start_date": "2026-04-01", "end_date": "2026-04-30"},
        
        # Tentar sem paginação
        {"user_id": 890792, "paginate": "false"},
        {"start_date": "2026-04-01", "end_date": "2026-04-30", "paginate": "false"},
    ]
    
    for i, filters in enumerate(filter_combinations):
        print(f"\nTestando filtros {i+1}: {filters}")
        
        try:
            url = f"{BASE_URL}/expenses"
            response = requests.get(url, headers=headers, params=filters)
            
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ SUCESSO! Campos: {list(data.keys()) if isinstance(data, dict) else type(data)}")
                
                if 'data' in data and isinstance(data['data'], list):
                    expenses = data['data']
                    print(f"Encontrados {len(expenses)} expenses")
                    
                    if expenses:
                        sample_expense = expenses[0]
                        print(f"Campos da expense: {list(sample_expense.keys())}")
                        
                        # Procurar campos financeiros
                        financial_fields = []
                        for key, value in sample_expense.items():
                            if isinstance(value, (int, float)) and value > 0:
                                field_name_lower = key.lower()
                                if any(keyword in field_name_lower for keyword in ['value', 'amount', 'total']):
                                    financial_fields.append((key, value))
                        
                        print(f"Campos financeiros: {financial_fields}")
                        
                        # Mostrar amostra
                        for j in range(min(3, len(expenses))):
                            expense = expenses[j]
                            financial_data = {k: v for k, v in expense.items() if isinstance(v, (int, float))}
                            print(f"  Expense {j+1}: {financial_data}")
                        
                        return expenses  # Retornar primeiro sucesso
            else:
                print(f"Erro: {response.text}")
                
        except Exception as e:
            print(f"Exceção: {e}")
    
    return None

def main():
    """Função principal"""
    print("INVESTIGAÇÃO AVANÇADA DE DADOS FINANCEIROS")
    print("="*80)
    print("Estratégia: Baixar arquivos Excel dos relatórios para encontrar dados financeiros")
    print("="*80)
    
    # 1. Tentar endpoint expenses com filtros corretos
    expenses = try_expenses_endpoint_with_correct_filters()
    
    # 2. Se não funcionar, baixar relatórios Excel
    analyzed_reports = analyze_multiple_reports()
    
    # 3. Procurar padrões financeiros
    financial_data = search_for_financial_patterns(analyzed_reports)
    
    # 4. Salvar resultados
    results = {
        'investigation_date': datetime.now().isoformat(),
        'expenses_endpoint': {
            'success': expenses is not None,
            'count': len(expenses) if expenses else 0,
            'sample': expenses[:3] if expenses else []
        },
        'analyzed_reports': {
            'count': len(analyzed_reports),
            'reports': [
                {
                    'report_id': r['report_id'],
                    'description': r['description'],
                    'status': r['status'],
                    'sheets': r['sheets']
                }
                for r in analyzed_reports
            ]
        },
        'financial_patterns': financial_data
    }
    
    output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/advanced_financial_investigation.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n\nResultados salvos em: {output_file}")
    print("\n" + "="*80)
    print("INVESTIGAÇÃO AVANÇADA CONCLUÍDA!")
    print("="*80)

if __name__ == "__main__":
    main()
