import requests
import json
from datetime import datetime
import os

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

def get_recent_reports():
    """Obtém reports mais recentes"""
    print("OBTENDO REPORTS MAIS RECENTES")
    print("="*60)
    
    params = {"paginate": "false", "per_page": 100}
    
    try:
        url = f"{BASE_URL}/reports"
        response = requests.get(url, headers=headers, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                reports = data['data']
                
                # Filtrar reports recentes
                current_date = datetime.now()
                recent_reports = []
                
                for report in reports:
                    created_at = report.get('created_at', '')
                    if created_at:
                        try:
                            report_date = datetime.strptime(created_at, '%Y-%m-%d %H:%M:%S')
                            if (current_date - report_date).days <= 60:
                                recent_reports.append(report)
                        except:
                            continue
                
                print(f"Reports recentes: {len(recent_reports)}")
                return recent_reports
                
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

def extract_text_from_pdf(pdf_content):
    """Extrai texto do PDF"""
    try:
        import PyPDF2
        from io import BytesIO
        
        pdf_file = BytesIO(pdf_content)
        pdf_reader = PyPDF2.PdfReader(pdf_file)
        
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text() + "\n"
        
        return text
        
    except ImportError:
        print("PyPDF2 não instalado")
        return None
    except Exception as e:
        print(f"Erro ao extrair texto: {e}")
        return None

def search_saldo_values_in_pdf_text(text, report_id):
    """Procura por valores de saldo no texto do PDF"""
    print(f"\nProcurando valores de saldo no PDF do report {report_id}")
    
    target_values = [6945.16, 6626.04, 6504.20, -98.92, -428.82, 291.66, 18329.5, 20, 5, 1154.94]
    
    matches = []
    
    if text:
        for target in target_values:
            target_str = str(target)
            if target_str in text:
                matches.append({
                    'target': target,
                    'found': True
                })
                print(f"  ✅ Encontrado: {target}")
    
    return matches

def analyze_pdf_structure(pdf_content, report_id):
    """Analisa estrutura do PDF"""
    try:
        import PyPDF2
        from io import BytesIO
        
        pdf_file = BytesIO(pdf_content)
        pdf_reader = PyPDF2.PdfReader(pdf_file)
        
        print(f"\nEstrutura do PDF report {report_id}:")
        print(f"  Páginas: {len(pdf_reader.pages)}")
        
        # Extrair texto das primeiras páginas
        for i, page in enumerate(pdf_reader.pages[:3]):
            text = page.extract_text()
            print(f"\n  Página {i+1} (primeiras 500 caracteres):")
            print(f"    {text[:500]}...")
        
        return True
        
    except Exception as e:
        print(f"Erro ao analisar PDF: {e}")
        return False

def main():
    """Função principal"""
    print("BAIXANDO E ANALISANDO PDFs DOS REPORTS")
    print("="*80)
    
    # 1. Obter reports recentes
    reports = get_recent_reports()
    
    if not reports:
        print("Nenhum report encontrado")
        return
    
    # 2. Filtrar reports com PDF
    pdf_reports = [r for r in reports if r.get('pdf_link')]
    
    print(f"Reports com PDF: {len(pdf_reports)}")
    
    # 3. Analisar primeiros 3 reports
    results = {}
    
    for i, report in enumerate(pdf_reports[:3]):
        report_id = report.get('id')
        description = report.get('description', '')
        
        print(f"\n{'='*60}")
        print(f"Report {i+1}/3: {description}")
        print(f"ID: {report_id}")
        print(f"{'='*60}")
        
        # Baixar PDF
        pdf_content = download_report_pdf(report)
        
        if pdf_content:
            print(f"PDF baixado: {len(pdf_content)} bytes")
            
            # Analisar estrutura
            analyze_pdf_structure(pdf_content, report_id)
            
            # Extrair texto
            text = extract_text_from_pdf(pdf_content)
            
            if text:
                print(f"\nTexto extraído: {len(text)} caracteres")
                
                # Procurar valores de saldo
                matches = search_saldo_values_in_pdf_text(text, report_id)
                
                results[f"report_{report_id}"] = {
                    'description': description,
                    'pdf_size': len(pdf_content),
                    'text_length': len(text) if text else 0,
                    'saldo_matches': matches
                }
        else:
            print("Erro ao baixar PDF")
    
    # 4. Salvar resultados
    output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/report_pdfs_analysis.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n\nSalvo em: {output_file}")
    
    print("\n" + "="*80)
    print("INVESTIGAÇÃO CONCLUÍDA!")
    print("="*80)

if __name__ == "__main__":
    main()
