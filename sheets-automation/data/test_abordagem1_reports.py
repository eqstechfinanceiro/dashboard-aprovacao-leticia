#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🔍 ABORDAGEM 1: Iterar por Reports e baixar Excel
Testa buscar reports e usar excel_link para obter dados
"""

import requests
import json
import time

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
API_BASE = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Accept": "application/json"
}

def testar_abordagem1():
    """Testa abordagem 1: Iterar por reports"""
    
    print("🔍 ABORDAGEM 1: Iterar por Reports e baixar Excel")
    print("=" * 80)
    
    # 1. Buscar reports
    print("\n📋 1. Buscando reports...")
    response = requests.get(f"{API_BASE}/reports", headers=headers, params={"paginate": "false", "per_page": 10})
    
    if response.status_code != 200:
        print(f"❌ Erro ao buscar reports: {response.status_code}")
        print(response.text[:500])
        return
    
    data = response.json()
    reports = data.get('data', [])
    
    print(f"✅ Total de reports: {len(reports)}")
    
    # 2. Analisar estrutura dos reports
    print(f"\n📊 2. Analisando estrutura dos reports...")
    if reports:
        first_report = reports[0]
        print(f"   Campos disponíveis: {list(first_report.keys())}")
        print(f"   Tem excel_link: {'excel_link' in first_report}")
        print(f"   Tem pdf_link: {'pdf_link' in first_report}")
        
        if 'excel_link' in first_report and first_report['excel_link']:
            print(f"   Excel link: {first_report['excel_link'][:100]}...")
    
    # 3. Testar baixar Excel de um report
    print(f"\n📥 3. Testando download de Excel...")
    if reports and 'excel_link' in reports[0] and reports[0]['excel_link']:
        excel_url = reports[0]['excel_link']
        print(f"   URL: {excel_url}")
        
        try:
            excel_response = requests.get(excel_url, headers=headers, timeout=30)
            print(f"   Status: {excel_response.status_code}")
            
            if excel_response.status_code == 200:
                print(f"   ✅ Excel baixado com sucesso!")
                print(f"   Tamanho: {len(excel_response.content)} bytes")
                print(f"   Content-Type: {excel_response.headers.get('Content-Type')}")
                
                # Salvar arquivo
                with open('test_report_excel.xlsx', 'wb') as f:
                    f.write(excel_response.content)
                print(f"   Salvo como: test_report_excel.xlsx")
            else:
                print(f"   ❌ Erro: {excel_response.text[:500]}")
        except Exception as e:
            print(f"   ❌ Exceção: {str(e)}")
    
    # 4. Analisar campos relevantes para BASE PREST
    print(f"\n📋 4. Campos relevantes para BASE PREST:")
    campos_relevantes = ['id', 'description', 'status', 'user_id', 'approval_date', 'payment_date', 'excel_link', 'pdf_link']
    for campo in campos_relevantes:
        if campo in first_report:
            print(f"   {campo:20}: {first_report[campo]}")
    
    # 5. Verificar se há endpoint para expenses do report
    print(f"\n🔍 5. Testando endpoint /reports/{{id}}/expenses...")
    if reports:
        report_id = reports[0]['id']
        expenses_response = requests.get(f"{API_BASE}/reports/{report_id}/expenses", headers=headers)
        print(f"   Status: {expenses_response.status_code}")
        if expenses_response.status_code == 200:
            print(f"   ✅ Endpoint funciona!")
            expenses_data = expenses_response.json()
            print(f"   Total expenses: {len(expenses_data.get('data', []))}")
        else:
            print(f"   ❌ Erro: {expenses_response.text[:200]}")
    
    print(f"\n📈 RESUMO ABORDAGEM 1:")
    print(f"   Total reports: {len(reports)}")
    print(f"   Tem excel_link: {any('excel_link' in r and r['excel_link'] for r in reports)}")
    print(f"   Endpoint /reports/{{id}}/expenses: {expenses_response.status_code == 200 if reports else 'N/A'}")

if __name__ == "__main__":
    testar_abordagem1()
