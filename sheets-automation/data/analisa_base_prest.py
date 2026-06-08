#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🔍 ANÁLISE DA ABA BASE PREST
Extrai amostra de dados para investigação de automação
"""

import json
import random
import os

def analisar_base_prest():
    """Analisa a estrutura da aba BASE PREST e extrai amostra"""
    
    print("🔍 ANALISANDO ABA BASE PREST")
    print("=" * 60)
    
    # Carregar arquivo
    with open('../converted/controle_maio_2026.json', 'r', encoding='utf-8') if os.path.exists('../converted/controle_maio_2026.json') else open('converted/controle_maio_2026.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Verificar chaves disponíveis
    chaves_disponiveis = list(data.keys())
    print(f"   Abas disponíveis: {chaves_disponiveis}")
    
    # Tentar encontrar BASE PREST (com ou sem espaço)
    base_prest_key = None
    for key in chaves_disponiveis:
        if 'BASE PREST' in key.upper() or 'BASEPREST' in key.upper():
            base_prest_key = key
            break
    
    if not base_prest_key:
        print("❌ Aba BASE PREST não encontrada")
        return
    
    base_prest = data[base_prest_key]
    print(f"   ✅ Usando aba: {base_prest_key}")
    
    # Estrutura
    print(f"\n📊 ESTRUTURA:")
    print(f"   Total de linhas: {len(base_prest)}")
    
    if len(base_prest) > 0:
        cabecalho = base_prest[0]
        print(f"   Total de colunas: {len(cabecalho)}")
        print(f"\n📋 COLUNAS:")
        for i, col in enumerate(cabecalho):
            print(f"   {i:2}. {col}")
    
    # Extrair amostra de 100 dados diferentes
    print(f"\n📦 EXTRAINDO AMOSTRA DE 100 DADOS DIFERENTES...")
    
    # Pegar linhas de dados (ignorando cabeçalho e linhas vazias)
    linhas_dados = []
    for linha in base_prest[1:]:
        if linha and any(c for c in linha if c):
            linhas_dados.append(linha)
    
    print(f"   Linhas com dados: {len(linhas_dados)}")
    
    # Selecionar amostra aleatória de 100
    amostra = random.sample(linhas_dados, min(100, len(linhas_dados)))
    
    # Salvar amostra
    output_file = 'amostra_base_prest_100.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump({
            'cabecalho': cabecalho,
            'total_linhas': len(linhas_dados),
            'amostra_tamanho': len(amostra),
            'dados': amostra
        }, f, ensure_ascii=False, indent=2)
    
    print(f"   ✅ Amostra salva em: {output_file}")
    
    # Análise dos dados
    print(f"\n📈 ANÁLISE DOS DADOS:")
    
    # Contar valores únicos por coluna
    for i, col in enumerate(cabecalho):
        valores = [linha[i] if i < len(linha) else None for linha in amostra]
        valores_unicos = set(v for v in valores if v is not None and v != '')
        print(f"   {col:30} - {len(valores_unicos)} valores únicos")
    
    # Mostrar alguns exemplos
    print(f"\n💡 EXEMPLOS DE DADOS (primeiros 5):")
    for i, linha in enumerate(amostra[:5], 1):
        print(f"\n   Exemplo {i}:")
        for j, (col, val) in enumerate(zip(cabecalho, linha)):
            if val:
                print(f"      {col:30}: {val}")
    
    return cabecalho, amostra

if __name__ == "__main__":
    analisar_base_prest()
