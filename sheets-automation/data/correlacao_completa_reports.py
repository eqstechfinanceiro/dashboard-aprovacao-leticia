#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🎯 CORRELAÇÃO COMPLETA DE REPORTS COM USUÁRIOS
Análise dos 4.14MB de dados de reports para os 3 usuários mapeados
"""

import json
from collections import defaultdict
from datetime import datetime

# Mapeamento completo dos usuários
USUARIOS_MAPEADOS = {
    "895944": {"nome_planilha": "JONAS CAVALCANTI", "nome_real": "ADAUTO JOSE PEREIRA", "arquivo": "reports_jonas_abril_2026.json"},
    "895946": {"nome_planilha": "RODRIGO CESAR", "nome_real": "ADEMARCIO DUARTE LOPES", "arquivo": "reports_rodrigo_abril_2026.json"},
    "895947": {"nome_planilha": "CAIO FRANCESCONI", "nome_real": "ADILSON MELLO DE CAMARGO", "arquivo": "reports_caio_abril_2026.json"}
}

# Gestores identificados nos approval flows
GESTORES = {
    "896113": {"nome": "FERNANDA ARAGAO LOPES", "funcao": "GESTOR/DIRETORIA"},
    "895948": {"nome": "ADILSON RODRIGUES FERREIRA", "funcao": "GESTOR INTERMEDIARIO"},
    "896397": {"nome": "THIAGO NEVES DE FREITAS", "funcao": "GESTOR ADMINISTRATIVO"}
}

# Payment methods mapeados
PAYMENT_METHODS = {
    "627401": "Cartao Corporativo Itau",
    "627721": "Saque VExpenses",
    "627508": "Outro Metodo"
}

def carregar_reports_usuario(user_id, arquivo):
    """Carrega reports de um usuário específico"""
    try:
        with open(arquivo, 'r', encoding='utf-8') as f:
            dados = json.load(f)
        
        if dados.get('success'):
            return dados.get('data', [])
        else:
            print(f"❌ Erro ao carregar reports do usuário {user_id}: {dados.get('message')}")
            return []
    except Exception as e:
        print(f"❌ Erro ao ler arquivo {arquivo}: {e}")
        return []

def analisar_usuario_completo(user_id, usuario_info):
    """Análise completa dos reports de um usuário"""
    nome_planilha = usuario_info['nome_planilha']
    nome_real = usuario_info['nome_real']
    arquivo = usuario_info['arquivo']
    
    print(f"\n🔍 ANALISANDO: {nome_planilha} ({nome_real})")
    print(f"🆔 ID: {user_id}")
    print("=" * 60)
    
    # Carregar reports
    reports = carregar_reports_usuario(user_id, arquivo)
    
    if not reports:
        print(f"❌ Nenhum report encontrado para {nome_planilha}")
        return None
    
    print(f"📊 Total de reports: {len(reports)}")
    
    # Análise detalhada
    analise = {
        'user_id': user_id,
        'nome_planilha': nome_planilha,
        'nome_real': nome_real,
        'total_reports': len(reports),
        'status_detalhado': defaultdict(int),
        'approval_stages': defaultdict(int),
        'payment_methods': defaultdict(int),
        'datas_criacao': [],
        'datas_aprovacao': [],
        'observacoes': [],
        'justificativas': [],
        'relatorios_por_mes': defaultdict(int),
        'relatorios_por_tipo': defaultdict(int)
    }
    
    # Processar cada report
    for report in reports:
        # Status
        status = report.get('status', 'UNKNOWN')
        analise['status_detalhado'][status] += 1
        
        # Approval stages
        approval_stage_id = report.get('approval_stage_id')
        if approval_stage_id:
            analise['approval_stages'][approval_stage_id] += 1
        
        # Payment methods
        payment_method_id = report.get('payment_method_id')
        if payment_method_id:
            method_name = PAYMENT_METHODS.get(str(payment_method_id), f"Method {payment_method_id}")
            analise['payment_methods'][method_name] += 1
        
        # Datas
        created_at = report.get('created_at')
        if created_at:
            analise['datas_criacao'].append(created_at)
        
        approval_date = report.get('approval_date')
        if approval_date:
            analise['datas_aprovacao'].append(approval_date)
        
        # Observações e justificativas
        obs = report.get('observation', '').strip()
        if obs:
            analise['observacoes'].append(obs)
        
        just = report.get('justification', '').strip()
        if just:
            analise['justificativas'].append(just)
        
        # Análise por mês/tipo
        description = report.get('description', '')
        if 'CAIXA' in description.upper():
            analise['relatorios_por_tipo']['CAIXA'] += 1
        elif 'FATURA' in description.upper():
            analise['relatorios_por_tipo']['FATURA'] += 1
        
        # Extrair mês da descrição
        if '/' in description:
            mes_ano = description.split()[-1]  # Pega o último elemento (ex: "04/2026")
            analise['relatorios_por_mes'][mes_ano] += 1
    
    # Exibir resultados
    print(f"\n📊 STATUS DOS REPORTS:")
    for status, count in sorted(analise['status_detalhado'].items()):
        print(f"   • {status}: {count}")
    
    print(f"\n📋 APPROVAL STAGES (Top 5):")
    for stage_id, count in sorted(analise['approval_stages'].items(), key=lambda x: x[1], reverse=True)[:5]:
        print(f"   • Stage {stage_id}: {count} reports")
    
    print(f"\n💳 PAYMENT METHODS:")
    for method, count in sorted(analise['payment_methods'].items(), key=lambda x: x[1], reverse=True):
        print(f"   • {method}: {count} reports")
    
    print(f"\n📅 RELATÓRIOS POR MÊS:")
    for mes, count in sorted(analise['relatorios_por_mes'].items()):
        print(f"   • {mes}: {count} reports")
    
    print(f"\n📋 TIPOS DE RELATÓRIOS:")
    for tipo, count in sorted(analise['relatorios_por_tipo'].items()):
        print(f"   • {tipo}: {count} reports")
    
    # Buscar menções a saldos
    mencoes_saldo = 0
    padroes_saldo = ['saldo', '1qz', 'reembols', 'caixa', 'dinheiro']
    
    for obs in analise['observacoes'] + analise['justificativas']:
        obs_lower = obs.lower()
        if any(padrao in obs_lower for padrao in padroes_saldo):
            mencoes_saldo += 1
    
    if mencoes_saldo > 0:
        print(f"\n💰 Menções a saldos encontradas: {mencoes_saldo}")
        
        # Exibir exemplos
        exemplos = []
        for obs in analise['observacoes'] + analise['justificativas']:
            obs_lower = obs.lower()
            if any(padrao in obs_lower for padrao in padroes_saldo):
                exemplos.append(obs[:100])
                if len(exemplos) >= 3:
                    break
        
        for i, exemplo in enumerate(exemplos, 1):
            print(f"   {i}. {exemplo}...")
    
    return analise

def analisar_dados_saldos(reports_todos):
    """Análise específica de dados de saldos"""
    print(f"\n🔍 ANÁLISE ESPECÍFICA DE DADOS DE SALDOS")
    print("=" * 60)
    
    padroes_saldo_precisos = [
        'saldo final', 'saldo cartão', 'saldo reembolsar', 
        '1qz', 'total', 'valor', 'r$', 'real'
    ]
    
    dados_saldo = []
    
    for report in reports_todos:
        obs = report.get('observation', '')
        just = report.get('justification', '')
        
        for texto in [obs, just]:
            if any(padrao.lower() in texto.lower() for padrao in padroes_saldo_precisos):
                dados_saldo.append({
                    'report_id': report.get('id'),
                    'user_id': report.get('user_id'),
                    'description': report.get('description'),
                    'texto': texto[:200],
                    'status': report.get('status'),
                    'payment_method': report.get('payment_method_id')
                })
    
    print(f"💰 Possíveis dados de saldos encontrados: {len(dados_saldo)}")
    
    if dados_saldo:
        print(f"\n🎯 EXEMPLOS DE DADOS DE SALDOS:")
        for i, dado in enumerate(dados_saldo[:5], 1):
            print(f"\n{i}. Report {dado['report_id']} - {dado['description']}")
            print(f"   Usuário: {dado['user_id']} | Status: {dado['status']}")
            print(f"   Texto: {dado['texto']}...")
    
    return dados_saldo

def main():
    """Função principal"""
    print("🎯 CORRELAÇÃO COMPLETA DE REPORTS COM USUÁRIOS")
    print("=" * 60)
    print("📊 Analisando dados de Abril 2026 para os 3 usuários mapeados")
    print()
    
    # Analisar cada usuário
    analises = {}
    todos_reports = []
    
    for user_id, usuario_info in USUARIOS_MAPEADOS.items():
        analise = analisar_usuario_completo(user_id, usuario_info)
        if analise:
            analises[user_id] = analise
            
            # Carregar reports para análise de saldos
            reports = carregar_reports_usuario(user_id, usuario_info['arquivo'])
            todos_reports.extend(reports)
    
    # Análise de saldos
    dados_saldo = analisar_dados_saldos(todos_reports)
    
    # Resumo final
    print(f"\n" + "=" * 60)
    print("📋 RESUMO FINAL DA CORRELAÇÃO COMPLETA")
    print("=" * 60)
    
    total_reports_geral = sum(a['total_reports'] for a in analises.values())
    total_aprovados = sum(a['status_detalhado'].get('APROVADO', 0) for a in analises.values())
    
    print(f"📊 Total geral de reports: {total_reports_geral}")
    print(f"✅ Total aprovados: {total_aprovados}")
    print(f"📈 Taxa de aprovação geral: {(total_aprovados/total_reports_geral*100):.1f}%" if total_reports_geral > 0 else "N/A")
    
    print(f"\n👥 USUÁRIOS ANALISADOS:")
    for user_id, analise in analises.items():
        nome = analise['nome_planilha']
        total = analise['total_reports']
        aprovados = analise['status_detalhado'].get('APROVADO', 0)
        taxa = (aprovados/total*100) if total > 0 else 0
        print(f"   • {nome}: {total} reports, {aprovados} aprovados ({taxa:.1f}%)")
    
    print(f"\n💰 DADOS DE SALDOS:")
    print(f"   • Menções encontradas: {len(dados_saldo)}")
    print(f"   • Status: {'✅ Encontrados' if dados_saldo else '⚠️ Não encontrados diretamente'}")
    
    # Salvar resultados completos
    resultado_final = {
        'data_analise': datetime.now().isoformat(),
        'usuarios_mapeados': USUARIOS_MAPEADOS,
        'gestores_identificados': GESTORES,
        'analises_usuarios': analises,
        'dados_saldo': dados_saldo,
        'total_reports_geral': total_reports_geral,
        'resumo_geral': {
            'total_aprovados': total_aprovados,
            'taxa_aprovacao': (total_aprovados/total_reports_geral*100) if total_reports_geral > 0 else 0
        }
    }
    
    with open('correlacao_completa_reports.json', 'w', encoding='utf-8') as f:
        json.dump(resultado_final, f, ensure_ascii=False, indent=2, default=str)
    
    print(f"\n💾 Resultado completo salvo em: correlacao_completa_reports.json")
    
    print(f"\n🎯 CONCLUSÃO:")
    print(f"   ✅ Correlação completa de reports realizada")
    print(f"   ✅ Dados de aprovação hierárquica extraídos")
    print(f"   ✅ Status e métodos de pagamento mapeados")
    print(f"   {'✅' if dados_saldo else '⚠️'} Dados de saldos {'encontrados' if dados_saldo else 'precisam de investigação adicional'}")

if __name__ == "__main__":
    main()