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

def get_card_reports():
    """Obtém reports de cartão"""
    params = {"paginate": "false", "per_page": 1000}
    
    try:
        url = f"{BASE_URL}/reports"
        response = requests.get(url, headers=headers, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                reports = data['data']
                fatura_reports = [r for r in reports if 'FATURA' in r.get('description', '').upper()]
                return fatura_reports
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

def search_for_summary_sections(pdf_content, report_id, description):
    """Procura por seções de resumo por usuário"""
    print(f"\n{'='*80}")
    print(f"Report: {description}")
    print(f"ID: {report_id}")
    print(f"{'='*80}")
    
    try:
        pdf_file = BytesIO(pdf_content)
        pdf_reader = PyPDF2.PdfReader(pdf_file)
        
        full_text = ""
        for page in pdf_reader.pages:
            full_text += page.extract_text() + "\n"
        
        # Procurar por seções de resumo
        summary_keywords = [
            'RESUMO',
            'SUMÁRIO',
            'RESUMO POR USUÁRIO',
            'RESUMO POR PROJETO',
            'RESUMO POR CENTRO DE CUSTO',
            'TOTAL POR USUÁRIO',
            'TOTAL POR PROJETO',
            'USUÁRIO',
            'USUARIO',
            'POR USUÁRIO'
        ]
        
        found_sections = []
        
        for keyword in summary_keywords:
            if keyword in full_text.upper():
                # Encontrar contexto
                index = full_text.upper().find(keyword)
                start = max(0, index - 100)
                end = min(len(full_text), index + 500)
                context = full_text[start:end]
                
                found_sections.append({
                    'keyword': keyword,
                    'context': context
                })
                
                print(f"\n✅ Encontrado: {keyword}")
                print(f"Contexto: {context}")
        
        # Procurar por tabelas com valores monetários
        print(f"\n\nPROCURANDO POR TABELAS COM VALORES MONETÁRIOS")
        print("="*60)
        
        lines = full_text.split('\n')
        
        # Procurar linhas com múltiplos valores monetários (possíveis tabelas)
        table_lines = []
        for line in lines:
            # Se a linha tem 3 ou mais valores monetários
            monetary_values = re.findall(r'BRL\s+[\d.,]+', line)
            if len(monetary_values) >= 3:
                table_lines.append(line)
                print(f"Tabela: {line}")
        
        # Procurar por padrões de nome + valor específico
        print(f"\n\nPROCURANDO POR PADRÕES NOME + VALOR ESPECÍFICO")
        print("="*60)
        
        # Valores específicos que procuramos
        target_values = {
            '6945.16': 6945.16,
            '6626.04': 6626.04,
            '6504.20': 6504.20,
            '291.66': 291.66,
            '18329.5': 18329.5,
            '1154.94': 1154.94
        }
        
        for value_str, value in target_values.items():
            for fmt in [value_str, str(int(value)), str(value).replace('.', ',')]:
                if fmt in full_text:
                    index = full_text.find(fmt)
                    start = max(0, index - 500)
                    end = min(len(full_text), index + 500)
                    context = full_text[start:end]
                    
                    print(f"\n✅ {value} encontrado como '{fmt}'")
                    print(f"Contexto:\n{context}")
        
        return found_sections, table_lines
        
    except Exception as e:
        print(f"Erro: {e}")
        import traceback
        traceback.print_exc()
        return [], []

def main():
    """Função principal"""
    print("PROCURANDO SEÇÕES DE RESUMO POR USUÁRIO")
    print("="*80)
    
    # 1. Obter reports
    card_reports = get_card_reports()
    
    # 2. Analisar 3 reports diferentes
    for i, report in enumerate(card_reports[:3]):
        report_id = report.get('id')
        description = report.get('description', '')
        
        # Baixar PDF
        pdf_content = download_report_pdf(report)
        
        if pdf_content:
            sections, tables = search_for_summary_sections(pdf_content, report_id, description)
            
            # Salvar resultados
            results = {
                'investigation_date': datetime.now().isoformat(),
                'report_id': report_id,
                'description': description,
                'summary_sections': sections,
                'table_lines': tables
            }
            
            output_file = f'/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/summary_search_{report_id}.json'
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
    
    print("\n" + "="*80)
    print("ANÁLISE CONCLUÍDA!")
    print("="*80)

if __name__ == "__main__":
    main()
