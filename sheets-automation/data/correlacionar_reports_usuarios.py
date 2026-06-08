#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🎯 CORRELAÇÃO DE REPORTS COM USUÁRIOS ESPECÍFICOS
Extração de dados de aprovação hierárquica dos 4.14MB de reports
"""

import json
import pandas as pd
from datetime import datetime
from collections import defaultdict

# Dados dos usuários mapeados
USUARIOS_MAPEADOS = {
    "895945": {"nome_planilha": "JONAS CAVALCANTI", "nome_real": "ADAUTO JOSE PEREIRA"},
    "895946": {"nome_planilha": "RODRIGO CESAR", "nome_real": "ADEMARCIO DUARTE LOPES"},
    "895947": {"nome_planilha": "CAIO FRANCESCONI", "nome_real": "ADILSON MELLO DE CAMARGO"}
}

# Gestores identificados
GESTORES = {
    "896113": {"nome": "FERNANDA ARAGÃO LOPES", "funcao": "GESTOR/DIRETORIA"},
    "895948": {"nome": "ADILSON RODRIGUES FERREIRA", "funcao": "GESTOR INTERMEDIÁRIO"},
    "896397": {"nome": "THIAGO NEVES DE FREITAS", "funcao": "GESTOR ADMINISTRATIVO"}
}

def carregar_reports():
    """Carrega os dados dos reports do arquivo JSON"""
    try:
        with open('reports_jonas_abril_2026.json', 'r', encoding='utf-8') as f:
            dados = json.load(f)
        
        if dados.get('success'):
            return dados.get('data', [])
        else:
            print(f"❌ Erro ao carregar reports: {dados.get('message')}")
            return []
    except Exception as e:
        print(f"❌ Erro ao ler arquivo: {e}")
        return []

def analisar_reports_usuario(user_id, reports):
    """Analisa reports de um usuário específico"""
    usuario = USUARIOS_MAPEADOS.get(user_id, {})
    nome_planilha = usuario.get('nome_planilha', f'Usuário {user_id}')
    nome_real = usuario.get('nome_real', 'Desconhecido')
    
    print(f"\n🔍 ANALISANDO REPORTS DE: {nome_planilha} ({nome_real})")
    print(f"🆔 ID: {user_id}")
    print("=" * 60)
    
    # Filtrar reports do usuário
    reports_usuario = [r for r in reports if str(r.get('user_id')) == str(user_id)]
    
    if not reports_usuario:
        print(f"❌ Nenhum report encontrado para {nome_planilha}")
        return None
    
    print(f"📊 Total de reports encontrados: {len(reports_usuario)}")
    
    # Análise detalhada
    analise = {
        'usuario_id': user_id,
        'nome_planilha': nome_planilha,
        'nome_real': nome_real,
        'total_reports': len(reports_usuario),
        'reports_aprovados': 0,
        'reports_pendentes': 0,
        'reports_reprovados': 0,
        'gestores_envolvidos': set(),
        'datas_aprovacao': [],
        'approval_stages': defaultdict(int),
        'payment_methods': defaultdict(int),
        'valores_totais': [],
        'observacoes': [],
        'justificativas': []
    }
    
    for report in reports_usuario:
        status = report.get('status', '').upper()
        
        # Contagem por status
        if 'APROVADO' in status:
            analise['reports_aprovados'] += 1
        elif 'REPROVADO' in status:
            analise['reports_reprovados'] += 1
        else:
            analise['reports_pendentes'] += 1
        
        # Dados de aprovação
        approval_user_id = report.get('approval_user_id')
        if approval_user_id:
            gestor = GESTORES.get(str(approval_user_id))
            if gestor:
                analise['gestores_envolvidos'].add(f"{gestor['nome']} ({approval_user_id})")
            else:
                analise['gestores_envolvidos'].add(f"Gestor Desconhecido ({approval_user_id})")
        
        # Data de aprovação
        approval_date = report.get('approval_date')
        if approval_date:
            analise['datas_aprovacao'].append(approval_date)
        
        # Approval stages
        approval_stage_id = report.get('approval_stage_id')
        if approval_stage_id:
            analise['approval_stages'][approval_stage_id] += 1
        
        # Payment methods
        payment_method_id = report.get('payment_method_id')
        if payment_method_id:
            analise['payment_methods'][payment_method_id] += 1
        
        # Observações e justificativas
        obs = report.get('observation', '').strip()
        if obs:
            analise['observacoes'].append(obs)
        
        just = report.get('justification', '').strip()
        if just:
            analise['justificativas'].append(just)
    
    # Exibir resultados
    print(f"✅ Reports aprovados: {analise['reports_aprovados']}")
    print(f"⏳ Reports pendentes: {analise['reports_pendentes']}")
    print(f"❌ Reports reprovados: {analise['reports_reprovados']}")
    
    print(f"\n👥 Gestores envolvidos:")
    for gestor in sorted(analise['gestores_envolvidos']):
        print(f"   • {gestor}")
    
    print(f"\n📋 Approval Stages (IDs mais comuns):")
    for stage_id, count in sorted(analise['approval_stages'].items(), key=lambda x: x[1], reverse=True)[:5]:
        print(f"   • Stage {stage_id}: {count} reports")
    
    print(f"\n💳 Payment Methods (IDs mais comuns):")
    for method_id, count in sorted(analise['payment_methods'].items(), key=lambda x: x[1], reverse=True)[:5]:
        print(f"   • Method {method_id}: {count} reports")
    
    if analise['datas_aprovacao']:
        print(f"\n📅 Últimas aprovações:")
        for data in sorted(analise['datas_aprovacao'])[-5:]:
            print(f"   • {data}")
    
    if analise['observacoes']:
        print(f"\n📝 Observações (exemplos):")
        for obs in analise['observacoes'][:3]:
            print(f"   • {obs[:100]}...")
    
    if analise['justificativas']:
        print(f"\n💬 Justificativas (exemplos):")
        for just in analise['justificativas'][:3]:
            print(f"   • {just[:100]}...")
    
    return analise

def analisar_saldos_reports(reports):
    """Tenta extrair informações de saldos dos reports"""
    print("\n🔍 ANALISANDO DADOS DE SALDOS NOS REPORTS")
    print("=" * 60)
    
    # Procurar por menções a saldos em observações e justificativas
    mencoes_saldo = []
    padroes_saldo = ['saldo', 'saldo final', 'saldo cartão', 'reembolsar', '1qz', 'caixa']
    
    for report in reports:
        obs = report.get('observation', '').lower()
        just = report.get('justification', '').lower()
        
        for padrao in padroes_saldo:
            if padrao in obs or padrao in just:
                mencoes_saldo.append({
                    'report_id': report.get('id'),
                    'user_id': report.get('user_id'),
                    'description': report.get('description'),
                    'observation': report.get('observation'),
                    'justification': report.get('justification'),
                    'status': report.get('status')
                })
                break
    
    print(f"📊 Menções a saldos encontradas: {len(mencoes_saldo)}")
    
    if mencoes_saldo:
        print(f"\n🔍 Exemplos de menções a saldos:")
        for i, mencao in enumerate(mencoes_saldo[:5]):
            print(f"\n{i+1}. Report ID: {mencao['report_id']}")
            print(f"   Usuário: {mencao['user_id']}")
            print(f"   Descrição: {mencao['description']}")
            print(f"   Status: {mencao['status']}")
            
            if mencao['observation']:
                print(f"   Observação: {mencao['observation'][:200]}...")
            if mencao['justification']:
                print(f"   Justificativa: {mencao['justification'][:200]}...")
    
    return mencoes_saldo

def main():
    """Função principal"""
    print("🎯 CORRELAÇÃO DE REPORTS COM USUÁRIOS ESPECÍFICOS")
    print("=" * 60)
    print("📊 Analisando 4.14MB de dados de reports...")
    print("🔍 Foco: Abril 2026 - Usuários mapeados")
    print()
    
    # Carregar dados
    reports = carregar_reports()
    
    if not reports:
        print("❌ Não foi possível carregar os dados dos reports")
        return
    
    print(f"✅ Carregados {len(reports)} reports")
    
    # Analisar cada usuário
    analises = {}
    for user_id in USUARIOS_MAPEADOS.keys():
        analise = analisar_reports_usuario(user_id, reports)
        if analise:
            analises[user_id] = analise
    
    # Análise de saldos
    mencoes_saldo = analisar_saldos_reports(reports)
    
    # Resumo final
    print("\n" + "=" * 60)
    print("📋 RESUMO FINAL DA CORRELAÇÃO")
    print("=" * 60)
    
    total_reports = sum(a['total_reports'] for a in analises.values())
    total_aprovados = sum(a['reports_aprovados'] for a in analises.values())
    
    print(f"📊 Total de reports analisados: {total_reports}")
    print(f"✅ Total de reports aprovados: {total_aprovados}")
    print(f"📈 Taxa de aprovação: {(total_aprovados/total_reports*100):.1f}%" if total_reports > 0 else "N/A")
    
    print(f"\n👥 Todos os gestores envolvidos:")
    todos_gestores = set()
    for analise in analises.values():
        todos_gestores.update(analise['gestores_envolvidos'])
    
    for gestor in sorted(todos_gestores):
        print(f"   • {gestor}")
    
    print(f"\n🎯 CONCLUSÃO:")
    print(f"   ✅ Dados de aprovação hierárquica extraídos com sucesso")
    print(f"   ✅ Gestores identificados e correlacionados")
    print(f"   ✅ Status dos reports mapeados")
    print(f"   {'✅' if mencoes_saldo else '⚠️'} Dados de saldos {'encontrados' if mencoes_saldo else 'não encontrados diretamente'}")
    
    # Salvar resultados
    resultados = {
        'data_analise': datetime.now().isoformat(),
        'total_reports': len(reports),
        'analises_usuarios': analises,
        'mencoes_saldo': mencoes_saldo,
        'gestores_identificados': {gid: ginfo for gid, ginfo in GESTORES.items()}
    }
    
    with open('correlacao_reports_usuarios.json', 'w', encoding='utf-8') as f:
        json.dump(resultados, f, ensure_ascii=False, indent=2, default=str)
    
    print(f"\n💾 Resultados salvos em: correlacao_reports_usuarios.json")

if __name__ == "__main__":
    main()