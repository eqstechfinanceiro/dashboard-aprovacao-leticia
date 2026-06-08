import requests
import json
from datetime import datetime
from collections import Counter

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

def get_all_reports():
    """Obtém todos os reports"""
    print("OBTENDO TODOS OS REPORTS")
    print("="*60)
    
    params = {"paginate": "false", "per_page": 1000}
    
    try:
        url = f"{BASE_URL}/reports"
        response = requests.get(url, headers=headers, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                reports = data['data']
                print(f"Total de reports: {len(reports)}")
                return reports
    except Exception as e:
        print(f"Erro: {e}")
    
    return []

def analyze_report_types(reports):
    """Analisa tipos de reports"""
    print(f"\nANALISANDO TIPOS DE REPORTS")
    print("="*60)
    
    # Extrair descrições
    descriptions = [r.get('description', '') for r in reports]
    
    # Contar tipos
    description_counter = Counter(descriptions)
    
    print(f"Tipos únicos: {len(description_counter)}")
    print(f"\nTipos mais comuns:")
    
    for desc, count in description_counter.most_common(20):
        print(f"  {desc}: {count}x")
    
    # Procurar por tipos que podem conter dados de saldo
    saldo_keywords = ['SALDO', 'SALÁRIO', 'LIMITE', 'BALANCE', 'CARTÃO', 'CARD', 'CRÉDITO', 'CREDITO']
    
    saldo_reports = []
    for report in reports:
        description = report.get('description', '').upper()
        
        if any(keyword in description for keyword in saldo_keywords):
            saldo_reports.append(report)
    
    print(f"\nReports que podem conter dados de saldo: {len(saldo_reports)}")
    
    for report in saldo_reports:
        print(f"  - {report.get('description', '')} (ID: {report.get('id')})")
    
    return description_counter, saldo_reports

def search_reports_by_pattern(reports, pattern):
    """Procura reports por padrão"""
    print(f"\nPROCURANDO REPORTS COM: {pattern}")
    print("="*60)
    
    matching_reports = []
    
    for report in reports:
        description = report.get('description', '').upper()
        
        if pattern.upper() in description:
            matching_reports.append(report)
    
    print(f"Reports encontrados: {len(matching_reports)}")
    
    for report in matching_reports[:10]:
        print(f"  - {report.get('description', '')} (ID: {report.get('id')})")
    
    return matching_reports

def main():
    """Função principal"""
    print("INVESTIGAÇÃO DE TIPOS DE REPORTS")
    print("="*80)
    
    # 1. Obter todos os reports
    reports = get_all_reports()
    
    if not reports:
        print("Nenhum report encontrado")
        return
    
    # 2. Analisar tipos
    description_counter, saldo_reports = analyze_report_types(reports)
    
    # 3. Procurar por padrões específicos
    patterns = ['CAIXA', 'FATURA', 'SALDO', 'LIMITE', 'CARTÃO', 'MENSAL']
    
    for pattern in patterns:
        matching = search_reports_by_pattern(reports, pattern)
    
    # 4. Salvar resultados
    results = {
        'investigation_date': datetime.now().isoformat(),
        'total_reports': len(reports),
        'unique_types': len(description_counter),
        'saldo_reports_count': len(saldo_reports),
        'saldo_reports': [{'id': r.get('id'), 'description': r.get('description')} for r in saldo_reports],
        'common_types': dict(description_counter.most_common(30)),
        'conclusion': ''
    }
    
    if saldo_reports:
        results['conclusion'] = f'ENCONTRADOS {len(saldo_reports)} REPORTS POTENCIALMENTE RELACIONADOS A SALDO'
    else:
        results['conclusion'] = 'NENHUM REPORT RELACIONADO A SALDO ENCONTRADO'
    
    output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/report_types_analysis.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n\nSalvo em: {output_file}")
    
    print("\n" + "="*80)
    print("INVESTIGAÇÃO CONCLUÍDA!")
    print("="*80)

if __name__ == "__main__":
    main()
