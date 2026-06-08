#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🔍 INVESTIGAÇÃO DE ENDPOINTS DA API VEXPENSES
Testa diferentes endpoints para encontrar dados de reports/despesas
"""

import requests
import json

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
API_BASE = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,  # Sem prefixo "Bearer" (igual ao proxy)
    "Accept": "application/json"
}

def testar_endpoint(endpoint, descricao):
    """Testa um endpoint da API"""
    print(f"\n🔍 Testando: {descricao}")
    print(f"   Endpoint: {endpoint}")
    
    try:
        response = requests.get(f"{API_BASE}{endpoint}", headers=headers, timeout=30)
        
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ Sucesso!")
            
            if isinstance(data, dict):
                if 'data' in data:
                    print(f"   Campos: {list(data['data'][0].keys()) if data['data'] else 'vazio'}")
                    print(f"   Total: {len(data['data']) if data['data'] else 0}")
                else:
                    print(f"   Campos: {list(data.keys())}")
                    print(f"   Conteúdo: {str(data)[:200]}")
            elif isinstance(data, list):
                print(f"   Total: {len(data)}")
                if data:
                    print(f"   Campos: {list(data[0].keys())}")
            else:
                print(f"   Tipo: {type(data)}")
                print(f"   Conteúdo: {str(data)[:200]}")
            
            return data
        else:
            print(f"   ❌ Erro: {response.text[:200]}")
            return None
            
    except Exception as e:
        print(f"   ❌ Exceção: {str(e)}")
        return None

def main():
    print("🔍 INVESTIGANDO ENDPOINTS DA API VEXPENSES")
    print("=" * 60)
    
    # Endpoints a testar baseados na estrutura BASE PREST
    endpoints = [
        ("/reports", "Reports (Relatórios)"),
        ("/reports?include=expenses&limit=3", "Reports com expenses (teste simples)"),
    ]
    
    resultados = {}
    
    for endpoint, descricao in endpoints:
        data = testar_endpoint(endpoint, descricao)
        if data:
            resultados[endpoint] = data
    
    # Salvar resultados
    with open('resultados_api_investigacao.json', 'w', encoding='utf-8') as f:
        json.dump(resultados, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ Resultados salvos em: resultados_api_investigacao.json")

if __name__ == "__main__":
    main()
