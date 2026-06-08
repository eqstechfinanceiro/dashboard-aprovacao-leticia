#!/usr/bin/env python3
"""
Extrai dados financeiros diretamente dos campos da API de reports
Sem precisar baixar arquivos Excel
"""

import json
import re
from datetime import datetime
from pathlib import Path

import requests

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}


def get_reports_by_period(year, month):
    """Obtém reports de um período específico"""
    print(f"📊 Obtendo reports de {month}/{year}...")
    
    try:
        url = f"{BASE_URL}/reports"
        params = {"paginate": "false", "per_page": 100}
        response = requests.get(url, headers=headers, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                reports = data['data']
                
                # Filtrar reports do período
                period_reports = []
                for report in reports:
                    created_at = report.get('created_at', '')
                    if created_at:
                        try:
                            report_date = datetime.strptime(created_at, '%Y-%m-%d %H:%M:%S')
                            if report_date.year == year and report_date.month == month:
                                period_reports.append(report)
                        except:
                            continue
                
                print(f"✅ Reports encontrados: {len(period_reports)}")
                return period_reports
                
    except Exception as e:
        print(f"❌ Erro ao obter reports: {e}")
    
    return []


def extract_value_from_text(text, patterns):
    """Extrai valor numérico de texto usando padrões regex"""
    if not text:
        return None
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                value = float(match.group(1).replace(',', '.'))
                return value
            except:
                continue
    
    return None


def extract_financial_data_from_report(report):
    """Extrai dados financeiros de um report"""
    financial_data = {
        'report_id': report.get('id'),
        'user_id': report.get('user_id'),
        'description': report.get('description', ''),
        '1qz': None,
        'saldo_cartao': None,
        'adiantamento': None
    }
    
    # Campos de texto onde podem estar os valores
    text_fields = [
        report.get('observation') or '',
        report.get('justification') or '',
        report.get('description') or '',
        report.get('notes') or ''
    ]
    
    combined_text = ' '.join(str(f) for f in text_fields)
    
    # Padrões para 1QZ
    qz_patterns = [
        r'1qz[:\s]*([0-9.,]+)',
        r'1ª qz[:\s]*([0-9.,]+)',
        r'1 qz[:\s]*([0-9.,]+)',
        r'quinzena[:\s]*([0-9.,]+)',
        r'qz[:\s]*([0-9.,]+)'
    ]
    
    # Padrões para saldo cartão
    saldo_patterns = [
        r'saldo[:\s]*cartão[:\s]*([0-9.,]+)',
        r'saldo cartão[:\s]*([0-9.,]+)',
        r'cartão[:\s]*saldo[:\s]*([0-9.,]+)'
    ]
    
    # Padrões para adiantamento
    adiantamento_patterns = [
        r'adiantamento[:\s]*([0-9.,]+)',
        r'adiantar[:\s]*([0-9.,]+)'
    ]
    
    # Extrair valores
    financial_data['1qz'] = extract_value_from_text(combined_text, qz_patterns)
    financial_data['saldo_cartao'] = extract_value_from_text(combined_text, saldo_patterns)
    financial_data['adiantamento'] = extract_value_from_text(combined_text, adiantamento_patterns)
    
    return financial_data


def main():
    print("🎯 EXTRAÇÃO DE DADOS FINANCEIROS DA API DE REPORTS\n")
    print("=" * 60)
    
    # Definir período (ABRIL 2026)
    year = 2026
    month = 4
    
    # Obter reports do período
    reports = get_reports_by_period(year, month)
    
    if not reports:
        print("❌ Nenhum report encontrado para o período")
        return
    
    # Extrair dados financeiros
    print(f"\n🔍 Extraindo dados financeiros de {len(reports)} reports...")
    
    financial_data = []
    for i, report in enumerate(reports):
        report_id = report.get('id')
        description = report.get('description', '')
        
        print(f"  [{i+1}/{len(reports)}] Report {report_id}: {description[:50]}")
        
        data = extract_financial_data_from_report(report)
        financial_data.append(data)
        
        if data['1qz']:
            print(f"    ✅ 1QZ: {data['1qz']}")
        if data['saldo_cartao']:
            print(f"    ✅ Saldo Cartão: {data['saldo_cartao']}")
        if data['adiantamento']:
            print(f"    ✅ Adiantamento: {data['adiantamento']}")
    
    # Contabilizar
    qz_count = sum(1 for d in financial_data if d['1qz'])
    saldo_count = sum(1 for d in financial_data if d['saldo_cartao'])
    adiantamento_count = sum(1 for d in financial_data if d['adiantamento'])
    
    print(f"\n📊 Resumo:")
    print(f"  1QZ encontrado: {qz_count} de {len(reports)}")
    print(f"  Saldo Cartão encontrado: {saldo_count} de {len(reports)}")
    print(f"  Adiantamento encontrado: {adiantamento_count} de {len(reports)}")
    
    # Salvar resultados
    output_path = Path(__file__).parent / "financial_data_from_api_reports.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(financial_data, f, indent=2, ensure_ascii=False)
    
    print(f"\n📁 Dados salvos: {output_path}")
    
    print("\n💡 CONCLUSÃO:")
    if qz_count > 0:
        print("✅ Dados de 1QZ disponíveis na API de reports")
        print("✅ É possível extrair dados financeiros sem baixar Excel")
    else:
        print("⚠️ Dados de 1QZ não encontrados nos campos de texto")
        print("🔍 Pode ser necessário usar outra abordagem")


if __name__ == "__main__":
    main()
