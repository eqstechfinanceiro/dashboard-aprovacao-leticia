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
                
                # Filtrar por FATURA
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

def analyze_pdf_structure_detailed(pdf_content, report_id, description):
    """Analisa estrutura detalhada do PDF"""
    print(f"\n{'='*80}")
    print(f"Report: {description}")
    print(f"ID: {report_id}")
    print(f"{'='*80}")
    
    try:
        pdf_file = BytesIO(pdf_content)
        pdf_reader = PyPDF2.PdfReader(pdf_file)
        
        print(f"Páginas: {len(pdf_reader.pages)}")
        
        # Analisar cada página
        for page_num, page in enumerate(pdf_reader.pages[:5]):  # Primeiras 5 páginas
            text = page.extract_text()
            
            print(f"\n--- PÁGINA {page_num + 1} ---")
            print(f"Caracteres: {len(text)}")
            
            # Procurar por seções relevantes
            if 'SALDO' in text.upper():
                print("✅ Contém 'SALDO'")
                
                # Extrair contexto ao redor de SALDO
                saldo_index = text.upper().find('SALDO')
                start = max(0, saldo_index - 200)
                end = min(len(text), saldo_index + 200)
                context = text[start:end]
                print(f"Contexto: {context}")
            
            if 'TOTAL' in text.upper():
                print("✅ Contém 'TOTAL'")
                
                total_index = text.upper().find('TOTAL')
                start = max(0, total_index - 200)
                end = min(len(text), total_index + 200)
                context = text[start:end]
                print(f"Contexto: {context}")
            
            if 'LIMITE' in text.upper():
                print("✅ Contém 'LIMITE'")
                
                limite_index = text.upper().find('LIMITE')
                start = max(0, limite_index - 200)
                end = min(len(text), limite_index + 200)
                context = text[start:end]
                print(f"Contexto: {context}")
            
            if 'DISPONÍVEL' in text.upper() or 'DISPONIVEL' in text.upper():
                print("✅ Contém 'DISPONÍVEL'")
                
                disponivel_index = text.upper().find('DISPON')
                start = max(0, disponivel_index - 200)
                end = min(len(text), disponivel_index + 200)
                context = text[start:end]
                print(f"Contexto: {context}")
            
            # Mostrar primeiras 300 caracteres
            print(f"\nPrimeiros 300 caracteres:")
            print(text[:300])
        
        return True
        
    except Exception as e:
        print(f"Erro ao analisar PDF: {e}")
        import traceback
        traceback.print_exc()
        return False

def extract_user_saldo_data_from_pdf(pdf_content, report_id):
    """Extrai dados de SALDO por usuário do PDF"""
    try:
        pdf_file = BytesIO(pdf_content)
        pdf_reader = PyPDF2.PdfReader(pdf_file)
        
        user_saldo_data = {}
        
        for page in pdf_reader.pages:
            text = page.extract_text()
            
            # Procurar por padrões de usuário + saldo
            # Padrão: NOME DO USUÁRIO ... SALDO: VALOR
            lines = text.split('\n')
            
            for i, line in enumerate(lines):
                # Se a linha contém um valor monetário
                if re.search(r'R?\$?\s*[\d.,]+', line):
                    # Verificar linhas anteriores para nome do usuário
                    for j in range(max(0, i-5), i):
                        prev_line = lines[j]
                        
                        # Se a linha anterior parece um nome (não muito curto, não só números)
                        if len(prev_line) > 10 and not re.match(r'^[\d.,\s]+$', prev_line):
                            # Extrair valor
                            value_match = re.search(r'R?\$?\s*([\d.,]+)', line)
                            if value_match:
                                value_str = value_match.group(1).replace('.', '').replace(',', '.')
                                try:
                                    value = float(value_str)
                                    
                                    if prev_line not in user_saldo_data:
                                        user_saldo_data[prev_line] = []
                                    
                                    user_saldo_data[prev_line].append({
                                        'value': value,
                                        'context': line,
                                        'page': pdf_reader.pages.index(page)
                                    })
                                except:
                                    pass
        
        return user_saldo_data
        
    except Exception as e:
        print(f"Erro ao extrair dados: {e}")
        return {}

def main():
    """Função principal"""
    print("ANALISANDO ESTRUTURA DE PDFs DE FATURA")
    print("="*80)
    
    # 1. Obter reports de cartão
    card_reports = get_card_reports()
    
    print(f"Reports de FATURA: {len(card_reports)}")
    
    # 2. Analisar primeiro report em detalhes
    report = card_reports[0]
    report_id = report.get('id')
    description = report.get('description', '')
    
    # Baixar PDF
    pdf_content = download_report_pdf(report)
    
    if pdf_content:
        # Analisar estrutura
        analyze_pdf_structure_detailed(pdf_content, report_id, description)
        
        # Extrair dados de usuário
        user_data = extract_user_saldo_data_from_pdf(pdf_content, report_id)
        
        print(f"\n\nDados de usuário extraídos:")
        print(f"Usuários encontrados: {len(user_data)}")
        
        for user, values in list(user_data.items())[:5]:
            print(f"\n{user}:")
            for v in values[:3]:
                print(f"  R$ {v['value']:.2f} - {v['context'][:50]}")
        
        # Salvar resultados
        results = {
            'investigation_date': datetime.now().isoformat(),
            'report_id': report_id,
            'description': description,
            'user_saldo_data': user_data
        }
        
        output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/fatura_pdf_structure.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        
        print(f"\n\nSalvo em: {output_file}")
    
    print("\n" + "="*80)
    print("ANÁLISE CONCLUÍDA!")
    print("="*80)

if __name__ == "__main__":
    main()
