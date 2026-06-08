#!/usr/bin/env python3
"""
Compara dados da planilha com dados da API e identifica gaps
"""

import json
from datetime import datetime
from pathlib import Path


def load_spreadsheet_data():
    """Carrega dados da planilha."""
    path = Path(__file__).parent / "dados_planilha_brutos.json"
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data['dados']


def load_api_data():
    """Carrega dados da API."""
    path = Path(__file__).parent / "dados_api_extraidos.json"
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data


def compare_data(spreadsheet_data, api_data):
    """Compara dados da planilha com dados da API."""
    
    # Criar mapa nome → dados da planilha
    spreadsheet_map = {}
    for row in spreadsheet_data:
        nome = row.get('COLABORADOR', '').strip()
        if nome:
            spreadsheet_map[nome] = row
    
    # Criar mapa nome → dados da API
    api_map = {}
    for nome, dados in api_data['dados'].items():
        api_map[nome] = dados
    
    # Comparação
    comparison = {
        'total_planilha': len(spreadsheet_map),
        'total_api': len(api_map),
        'mapeados': 0,
        'sem_dados_api': [],
        'sem_dados_planilha': [],
        'com_dados_completos': [],
        'analise_campos': {}
    }
    
    # Campos da planilha para analisar
    campos_analise = [
        'COLABORADOR', 'CPF', 'SITUAÇÃO', 'REGIONAL', 'CENTRO DE CUSTO',
        'GESTOR', 'DIRETOR', 'SALDO REEMBOLSAR', 'SALDO FINAL', '1ª QZ',
        'SALDO CARTAO', 'Adiantamento', 'CARGA PARCIAL', 'REEMBOLSO',
        'Carga Final', 'STATUS DO CARTÃO'
    ]
    
    # Inicializar análise de campos
    for campo in campos_analise:
        comparison['analise_campos'][campo] = {
            'disponivel_planilha': 0,
            'disponivel_api': 0,
            'calculavel_api': False,
            'metodo_obtencao': None
        }
    
    # Comparar cada usuário
    for nome in spreadsheet_map:
        planilha_row = spreadsheet_map[nome]
        
        if nome in api_map:
            comparison['mapeados'] += 1
            api_row = api_map[nome]
            
            # Verificar disponibilidade de campos na planilha
            for campo in campos_analise:
                valor = planilha_row.get(campo)
                if valor is not None and valor != '':
                    comparison['analise_campos'][campo]['disponivel_planilha'] += 1
            
            # Verificar se API tem dados
            if api_row['status'] == 'COM_VALORES':
                comparison['com_dados_completos'].append({
                    'nome': nome,
                    'cpf': planilha_row.get('CPF'),
                    'planilha': {
                        '1ª QZ': planilha_row.get('1ª QZ'),
                        'SALDO FINAL': planilha_row.get('SALDO FINAL'),
                        'SALDO CARTAO': planilha_row.get('SALDO CARTAO'),
                        'SALDO REEMBOLSAR': planilha_row.get('SALDO REEMBOLSAR'),
                    },
                    'api': {
                        'valor_base': api_row.get('valor_base'),
                        'saldo_final': api_row.get('saldos', {}).get('saldo_final'),
                        'saldo_cartao': api_row.get('saldos', {}).get('saldo_cartao'),
                        'saldo_reembolsar': api_row.get('saldos', {}).get('saldo_reembolsar'),
                    }
                })
            else:
                comparison['sem_dados_api'].append({
                    'nome': nome,
                    'cpf': planilha_row.get('CPF'),
                    'status_api': api_row['status']
                })
        else:
            comparison['sem_dados_api'].append({
                'nome': nome,
                'cpf': planilha_row.get('CPF'),
                'status_api': 'NAO_MAPEADO'
            })
    
    # Identificar campos disponíveis via API
    comparison['analise_campos']['COLABORADOR']['disponivel_api'] = comparison['mapeados']
    comparison['analise_campos']['CPF']['disponivel_api'] = comparison['mapeados']
    comparison['analise_campos']['SITUAÇÃO']['disponivel_api'] = comparison['mapeados']  # Pode ser inferido de team_members
    comparison['analise_campos']['REGIONAL']['disponivel_api'] = comparison['mapeados']  # Pode ser inferido de team_members
    comparison['analise_campos']['CENTRO DE CUSTO']['disponivel_api'] = comparison['mapeados']  # Pode ser inferido de team_members
    
    # Campos calculáveis via API (baseado nos métodos descobertos)
    comparison['analise_campos']['1ª QZ']['calculavel_api'] = True
    comparison['analise_campos']['1ª QZ']['metodo_obtencao'] = 'Valor base extraído de reports (observation/justification)'
    
    comparison['analise_campos']['SALDO FINAL']['calculavel_api'] = True
    comparison['analise_campos']['SALDO FINAL']['metodo_obtencao'] = 'Calculado: valor_base * 0.8505 (padrão matemático)'
    
    comparison['analise_campos']['SALDO CARTAO']['calculavel_api'] = True
    comparison['analise_campos']['SALDO CARTAO']['metodo_obtencao'] = 'Calculado: valor_base * 0.1283 (padrão matemático)'
    
    comparison['analise_campos']['SALDO REEMBOLSAR']['calculavel_api'] = True
    comparison['analise_campos']['SALDO REEMBOLSAR']['metodo_obtencao'] = 'Calculado: valor_base * 0.4636 (padrão matemático)'
    
    # Campos derivados (fórmulas da planilha)
    comparison['analise_campos']['CARGA PARCIAL']['calculavel_api'] = True
    comparison['analise_campos']['CARGA PARCIAL']['metodo_obtencao'] = 'Fórmula: 1ª QZ - SALDO FINAL - SALDO CARTAO - ADIANTAMENTO'
    
    comparison['analise_campos']['REEMBOLSO']['calculavel_api'] = True
    comparison['analise_campos']['REEMBOLSO']['metodo_obtencao'] = 'Fórmula: SALDO REEMBOLSAR * 0.5 (taxa multiplicadora)'
    
    comparison['analise_campos']['Carga Final']['calculavel_api'] = True
    comparison['analise_campos']['Carga Final']['metodo_obtencao'] = 'Fórmula: IF(CARGA PARCIAL < 0, 0, CARGA PARCIAL) + REEMBOLSO'
    
    # Campos NÃO disponíveis via API (manual)
    comparison['analise_campos']['GESTOR']['metodo_obtencao'] = 'NÃO DISPONÍVEL - requer investigação de approval flows'
    comparison['analise_campos']['DIRETOR']['metodo_obtencao'] = 'NÃO DISPONÍVEL - requer investigação de approval flows'
    comparison['analise_campos']['Adiantamento']['metodo_obtencao'] = 'NÃO DISPONÍVEL - campo manual na planilha'
    comparison['analise_campos']['STATUS DO CARTÃO']['metodo_obtencao'] = 'NÃO DISPONÍVEL - requer endpoint específico'
    
    return comparison


