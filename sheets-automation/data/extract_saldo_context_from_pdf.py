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

def extract_saldo_context(pdf_content, report_id, description):
    """Extrai contexto específico dos valores de SALDO"""
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
        
        # Valores que procuramos
        target_values = {
            '6504.2': 6504.2,
            '-98.92': -98.92,
            '-428.82': -428.82,
            '291.66': 291.66,
            '18329.5': 18329.5,
            '1154.94': 1154.94
        }
        
        # Procurar cada valor e extrair contexto
        for value_str, value in target_values.items():
            # Procura em diferentes formatos
            formats = [
                value_str,
                str(int(value)),
                str(value).replace('.', ','),
                f"{value:.0f}",
                f"{abs(value):.0f}"
            ]
            
            for fmt in formats:
                if fmt in full_text:
                    # Encontrar contexto
                    index = full_text.find(fmt)
                    start = max(0, index - 300)
                    end = min(len(full_text), index + 300)
                    context = full_text[start:end]
                    
                    print(f"\n✅ Valor encontrado: {value} como '{fmt}'")
                    print(f"Contexto (600 caracteres):")
                    print(context)
                    print("-" * 60)
                    break
        
        # Procurar por padrões de usuário + valor
        print(f"\n\nPROCURANDO PADRÕES DE USUÁRIO + VALOR")
        print("="*60)
        
        # Padrão: Nome do usuário seguido de valor monetário
        lines = full_text.split('\n')
        
        user_value_patterns = []
        
        for i, line in enumerate(lines):
            # Se a linha tem valor monetário
            if re.search(r'BRL\s+[\d.,]+', line):
                value_match = re.search(r'BRL\s+([\d.,]+)', line)
                if value_match:
                    value_str = value_match.group(1).replace('.', '').replace(',', '.')
                    try:
                        value = float(value_str)
                        
                        # Procurar nome nas linhas anteriores
                        for j in range(max(0, i-10), i):
                            prev_line = lines[j].strip()
                            
                            # Se parece um nome (mais de 5 caracteres, não só números)
                            if len(prev_line) > 5 and not re.match(r'^[\d.,\s]+$', prev_line):
                                user_value_patterns.append({
                                    'user': prev_line,
                                    'value': value,
                                    'line': line
                                })
                                break
                    except:
                        pass
        
        # Mostrar padrões encontrados
        print(f"Padrões usuário+valor encontrados: {len(user_value_patterns)}")
        
        for pattern in user_value_patterns[:10]:
            print(f"\nUsuário: {pattern['user']}")
            print(f"Valor: R$ {pattern['value']:.2f}")
            print(f"Linha: {pattern['line'][:80]}")
        
        return user_value_patterns
        
    except Exception as e:
        print(f"Erro: {e}")
        import traceback
        traceback.print_exc()
        return []

def main():
    """Função principal"""
    print("EXTRAINDO CONTEXTO DE SALDO DOS PDFs")
    print("="*80)
    
    # 1. Obter reports
    card_reports = get_card_reports()
    
    # 2. Analisar o report que tinha os valores específicos (ID 7521153)
    target_report = None
    for report in card_reports:
        if report.get('id') == 7521153:
            target_report = report
            break
    
    if not target_report:
        print("Report alvo não encontrado")
        return
    
    # Baixar PDF
    pdf_content = download_report_pdf(target_report)
    
    if pdf_content:
        patterns = extract_saldo_context(pdf_content, target_report.get('id'), target_report.get('description'))
        
        # Salvar resultados
        results = {
            'investigation_date': datetime.now().isoformat(),
            'report_id': target_report.get('id'),
            'description': target_report.get('description'),
            'user_value_patterns': patterns
        }
        
        output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/saldo_context_analysis.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        
        print(f"\n\nSalvo em: {output_file}")
    
    print("\n" + "="*80)
    print("ANÁLISE CONCLUÍDA!")
    print("="*80)

if __name__ == "__main__":
    main()
