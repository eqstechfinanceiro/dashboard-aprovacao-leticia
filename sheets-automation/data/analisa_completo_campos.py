#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🔍 ANÁLISE COMPLETA DOS CAMPOS DA BASE PREST
Responde todas as perguntas do usuário
"""

import json

# Carregar dados da planilha
with open('amostra_base_prest_100.json', 'r', encoding='utf-8') as f:
    dados_planilha = json.load(f)

cabecalho = dados_planilha['cabecalho']
dados = dados_planilha['dados']

# Carregar dados da API
with open('base_prest_2025_05_api.json', 'r', encoding='utf-8') as f:
    dados_api = json.load(f)

print("🔍 ANÁLISE COMPLETA DOS CAMPOS DA BASE PREST")
print("=" * 80)

# 1. Campos com dados 100% da API
print("\n1️⃣ CAMPOS COM DADOS 100% DA API:")
print("-" * 80)
campos_api_100 = []
for campo in cabecalho:
    # Verificar se está preenchido na API
    preenchidos_api = sum(1 for item in dados_api if item.get(campo) is not None and item.get(campo) != '')
    pct = (preenchidos_api / len(dados_api)) * 100 if dados_api else 0
    if pct == 100:
        campos_api_100.append(campo)
        print(f"   ✅ {campo}")

print(f"\n   Total: {len(campos_api_100)} campos")

# 2. Campos que faltam descobrir na API
print("\n2️⃣ CAMPOS QUE FALTAM DESCOBRIR NA API:")
print("-" * 80)
campos_faltam = []
for campo in cabecalho:
    preenchidos_api = sum(1 for item in dados_api if item.get(campo) is not None and item.get(campo) != '')
    pct = (preenchidos_api / len(dados_api)) * 100 if dados_api else 0
    if pct < 100 and pct > 0:
        campos_faltam.append((campo, pct))
        print(f"   ⚠️  {campo:30} ({pct:.1f}% preenchido)")

print(f"\n   Total: {len(campos_faltam)} campos")

# 3. Campos sem dados em nenhuma linha da planilha
print("\n3️⃣ CAMPOS SEM DADOS EM NENHUMA LINHA DA PLANILHA (IGNORAR):")
print("-" * 80)
campos_vazios_planilha = []
for i, campo in enumerate(cabecalho):
    preenchidos_planilha = sum(1 for linha in dados if linha[i] is not None and linha[i] != '')
    if preenchidos_planilha == 0:
        campos_vazios_planilha.append(campo)
        print(f"   ❌ {campo}")

print(f"\n   Total: {len(campos_vazios_planilha)} campos")

# 4. Campos que são fórmulas (baseado no mapeamento anterior)
print("\n4️⃣ CAMPOS QUE SÃO FÓRMULAS:")
print("-" * 80)
campos_formulas = ["MÊS"]  # Baseado na análise anterior
for campo in campos_formulas:
    print(f"   📐 {campo}")

print(f"\n   Total: {len(campos_formulas)} campos")

# 5. Arquivo com dados extraídos
print("\n5️⃣ ARQUIVO COM DADOS EXTRAÍDOS:")
print("-" * 80)
print(f"   📁 amostra_base_prest_100.json")
print(f"      - Contém: Cabeçalho com {len(cabecalho)} colunas")
print(f"      - Amostra: {len(dados)} linhas")
print(f"      - Total linhas planilha: {dados_planilha['total_linhas']}")

# 6. Campos sobraram para procurar
print("\n6️⃣ CAMPOS SOBRARAM PARA PROCURAR NA API:")
print("-" * 80)
campos_procurar = []
for campo in cabecalho:
    # Não está 100% na API
    preenchidos_api = sum(1 for item in dados_api if item.get(campo) is not None and item.get(campo) != '')
    pct_api = (preenchidos_api / len(dados_api)) * 100 if dados_api else 0
    
    # Tem dados na planilha
    preenchidos_planilha = sum(1 for linha in dados if linha[cabecalho.index(campo)] is not None and linha[cabecalho.index(campo)] != '')
    
    # Não é fórmula
    if campo not in campos_formulas:
        # Se tem dados na planilha mas não na API (ou parcial)
        if preenchidos_planilha > 0 and pct_api < 100:
            campos_procurar.append((campo, pct_api, preenchidos_planilha))
            print(f"   🔍 {campo:30} (API: {pct_api:.1f}%, Planilha: {preenchidos_planilha}/{len(dados)})")

print(f"\n   Total: {len(campos_procurar)} campos")

# Resumo final
print("\n" + "=" * 80)
print("📊 RESUMO FINAL:")
print("-" * 80)
print(f"   Campos 100% da API:           {len(campos_api_100)}")
print(f"   Campos parciais na API:       {len(campos_faltam)}")
print(f"   Campos vazios na planilha:     {len(campos_vazios_planilha)} (ignorar)")
print(f"   Campos fórmulas:              {len(campos_formulas)}")
print(f"   Campos para procurar:         {len(campos_procurar)}")
print(f"   Total de campos:              {len(cabecalho)}")