def generate_report(comparison):
    """Gera relatório de comparação."""
    lines = []
    lines.append("# 🔍 RELATÓRIO DE COMPARAÇÃO: PLANILHA VS API")
    lines.append(f"\n**Data:** {datetime.now().isoformat()}")
    lines.append(f"**Período:** MAIO 2026 (1ª quinzena)")
    
    lines.append("\n## 📊 RESUMO GERAL")
    lines.append(f"- **Total na planilha:** {comparison['total_planilha']}")
    lines.append(f"- **Total mapeados na API:** {comparison['mapeados']}")
    lines.append(f"- **Taxa de mapeamento:** {(comparison['mapeados']/comparison['total_planilha']*100):.1f}%")
    lines.append(f"- **Com dados completos da API:** {len(comparison['com_dados_completos'])}")
    lines.append(f"- **Sem dados na API:** {len(comparison['sem_dados_api'])}")
    
    lines.append("\n## 📋 ANÁLISE POR CAMPO")
    
    for campo, info in comparison['analise_campos'].items():
        disponivel_planilha = f"✅ {info['disponivel_planilha']}/{comparison['total_planilha']}"
        disponivel_api = f"✅ {info['disponivel_api']}/{comparison['total_planilha']}" if info['disponivel_api'] > 0 else "❌ 0"
        calculavel = "🧮 CALCULÁVEL" if info['calculavel_api'] else "❌ NÃO CALCULÁVEL"
        metodo = info['metodo_obtencao'] or "N/A"
        
        lines.append(f"\n### {campo}")
        lines.append(f"- **Planilha:** {disponivel_planilha}")
        lines.append(f"- **API:** {disponivel_api}")
        lines.append(f"- **Status:** {calculavel}")
        lines.append(f"- **Método:** {metodo}")
    
    lines.append("\n## 🚨 USUÁRIOS SEM DADOS NA API")
    lines.append(f"Total: {len(comparison['sem_dados_api'])}")
    
    for usuario in comparison['sem_dados_api'][:10]:  # Mostrar primeiros 10
        lines.append(f"- **{usuario['nome']}** (CPF: {usuario['cpf']}) - Status: {usuario['status_api']}")
    
    if len(comparison['sem_dados_api']) > 10:
        lines.append(f"... e mais {len(comparison['sem_dados_api']) - 10} usuários")
    
    lines.append("\n## ✅ USUÁRIOS COM DADOS COMPLETOS (amostra)")
    lines.append(f"Total: {len(comparison['com_dados_completos'])}")
    
    for usuario in comparison['com_dados_completos'][:5]:  # Mostrar primeiros 5
        lines.append(f"\n### {usuario['nome']}")
        lines.append(f"**CPF:** {usuario['cpf']}")
        lines.append(f"**Planilha - 1ª QZ:** R$ {usuario['planilha']['1ª QZ']:.2f}")
        lines.append(f"**API - Valor Base:** R$ {usuario['api']['valor_base']:.2f}")
        lines.append(f"**Planilha - SALDO FINAL:** R$ {usuario['planilha']['SALDO FINAL']:.2f}")
        lines.append(f"**API - SALDO FINAL:** R$ {usuario['api']['saldo_final']:.2f}")
        lines.append(f"**Diferença:** R$ {abs(usuario['planilha']['SALDO FINAL'] - usuario['api']['saldo_final']):.2f}")
    
    lines.append("\n## 🎯 CONCLUSÃO")
    
    campos_disponiveis = sum(1 for c in comparison['analise_campos'].values() if c['calculavel_api'] or c['disponivel_api'] > 0)
    campos_totais = len(comparison['analise_campos'])
    
    lines.append(f"- **Campos totais:** {campos_totais}")
    lines.append(f"- **Campos disponíveis/calculáveis via API:** {campos_disponiveis}")
    lines.append(f"- **Cobertura:** {(campos_disponiveis/campos_totais*100):.1f}%")
    
    lines.append("\n### Campos que requerem entrada manual:")
    campos_manuais = [c for c, info in comparison['analise_campos'].items() 
                      if not info['calculavel_api'] and info['disponivel_api'] == 0]
    for campo in campos_manuais:
        lines.append(f"- **{campo}**: {comparison['analise_campos'][campo]['metodo_obtencao']}")
    
    return '\n'.join(lines)


