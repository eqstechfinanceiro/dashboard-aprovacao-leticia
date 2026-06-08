#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🔍 EXTRAÇÃO BASE PREST VIA API (OTIMIZADO)
Busca expenses mês a mês com paginação para evitar memory exhausted
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

def extrair_expenses_mes(ano, mes, page=1, per_page=100):
    """Extrai expenses de um mês específico com paginação"""
    
    # Formatar datas
    data_inicio = f"{ano}-{mes:02d}-01"
    
    # Último dia do mês
    if mes == 12:
        data_fim = f"{ano+1}-01-01"
    else:
        data_fim = f"{ano}-{mes+1:02d}-01"
    
    # Includes necessários (sem route que não está disponível)
    includes = "apportionment,costs_center,expense_type,gps,payment_method,report,user,paying_company"
    
    params = {
        "search": f"date:{data_inicio},{data_fim}",
        "searchFields": "date:between",
        "include": includes,
        "paginate": "true",
        "page": page,
        "per_page": per_page
    }
    
    try:
        response = requests.get(f"{API_BASE}/expenses", headers=headers, params=params, timeout=60)
        
        if response.status_code == 200:
            data = response.json()
            expenses = data.get('data', [])
            
            
            return expenses, data.get('meta', {}).get('total', 0)
        else:
            print(f"   ❌ Erro: {response.status_code} - {response.text[:200]}")
            return [], 0
            
    except Exception as e:
        print(f"   ❌ Exceção: {str(e)}")
        return [], 0

def extrair_todas_expenses(ano, mes):
    """Extrai todas as expenses de um mês com paginação completa"""
    
    print(f"\n📦 Extraindo expenses de {mes:02d}/{ano}...")
    
    todas_expenses = []
    page = 1
    per_page = 100
    
    while True:
        print(f"   Página {page}...", end=" ")
        expenses, total = extrair_expenses_mes(ano, mes, page, per_page)
        
        if not expenses:
            print("sem dados")
            break
        
        todas_expenses.extend(expenses)
        print(f"+{len(expenses)} (total: {len(todas_expenses)}/{total})")
        
        # Verificar se chegou ao fim
        if len(todas_expenses) >= total or len(expenses) < per_page:
            break
        
        page += 1
    
    print(f"   ✅ Total extraído: {len(todas_expenses)}")
    return todas_expenses

def converter_para_base_prest(expenses):
    """Converte expenses para formato BASE PREST"""
    
    base_prest = []
    
    for exp in expenses:
        # Helper para extrair dados de includes com estrutura {data: [...]} ou {data: {...}}
        def get_include_data(include_field, key):
            include_obj = exp.get(include_field, {})
            if isinstance(include_obj, dict) and 'data' in include_obj:
                data = include_obj['data']
                if isinstance(data, list) and len(data) > 0:
                    return data[0].get(key)
                elif isinstance(data, dict):
                    return data.get(key)
            return None
        
        linha = {
            "ID da Despesa": exp.get('id'),
            "ID do Relatório": exp.get('report_id'),
            "Nome do relatório": get_include_data('report', 'description'),
            "Data": exp.get('date'),
            "Nome do membro de equipe": get_include_data('user', 'name'),
            "Banco": get_include_data('user', 'bank'),
            "Agência": get_include_data('user', 'agency'),
            "Conta": get_include_data('user', 'account'),
            "Pix": get_include_data('user', 'pix_key'),
            "CPF/CNPJ": get_include_data('user', 'cpf'),
            "Status": get_include_data('report', 'status'),
            "Data de Pagamento": get_include_data('report', 'payment_date'),
            "Descrição da despesa": exp.get('title'),
            "Tipo de Despesa": get_include_data('expense_type', 'name'),
            "Reembolsável": "Sim" if exp.get('reimbursable') else "Não",
            "Anotação da Despesa": exp.get('observation'),
            "Anotação de Rateio": "Sim" if exp.get('apportionment', {}).get('data') else "Não",
            "Centro de Custos": get_include_data('costs_center', 'name'),
            "Forma de pagamento": get_include_data('payment_method', 'name'),
            "Projeto": None,  # route não disponível
            "Percentual de projeto": None,
            "Início do Percurso por GPS": get_include_data('gps', 'start'),
            "Fim do Percurso por GPS": get_include_data('gps', 'end'),
            "Valor do KM": exp.get('mileage_value'),
            "Kilômetros Percorridos": exp.get('mileage'),
            "Moeda do Relatório": exp.get('original_currency_iso'),
            "Valor": exp.get('value'),
            "MÊS": None,  # Calculado depois
            "CPF": get_include_data('user', 'cpf'),
            "Coluna1": None,
            "colaborador": get_include_data('user', 'name'),
        }
        
        base_prest.append(linha)
    
    return base_prest

def main():
    """Função principal"""
    
    print("🔍 EXTRAÇÃO BASE PREST VIA API VEXPENSES")
    print("=" * 80)
    
    # Testar com Maio 2025 (tem dados conforme teste anterior)
    ano = 2025
    mes = 5
    
    # 1. Extrair expenses
    expenses = extrair_todas_expenses(ano, mes)
    
    if not expenses:
        print("❌ Nenhuma expense encontrada")
        return
    
    # 2. Converter para formato BASE PREST
    print(f"\n🔄 Convertendo para formato BASE PREST...")
    base_prest = converter_para_base_prest(expenses)
    
    # 3. Calcular MÊS
    print(f"\n📅 Calculando campo MÊS...")
    for linha in base_prest:
        if linha['Data']:
            data = datetime.strptime(linha['Data'], '%Y-%m-%d %H:%M:%S')
            linha['MÊS'] = data.strftime('%m/%Y')
    
    # 4. Salvar
    output_file = f'base_prest_{ano}_{mes:02d}_api.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(base_prest, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ Arquivo salvo: {output_file}")
    print(f"   Total de registros: {len(base_prest)}")
    
    # 5. Comparar com amostra original
    print(f"\n📊 Comparando com amostra original...")
    with open('amostra_base_prest_100.json', 'r', encoding='utf-8') as f:
        amostra = json.load(f)
    
    print(f"   Amostra original: {len(amostra['dados'])} registros")
    print(f"   Extraído via API: {len(base_prest)} registros")
    
    # Mostrar exemplo
    if base_prest:
        print(f"\n💡 Exemplo de registro extraído:")
        for k, v in list(base_prest[0].items())[:10]:
            print(f"   {k:30}: {v}")

if __name__ == "__main__":
    main()
