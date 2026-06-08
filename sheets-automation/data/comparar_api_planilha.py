#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🔍 COMPARAÇÃO: Dados API vs Planilha BASE PREST
"""

import json

# Carregar dados da API
with open('base_prest_2025_05_api.json', 'r', encoding='utf-8') as f:
    dados_api = json.load(f)

# Carregar amostra da planilha
with open('amostra_base_prest_100.json', 'r', encoding='utf-8') as f:
    dados_planilha = json.load(f)

cabecalho = dados_planilha['cabecalho']
amostra_dados = dados_planilha['dados']

print("🔍 COMPARAÇÃO: Dados API vs Planilha BASE PREST")
print("=" * 80)
print(f"\n📊 Estatísticas:")
print(f"   Dados API (Maio 2025): {len(dados_api)} registros")
print(f"   Amostra Planilha: {len(amostra_dados)} registros")
print(f"   Total Planilha: {dados_planilha['total_linhas']} registros")

# Filtrar amostra para apenas Maio 2025
amostra_maio = []
for linha in amostra_dados:
    data = linha[3]  # Índice 3 = Data
    if data and '05/2025' in data:
        amostra_maio.append(linha)

print(f"   Amostra Maio 2025: {len(amostra_maio)} registros")

# Criar dicionário de dados da API por ID da Despesa
api_por_id = {item['ID da Despesa']: item for item in dados_api}

# Criar dicionário de dados da planilha por ID da Despesa
planilha_por_id = {}
for linha in amostra_maio:
    id_despesa = linha[0]  # Índice 0 = ID da Despesa
    planilha_por_id[id_despesa] = {cabecalho[i]: linha[i] for i in range(len(cabecalho))}

# Encontrar IDs comuns
ids_comuns = set(api_por_id.keys()) & set(planilha_por_id.keys())
print(f"\n🔗 IDs comuns: {len(ids_comuns)}")

# Comparar campos para IDs comuns
print(f"\n📋 Comparação detalhada (primeiros 5 IDs comuns):")
for i, id_despesa in enumerate(list(ids_comuns)[:5]):
    api_item = api_por_id[id_despesa]
    planilha_item = planilha_por_id[id_despesa]
    
    print(f"\n   ID: {id_despesa}")
    print(f"   {'Campo':<30} {'API':<25} {'Planilha':<25} {'Match'}")
    print(f"   {'-'*30} {'-'*25} {'-'*25} {'-'*5}")
    
    campos_chave = ['Nome do relatório', 'Nome do membro de equipe', 'CPF/CNPJ', 'Status', 
                    'Descrição da despesa', 'Centro de Custos', 'Forma de pagamento', 'Valor']
    
    for campo in campos_chave:
        api_val = str(api_item.get(campo, ''))[:20]
        planilha_val = str(planilha_item.get(campo, ''))[:20]
        match = '✅' if api_val == planilha_val else '❌'
        print(f"   {campo:<30} {api_val:<25} {planilha_val:<25} {match}")

# Verificar campos nulos na API
print(f"\n📊 Campos nulos na API (porcentagem):")
for campo in cabecalho:
    nulos = sum(1 for item in dados_api if item.get(campo) is None)
    pct = (nulos / len(dados_api)) * 100
    if pct > 50:
        print(f"   {campo:<30}: {nulos}/{len(dados_api)} ({pct:.1f}%)")

# Verificar campos preenchidos na planilha mas não na API
print(f"\n🔍 Campos preenchidos na planilha mas vazios na API:")
for campo in cabecalho:
    planilha_preenchidos = sum(1 for linha in amostra_maio if linha[cabecalho.index(campo)] is not None)
    api_preenchidos = sum(1 for item in dados_api if item.get(campo) is not None)
    
    if planilha_preenchidos > 0 and api_preenchidos == 0:
        print(f"   {campo}: {planilha_preenchidos} na planilha, 0 na API")

# Resumo
print(f"\n✅ RESUMO:")
print(f"   A extração via API funcionou para Maio 2025")
print(f"   {len(ids_comuns)} IDs encontrados em ambas as fontes")
print(f"   Verificar manualmente se os dados correspondem")
