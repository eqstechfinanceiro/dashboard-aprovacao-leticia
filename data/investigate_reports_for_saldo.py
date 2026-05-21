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

def get_reports_detailed():
    """Obtém reports detalhados"""
    print("OBTENDO REPORTS DA API")
    print("="*60)
    
    params = {"paginate": "false", "per_page": 100}
    
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

def analyze_report_fields(reports):
    """Analisa campos dos reports para encontrar dados de saldo"""
    print(f"\nANALISANDO CAMPOS DOS REPORTS")
    print("="*60)
    
    # Procurar por campos que contenham valores financeiros
    financial_fields = {}
    
    for i, report in enumerate(reports[:50]):  # Primeiros 50
        report_id = report.get('id')
        description = report.get('description', '')
        
        # Procurar campos numéricos
        for key, value in report.items():
            if isinstance(value, (int, float)) and abs(value) > 10:
                if key not in financial_fields:
                    financial_fields[key] = []
                
                financial_fields[key].append({
                    'report_id': report_id,
                    'description': description,
                    'value': value
                })
    
    print(f"Campos financeiros encontrados: {len(financial_fields)}")
    
    for field, values in financial_fields.items():
        print(f"\n{field}:")
        print(f"  Ocorrências: {len(values)}")
        
        # Mostrar exemplos
        for v in values[:5]:
            print(f"    Report {v['report_id']} ({v['description'][:30]}...): R$ {v['value']:.2f}")
    
    return financial_fields

def search_saldo_values_in_reports(reports):
    """Procura especificamente pelos valores de saldo da planilha"""
    print(f"\nPROCURANDO VALORES ESPECÍFICOS DE SALDO")
    print("="*60)
    
    # Valores que procuramos da planilha
    target_values = [6945.16, 6626.04, 6504.20, -98.92, -428.82, 291.66, 18329.5, 20, 5, 1154.94]
    
    matches = []
    
    for report in reports:
        report_id = report.get('id')
        description = report.get('description', '')
        
        for key, value in report.items():
            if isinstance(value, (int, float)):
                for target in target_values:
                    if abs(value - target) < 1:  # Tolerância de 1
                        matches.append({
                            'report_id': report_id,
                            'description': description,
                            'field': key,
                            'value': value,
                            'target': target,
                            'diff': abs(value - target)
                        })
                        
                        print(f"✅ ENCONTRADO!")
                        print(f"   Report {report_id}: {description}")
                        print(f"   Campo: {key}")
                        print(f"   Valor: R$ {value:.2f}")
                        print(f"   Esperado: R$ {target:.2f}")
    
    print(f"\nTotal de correspondências: {len(matches)}")
    
    return matches

def investigate_report_details(reports):
    """Investiga detalhes específicos dos reports"""
    print(f"\nINVESTIGANDO DETALHES DOS REPORTS")
    print("="*60)
    
    # Filtrar reports que parecem relevantes (CAIXA, SALDO, etc)
    relevant_reports = []
    
    for report in reports:
        description = report.get('description', '').upper()
        
        if any(keyword in description for keyword in ['CAIXA', 'SALDO', 'ABRIL', 'MAIO', 'QUINZENA']):
            relevant_reports.append(report)
    
    print(f"Reports relevantes: {len(relevant_reports)}")
    
    # Analisar cada report relevante
    for report in relevant_reports[:10]:  # Primeiros 10
        report_id = report.get('id')
        description = report.get('description', '')
        
        print(f"\nReport {report_id}: {description}")
        
        # Mostrar todos os campos
        for key, value in report.items():
            if key not in ['id', 'description', 'created_at', 'updated_at']:
                if isinstance(value, (int, float)) and abs(value) > 1:
                    print(f"  {key}: R$ {value:.2f}")
                elif isinstance(value, str) and len(value) < 100:
                    print(f"  {key}: {value}")

def main():
    """Função principal"""
    print("INVESTIGAÇÃO DE REPORTS - FONTE DOS DADOS DE SALDO")
    print("="*80)
    
    # 1. Obter reports
    reports = get_reports_detailed()
    
    if not reports:
        print("Nenhum report encontrado")
        return
    
    # 2. Analisar campos financeiros
    financial_fields = analyze_report_fields(reports)
    
    # 3. Procurar valores específicos
    matches = search_saldo_values_in_reports(reports)
    
    # 4. Investigar detalhes
    investigate_report_details(reports)
    
    # 5. Salvar resultados
    results = {
        'investigation_date': datetime.now().isoformat(),
        'total_reports': len(reports),
        'financial_fields': financial_fields,
        'saldo_value_matches': matches,
        'conclusion': ''
    }
    
    if matches:
        results['conclusion'] = 'VALORES DE SALDO ENCONTRADOS NOS REPORTS DA API'
    else:
        results['conclusion'] = 'VALORES DE SALDO NÃO ENCONTRADOS DIRETAMENTE'
    
    output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/reports_saldo_investigation.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n\nResultados salvos em: {output_file}")
    
    print("\n" + "="*80)
    print("INVESTIGAÇÃO CONCLUÍDA!")
    print("="*80)

if __name__ == "__main__":
    main()
