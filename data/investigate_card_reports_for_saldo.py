import requests
import json
from datetime import datetime
import PyPDF2
from io import BytesIO

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

def get_all_reports():
    """Obtém todos os reports"""
    params = {"paginate": "false", "per_page": 1000}
    
    try:
        url = f"{BASE_URL}/reports"
        response = requests.get(url, headers=headers, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                return data['data']
    except Exception as e:
        print(f"Erro: {e}")
    
    return []

def get_card_reports(reports):
    """Filtra reports de cartão"""
    saldo_keywords = ['CARTÃO', 'CARD', 'FATURA', 'CRÉDITO', 'CREDITO']
    
    card_reports = []
    for report in reports:
        description = report.get('description', '').upper()
        
        if any(keyword in description for keyword in saldo_keywords):
            card_reports.append(report)
    
    return card_reports

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

def extract_pdf_text(pdf_content):
    """Extrai texto do PDF"""
    try:
        pdf_file = BytesIO(pdf_content)
        pdf_reader = PyPDF2.PdfReader(pdf_file)
        
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text() + "\n"
        
        return text
        
    except Exception as e:
        print(f"Erro ao extrair texto: {e}")
        return None

def search_saldo_values_in_pdf(text, report_id, description):
    """Procura por valores de SALDO no PDF"""
    print(f"\n{'='*60}")
    print(f"Report: {description}")
    print(f"ID: {report_id}")
    print(f"{'='*60}")
    
    target_values = [6945.16, 6626.04, 6504.20, -98.92, -428.82, 291.66, 18329.5, 20, 5, 1154.94]
    
    found_values = []
    
    for target in target_values:
        formats = [
            f"{target:.2f}",
            f"{target:.0f}",
            str(target),
            str(target).replace('.', ','),
            f"R${target:.2f}",
            f"R$ {target:.2f}"
        ]
        
        for fmt in formats:
            if fmt in text:
                found_values.append({
                    'target': target,
                    'found_format': fmt
                })
                print(f"✅ Encontrado: {target} como {fmt}")
    
    return found_values

def main():
    """Função principal"""
    print("INVESTIGAÇÃO DE REPORTS DE CARTÃO PARA DADOS DE SALDO")
    print("="*80)
    
    # 1. Obter todos os reports
    reports = get_all_reports()
    
    if not reports:
        print("Nenhum report encontrado")
        return
    
    # 2. Filtrar reports de cartão
    card_reports = get_card_reports(reports)
    
    print(f"Reports de cartão encontrados: {len(card_reports)}")
    
    # 3. Analisar primeiros 10 reports de cartão
    results = {}
    total_matches = 0
    
    for i, report in enumerate(card_reports[:10]):
        report_id = report.get('id')
        description = report.get('description', '')
        
        # Baixar PDF
        pdf_content = download_report_pdf(report)
        
        if pdf_content:
            print(f"\n{i+1}/10: {description}")
            print(f"PDF baixado: {len(pdf_content)} bytes")
            
            # Extrair texto
            text = extract_pdf_text(pdf_content)
            
            if text:
                # Procurar valores de SALDO
                matches = search_saldo_values_in_pdf(text, report_id, description)
                
                if matches:
                    total_matches += len(matches)
                    results[f"report_{report_id}"] = {
                        'description': description,
                        'matches': matches
                    }
            else:
                print("Erro ao extrair texto")
        else:
            print(f"\n{i+1}/10: {description} - Erro ao baixar PDF")
    
    # 4. Salvar resultados
    output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/card_reports_saldo_analysis.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n\nResultados salvos em: {output_file}")
    
    print(f"\nTotal de correspondências: {total_matches}")
    
    if total_matches > 0:
        print("✅ VALORES DE SALDO ENCONTRADOS NOS REPORTS DE CARTÃO!")
    else:
        print("⚠️  Nenhum valor de SALDO encontrado nos reports analisados")
    
    print("\n" + "="*80)
    print("INVESTIGAÇÃO CONCLUÍDA!")
    print("="*80)

if __name__ == "__main__":
    main()
