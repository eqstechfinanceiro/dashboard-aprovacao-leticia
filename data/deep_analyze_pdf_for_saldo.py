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

def get_recent_reports():
    """Obtém reports mais recentes"""
    params = {"paginate": "false", "per_page": 100}
    
    try:
        url = f"{BASE_URL}/reports"
        response = requests.get(url, headers=headers, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                reports = data['data']
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

def extract_full_pdf_text(pdf_content):
    """Extrai todo o texto do PDF"""
    try:
        pdf_file = BytesIO(pdf_content)
        pdf_reader = PyPDF2.PdfReader(pdf_file)
        
        full_text = ""
        for page_num, page in enumerate(pdf_reader.pages):
            text = page.extract_text()
            full_text += f"\n--- PÁGINA {page_num + 1} ---\n"
            full_text += text + "\n"
        
        return full_text
        
    except Exception as e:
        print(f"Erro ao extrair texto: {e}")
        return None

def search_saldo_sections(text):
    """Procura por seções de SALDO no texto"""
    print(f"\nPROCURANDO SEÇÕES DE SALDO")
    print("="*60)
    
    # Padrões para procurar
    patterns = [
        r'SALDO\s+[A-Z]+',
        r'Saldo\s+[A-Z]+',
        r'BALANCE',
        r'Balance',
        r'LIMITE',
        r'Limite',
        r'TOTAL\s+DISPONÍVEL',
        r'TOTAL\s+DISPONIVEL',
        r'DISPONÍVEL',
        r'DISPONIVEL'
    ]
    
    found_sections = []
    
    for pattern in patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            start = max(0, match.start() - 100)
            end = min(len(text), match.end() + 200)
            context = text[start:end]
            
            found_sections.append({
                'pattern': pattern,
                'match': match.group(),
                'context': context
            })
            
            print(f"\nEncontrado: {match.group()}")
            print(f"Contexto: {context}")
    
    return found_sections

def search_all_numeric_values(text):
    """Procura por todos os valores numéricos no texto"""
    print(f"\nPROCURANDO TODOS OS VALORES NUMÉRICOS")
    print("="*60)
    
    # Padrão para valores monetários
    pattern = r'BRL\s+[\d.,]+'
    matches = re.findall(pattern, text)
    
    print(f"Valores monetários encontrados: {len(matches)}")
    
    # Mostrar valores únicos
    unique_values = set(matches)
    print(f"Valores únicos: {len(unique_values)}")
    
    # Mostrar os valores mais comuns
    from collections import Counter
    common_values = Counter(matches).most_common(20)
    
    print(f"\nValores mais comuns:")
    for value, count in common_values:
        print(f"  {value}: {count}x")
    
    return list(unique_values)

def search_specific_saldo_values(text):
    """Procura pelos valores específicos de SALDO da planilha"""
    print(f"\nPROCURANDO VALORES ESPECÍFICOS DE SALDO")
    print("="*60)
    
    target_values = [6945.16, 6626.04, 6504.20, -98.92, -428.82, 291.66, 18329.5, 20, 5, 1154.94]
    
    found_values = []
    
    for target in target_values:
        # Procura em diferentes formatos
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
                # Encontrar contexto
                index = text.find(fmt)
                start = max(0, index - 100)
                end = min(len(text), index + 100)
                context = text[start:end]
                
                found_values.append({
                    'target': target,
                    'found_format': fmt,
                    'context': context
                })
                
                print(f"✅ Encontrado: {target} como {fmt}")
                print(f"   Contexto: {context}")
                break
    
    return found_values

def main():
    """Função principal"""
    print("ANÁLISE PROFUNDA DE PDFs PARA SEÇÕES DE SALDO")
    print("="*80)
    
    # 1. Obter reports recentes
    reports = get_recent_reports()
    
    if not reports:
        print("Nenhum report encontrado")
        return
    
    # 2. Filtrar reports com PDF
    pdf_reports = [r for r in reports if r.get('pdf_link')]
    
    print(f"Reports com PDF: {len(pdf_reports)}")
    
    # 3. Analisar primeiro report em detalhes
    report = pdf_reports[0]
    report_id = report.get('id')
    description = report.get('description', '')
    
    print(f"\nAnalisando: {description} (ID: {report_id})")
    print("="*60)
    
    # Baixar PDF
    pdf_content = download_report_pdf(report)
    
    if pdf_content:
        print(f"PDF baixado: {len(pdf_content)} bytes")
        
        # Extrair texto completo
        text = extract_full_pdf_text(pdf_content)
        
        if text:
            print(f"\nTexto extraído: {len(text)} caracteres")
            
            # 1. Procurar seções de SALDO
            saldo_sections = search_saldo_sections(text)
            
            # 2. Procurar todos os valores numéricos
            numeric_values = search_all_numeric_values(text)
            
            # 3. Procurar valores específicos de SALDO
            specific_values = search_specific_saldo_values(text)
            
            # 4. Salvar texto completo para análise manual
            text_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/report_pdf_text.txt'
            with open(text_file, 'w', encoding='utf-8') as f:
                f.write(text)
            
            print(f"\n\nTexto completo salvo em: {text_file}")
            
            # 5. Salvar resultados
            results = {
                'investigation_date': datetime.now().isoformat(),
                'report_id': report_id,
                'description': description,
                'saldo_sections': saldo_sections,
                'numeric_values_count': len(numeric_values),
                'specific_values': specific_values,
                'conclusion': ''
            }
            
            if specific_values:
                results['conclusion'] = f'VALORES DE SALDO ENCONTRADOS: {len(specific_values)}'
            elif saldo_sections:
                results['conclusion'] = 'SEÇÕES DE SALDO ENCONTRADAS, MAS SEM VALORES ESPECÍFICOS'
            else:
                results['conclusion'] = 'NENHUMA SEÇÃO DE SALDO ENCONTRADA'
            
            output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/pdf_saldo_deep_analysis.json'
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
            
            print(f"\nResultados salvos em: {output_file}")
        else:
            print("Erro ao extrair texto")
    else:
        print("Erro ao baixar PDF")
    
    print("\n" + "="*80)
    print("INVESTIGAÇÃO CONCLUÍDA!")
    print("="*80)

if __name__ == "__main__":
    main()
