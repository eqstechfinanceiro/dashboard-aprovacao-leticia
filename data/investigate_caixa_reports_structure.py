import requests
import json
from datetime import datetime
import PyPDF2
from io import BytesIO
import re

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

def get_caixa_reports():
    """Obtém reports do tipo CAIXA"""
    params = {"paginate": "false", "per_page": 1000}
    
    try:
        url = f"{BASE_URL}/reports"
        response = requests.get(url, headers=headers, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                reports = data['data']
                # Filtrar por CAIXA 04/2026 (mesmo período da planilha)
                caixa_reports = [r for r in reports if 'CAIXA 04/2026' in r.get('description', '')]
                return caixa_reports
    except Exception as e:
        print(f"Erro: {e}")
    
    return []

def download_report_pdf(report):
    """Baixa o PDF de um report"""
    pdf_link = report.get('pdf_link', '')
    
    if not pdf_link:
        return None
    
    try:
        response = requests.get(pdf_link, headers=headers, timeout=30)
        
        if response.status_code == 200:
            return response.content
    except Exception as e:
        print(f"Erro ao baixar PDF: {e}")
    
    return None

def analyze_caixa_pdf_structure(pdf_content, report_id, description):
    """Analisa estrutura de PDF de CAIXA"""
    print(f"\n{'='*80}")
    print(f"Report: {description}")
    print(f"ID: {report_id}")
    print(f"{'='*80}")
    
    try:
        pdf_file = BytesIO(pdf_content)
        pdf_reader = PyPDF2.PdfReader(pdf_file)
        
        print(f"Páginas: {len(pdf_reader.pages)}")
        
        full_text = ""
        for page in pdf_reader.pages:
            full_text += page.extract_text() + "\n"
        
        # Procurar por seções específicas
        keywords = [
            'SALDO',
            'RESUMO POR USUÁRIO',
            'RESUMO POR PROJETO',
            'TOTAL POR USUÁRIO',
            'USUÁRIO',
            '1QZ',
            'QUINZENA',
            'ADIANTAMENTO',
            'REEMBOLSO',
            'CARGA'
        ]
        
        found_keywords = []
        
        for keyword in keywords:
            if keyword in full_text.upper():
                index = full_text.upper().find(keyword)
                start = max(0, index - 200)
                end = min(len(full_text), index + 300)
                context = full_text[start:end]
                
                found_keywords.append({
                    'keyword': keyword,
                    'context': context
                })
                
                print(f"\n✅ Encontrado: {keyword}")
                print(f"Contexto: {context}")
        
        # Procurar pelos valores específicos da planilha
        print(f"\n\nPROCURANDO VALORES ESPECÍFICOS DA PLANILHA")
        print("="*60)
        
        target_values = {
            '6945.16': 6945.16,
            '6626.04': 6626.04,
            '6504.20': 6504.20,
            '-98.92': -98.92,
            '-428.82': -428.82,
            '291.66': 291.66,
            '18329.5': 18329.5,
            '1154.94': 1154.94
        }
        
        found_values = []
        
        for value_str, value in target_values.items():
            for fmt in [value_str, str(int(value)), str(value).replace('.', ',')]:
                if fmt in full_text:
                    index = full_text.find(fmt)
                    start = max(0, index - 300)
                    end = min(len(full_text), index + 300)
                    context = full_text[start:end]
                    
                    found_values.append({
                        'value': value,
                        'found_as': fmt,
                        'context': context
                    })
                    
                    print(f"\n✅ {value} encontrado como '{fmt}'")
                    print(f"Contexto: {context}")
        
        return found_keywords, found_values
        
    except Exception as e:
        print(f"Erro: {e}")
        import traceback
        traceback.print_exc()
        return [], []

def main():
    """Função principal"""
    print("ANALISANDO REPORTS DE CAIXA (MESMO PERÍODO DA PLANILHA)")
    print("="*80)
    
    # 1. Obter reports de CAIXA 04/2026
    caixa_reports = get_caixa_reports()
    
    print(f"Reports CAIXA 04/2026: {len(caixa_reports)}")
    
    if not caixa_reports:
        print("Nenhum report encontrado")
        return
    
    # 2. Analisar primeiro report
    report = caixa_reports[0]
    report_id = report.get('id')
    description = report.get('description', '')
    
    # Baixar PDF
    pdf_content = download_report_pdf(report)
    
    if pdf_content:
        keywords, values = analyze_caixa_pdf_structure(pdf_content, report_id, description)
        
        # Salvar resultados
        results = {
            'investigation_date': datetime.now().isoformat(),
            'report_id': report_id,
            'description': description,
            'found_keywords': keywords,
            'found_values': values,
            'total_caixa_reports': len(caixa_reports)
        }
        
        output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/caixa_pdf_structure.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        
        print(f"\n\nSalvo em: {output_file}")
    
    print("\n" + "="*80)
    print("ANÁLISE CONCLUÍDA!")
    print("="*80)

if __name__ == "__main__":
    main()
