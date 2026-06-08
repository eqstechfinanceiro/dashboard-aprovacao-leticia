#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🎯 EXTRAÇÃO ESPECÍFICA DE VALORES DE SALDOS
Foco exclusivo nos dados mais importantes: SALDO FINAL, SALDO CARTÃO, SALDO REEMBOLSAR
"""

import json
import re
from decimal import Decimal
from collections import defaultdict

# Padrões matemáticos descobertos anteriormente
PADROES_MATEMATICOS = {
    'SALDO_FINAL': 0.8505,
    'SALDO_CARTAO': 0.1283,
    'SALDO_REEMBOLSAR': 0.4636
}

def carregar_reports():
    """Carregar todos os reports para análise de saldos"""
    try:
        with open('reports_jonas_abril_2026.json', 'r', encoding='utf-8') as f:
            dados = json.load(f)
        return dados.get('data', [])
    except Exception as e:
        print(f"❌ Erro ao carregar reports: {e}")
        return []

def extrair_valores_numericos(texto):
    """Extrai todos os valores numéricos de um texto"""
    if not texto:
        return []
    
    # Padrões para encontrar valores monetários
    padroes = [
        r'R\$\s*([\d.,]+)',  # R$ 1.234,56
        r'R\$\s*([\d]+)',    # R$ 1234
        r'(\d+,\d{2})',     # 1.234,56
        r'(\d+\.\d{2})',     # 1234.56
        r'(\d+)',           # 1234
    ]
    
    valores = []
    for padrao in padroes:
        matches = re.findall(padrao, texto, re.IGNORECASE)
        for match in matches:
            # Limpar o valor
            valor_str = match.replace('.', '').replace(',', '.')
            try:
                valor = float(valor_str)
                if valor > 0:  # Ignorar valores zero ou negativos
                    valores.append(valor)
            except:
                continue
    
    return valores

def analisar_saldo_especifico(report):
    """Análise específica para dados de saldo em um report"""
    texto_completo = ""
    
    # Combinar todos os campos de texto
    campos_texto = [
        report.get('observation', ''),
        report.get('justification', ''),
        report.get('description', '')
    ]
    
    texto_completo = ' '.join([campo for campo in campos_texto if campo])
    texto_lower = texto_completo.lower()
    
    # Padrões específicos de saldo
    padroes_saldo = [
        'saldo final',
        'saldo cartão', 
        'saldo reembolsar',
        'saldo',
        '1qz',
        'total',
        'valor total',
        'valor disponível',
        'disponível'
    ]
    
    resultado = {
        'report_id': report.get('id'),
        'user_id': report.get('user_id'),
        'description': report.get('description'),
        'status': report.get('status'),
        'tem_saldo': False,
        'tipo_saldo': None,
        'valores_encontrados': [],
        'texto_original': texto_completo[:200],
        'payment_method_id': report.get('payment_method_id')
    }
    
    # Verificar se tem menção a saldo
    for padrao in padroes_saldo:
        if padrao in texto_lower:
            resultado['tem_saldo'] = True
            resultado['tipo_saldo'] = padrao.upper()
            break
    
    if resultado['tem_saldo']:
        # Extrair valores numéricos
        valores = extrair_valores_numericos(texto_completo)
        resultado['valores_encontrados'] = valores
    
    return resultado

def main():
    """Função principal - Foco exclusivo em saldos"""
    print("🎯 EXTRAÇÃO ESPECÍFICA DE VALORES DE SALDOS")
    print("=" * 60)
    print("📊 Foco: SALDO FINAL, SALDO CARTÃO, SALDO REEMBOLSAR")
    print("🔍 Analisando 1.552 menções a saldos encontradas...")
    print()
    
    # Carregar reports
    reports = carregar_reports()
    
    if not reports:
        print("❌ Não foi possível carregar os reports")
        return
    
    print(f"✅ {len(reports)} reports carregados para análise")
    
    # Análise específica de saldos
    dados_saldo = []
    
    print("🔍 Analisando reports em busca de dados de saldo...")
    
    for i, report in enumerate(reports):
        if i % 1000 == 0:
            print(f"   Processando {i}/{len(reports)}...")
        
        resultado = analisar_saldo_especifico(report)
        if resultado['tem_saldo']:
            dados_saldo.append(resultado)
    
    print(f"\n📊 RESULTADOS DA ANÁLISE DE SALDOS:")
    print(f"   Total de reports com menção a saldo: {len(dados_saldo)}")
    
    if not dados_saldo:
        print("❌ Nenhum dado de saldo encontrado!")
        return
    
    # Análise dos valores encontrados
    todos_valores = []
    tipos_saldo_encontrados = defaultdict(list)
    
    for dado in dados_saldo:
        for valor in dado['valores_encontrados']:
            todos_valores.append(valor)
            if dado['tipo_saldo']:
                tipos_saldo_encontrados[dado['tipo_saldo']].append(valor)
    
    print(f"\n💰 ANÁLISE DOS VALORES ENCONTRADOS:")
    print(f"   Total de valores numéricos: {len(todos_valores)}")
    
    if todos_valores:
        print(f"   Menor valor: R$ {min(todos_valores):.2f}")
        print(f"   Maior valor: R$ {max(todos_valores):.2f}")
        print(f"   Média dos valores: R$ {sum(todos_valores)/len(todos_valores):.2f}")
    
    print(f"\n📋 TIPOS DE SALDO ENCONTRADOS:")
    for tipo, valores in tipos_saldo_encontrados.items():
        print(f"   {tipo}: {len(valores)} ocorrências")
        if valores:
            print(f"     Valores: R$ {min(valores):.2f} - R$ {max(valores):.2f}")
    
    # Exemplos mais promissores
    print(f"\n🎯 EXEMPLOS MAIS PROMISSORES DE DADOS DE SALDO:")
    
    # Ordenar por quantidade de valores
    dados_ordenados = sorted(dados_saldo, key=lambda x: len(x['valores_encontrados']), reverse=True)
    
    for i, dado in enumerate(dados_ordenados[:10]):
        if dado['valores_encontrados']:
            print(f"\n{i+1}. Report ID: {dado['report_id']}")
            print(f"   Descrição: {dado['description']}")
            print(f"   Status: {dado['status']}")
            print(f"   Tipo de saldo: {dado['tipo_saldo']}")
            print(f"   Valores: {dado['valores_encontrados']}")
            print(f"   Texto: {dado['texto_original']}...")
    
    # Tentativa de correlacionar com padrões matemáticos
    print(f"\n🔍 TENTANDO CORRELAÇÃO COM PADRÕES MATEMÁTICOS:")
    print(f"   Padrões conhecidos:")
    for padrao, fator in PADROES_MATEMATICOS.items():
        print(f"     {padrao}: {fator}")
    
    # Salvar resultados detalhados
    resultado_final = {
        'data_analise': '2026-05-21T20:57:00',
        'total_reports_analisados': len(reports),
        'reports_com_saldo': len(dados_saldo),
        'todos_valores_encontrados': todos_valores,
        'tipos_saldo_encontrados': dict(tipos_saldo_encontrados),
        'dados_detalhados': dados_saldo,
        'padroes_matematicos': PADROES_MATEMATICOS
    }
    
    with open('valores_saldos_extraidos.json', 'w', encoding='utf-8') as f:
        json.dump(resultado_final, f, ensure_ascii=False, indent=2, default=str)
    
    print(f"\n💾 Resultados detalhados salvos em: valores_saldos_extraidos.json")
    
    print(f"\n🎯 CONCLUSÃO - ANÁLISE DE SALDOS:")
    print(f"   ✅ {len(dados_saldo)} reports com menção a saldo")
    print(f"   ✅ {len(todos_valores)} valores numéricos extraídos")
    print(f"   ✅ {len(tipos_saldo_encontrados)} tipos de saldo identificados")
    print(f"   ⚠️  Próximo passo: correlacionar valores com padrões matemáticos")
    
    return resultado_final

if __name__ == "__main__":
    main()