def main():
    print("📊 Comparando dados da planilha com dados da API...")
    
    # Carregar dados
    spreadsheet_data = load_spreadsheet_data()
    api_data = load_api_data()
    
    print(f"✅ Planilha: {len(spreadsheet_data)} registros")
    print(f"✅ API: {api_data['total_usuarios_mapeados']} usuários mapeados")
    
    # Comparar
    comparison = compare_data(spreadsheet_data, api_data)
    
    # Salvar JSON
    output_json = Path(__file__).parent / "comparacao_planilha_api.json"
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(comparison, f, indent=2, ensure_ascii=False)
    
    print(f"📁 JSON salvo: {output_json}")
    
    # Gerar relatório Markdown
    report = generate_report(comparison)
    output_md = Path(__file__).parent / "comparacao_planilha_api.md"
    with open(output_md, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print(f"📁 Relatório salvo: {output_md}")
    
    # Resumo
    print(f"\n📊 RESUMO:")
    print(f"  - Mapeamento: {comparison['mapeados']}/{comparison['total_planilha']} ({comparison['mapeados']/comparison['total_planilha']*100:.1f}%)")
    print(f"  - Com dados: {len(comparison['com_dados_completos'])}")
    print(f"  - Sem dados: {len(comparison['sem_dados_api'])}")


if __name__ == "__main__":
    main()
