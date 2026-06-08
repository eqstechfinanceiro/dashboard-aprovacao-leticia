#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🔍 ABORDAGEM 2: Paginação de Expenses com filtro de data
Testa buscar expenses diretamente com filtros e includes
"""

import requests
import json
from datetime import datetime

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
API_BASE = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Accept": "application/json"
}

def testar_abordagem2():
    """Testa abordagem 2: Paginação de expenses"""
    
    print("🔍 ABORDAGEM 2: Paginação de Expenses com filtro de data")
    print("=" * 80)
    
    # Includes necessários para BASE PREST
    includes = "apportionment,costs_center,expense_type,gps,payment_method,report,route,user"
    
    # Testar diferentes filtros
    testes = [
        {
            "nome": "Filtro simples (data >=)",
            "params": {
                "search": "date:2025-01-01",
                "searchFields": "date:>=",
                "include": includes,
                "paginate": "false",
                "per_page": 5
            }
        },
        {
            "nome": "Filtro between (data range)",
            "params": {
                "search": "date:2025-05-01,2025-05-31",
                "searchFields": "date:between",
                "include": includes,
                "paginate": "false",
                "per_page": 5
            }
        },
        {
            "nome": "Filtro por report_id",
            "params": {
                "search": "report_id:8897900",
                "searchFields": "report_id:=",
                "include": includes,
                "paginate": "false",
                "per_page": 5
            }
        },
        {
            "nome": "Filtro por user_id",
            "params": {
                "search": "user_id:896020",
                "searchFields": "user_id:=",
                "include": includes,
                "paginate": "false",
                "per_page": 5
            }
        },
        {
            "nome": "Sem filtro (apenas includes)",
            "params": {
                "include": includes,
                "paginate": "false",
                "per_page": 5
            }
        },
    ]
    
    for teste in testes:
        print(f"\n📋 Testando: {teste['nome']}")
        print(f"   Params: {teste['params']}")
        
        try:
            response = requests.get(f"{API_BASE}/expenses", headers=headers, params=teste['params'], timeout=30)
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                expenses = data.get('data', [])
                print(f"   ✅ Sucesso! Total: {len(expenses)}")
                
                if expenses:
                    first = expenses[0]
                    print(f"   Campos: {list(first.keys())}")
                    
                    # Verificar includes
                    for inc in includes.split(','):
                        if inc in first:
                            print(f"   ✅ Include {inc}: presente")
                        else:
                            print(f"   ❌ Include {inc}: ausente")
                    
                    # Mostrar exemplo
                    print(f"\n   Exemplo (primeiro expense):")
                    print(f"      ID: {first.get('id')}")
                    print(f"      Valor: {first.get('value')}")
                    print(f"      Data: {first.get('date')}")
                    if 'user' in first:
                        print(f"      Usuário: {first['user'].get('name')}")
                    if 'report' in first:
                        print(f"      Report: {first['report'].get('description')}")
                    
                    # Salvar amostra
                    with open(f'test_expenses_{teste["nome"].replace(" ", "_").lower()}.json', 'w', encoding='utf-8') as f:
                        json.dump(expenses, f, ensure_ascii=False, indent=2)
                    print(f"   Amostra salva")
            else:
                print(f"   ❌ Erro: {response.text[:500]}")
                
        except Exception as e:
            print(f"   ❌ Exceção: {str(e)}")
    
    print(f"\n📈 RESUMO ABORDAGEM 2:")
    print(f"   Testes realizados: {len(testes)}")
    print(f"   Verificar quais filtros funcionaram acima")

if __name__ == "__main__":
    testar_abordagem2()
