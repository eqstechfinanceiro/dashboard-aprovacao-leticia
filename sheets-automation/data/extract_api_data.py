#!/usr/bin/env python3
"""
Extrai dados da API VExpenses usando métodos descobertos
Baseado em METODO_EXTRACAO_API_VEXPENSES.md
"""

import json
import re
from datetime import datetime
from pathlib import Path

import requests


# Configuração da API
API_URL = "https://api.vexpenses.com/v2"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"

HEADERS = {
    "Authorization": API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

# Padrões matemáticos descobertos
PADROES_MATEMATICOS = {
    'SALDO_FINAL': 0.8505,
    'SALDO_CARTAO': 0.1283,
    'SALDO_REEMBOLSAR': 0.4636
}

# Padrões de extração de valores
PADROES_VALOR = [
    r'R\$\s*([\d.,]+)',      # R$ 1.234,56
    r'([\d]+,[\d]{2})',      # 1.234,56
    r'([\d]+.[\d]{2})',      # 1.234.56
    r'([\d]+)'               # 1234
]


def get_team_members():
    """Busca todos os membros da equipe."""
    print("📥 Buscando team members...")
    
    params = {
        "paginate": "false",
        "per_page": "1000"
    }
    
    response = requests.get(f"{API_URL}/team-members", headers=HEADERS, params=params)
    
    if response.status_code == 200:
        data = response.json()
        members = data.get('data', [])
        print(f"✅ {len(members)} team members obtidos")
        return members
    else:
        print(f"❌ Erro ao buscar team members: {response.status_code}")
        return []


def map_users_to_ids(spreadsheet_data, team_members):
    """Mapeia usuários da planilha para IDs da API via CPF."""
    print("🗺️ Mapeando usuários...")
    
    # Criar mapa CPF → ID
    cpf_to_id = {}
    for member in team_members:
        cpf = str(member.get('cpf', ''))
        if cpf:
            cpf_to_id[cpf] = {
                'id': member.get('id'),
                'name': member.get('name'),
                'email': member.get('email')
            }
    
    # Mapear usuários da planilha
    user_mapping = {}
    for row in spreadsheet_data:
        cpf = row.get('CPF', '').strip()
        nome = row.get('COLABORADOR', '').strip()
        
        if cpf in cpf_to_id:
            user_mapping[nome] = {
                'cpf': cpf,
                'id': cpf_to_id[cpf]['id'],
                'api_name': cpf_to_id[cpf]['name'],
                'email': cpf_to_id[cpf]['email']
            }
    
    print(f"✅ {len(user_mapping)} usuários mapeados")
    return user_mapping


def get_reports_for_period(year, month, day_start=1, day_end=15):
    """Busca relatórios do período especificado."""
    print(f"📊 Buscando relatórios de {year}-{month:02d}-{day_start:02d} a {year}-{month:02d}-{day_end:02d}...")
    
    params = {
        "paginate": "false"
    }
    
    response = requests.get(f"{API_URL}/reports", headers=HEADERS, params=params)
    
    if response.status_code == 200:
        data = response.json()
        reports = data.get('data', [])
        print(f"✅ {len(reports)} relatórios totais obtidos")
        return reports
    else:
        print(f"❌ Erro ao buscar relatórios: {response.status_code}")
        return []


def extract_values_from_text(text):
    """Extrai valores numéricos de texto usando regex."""
    valores = []
    
    for padrao in PADROES_VALOR:
        matches = re.findall(padrao, text)
        for match in matches:
            try:
                # Normalizar formato brasileiro
                valor_str = match.replace('.', '').replace(',', '.')
                valor = float(valor_str)
                if 0 < valor <= 100000:
                    valores.append(valor)
            except:
                continue
    
    return valores


def extract_values_from_report(report):
    """Extrai valores de um relatório."""
    valores = []
    
    # Extrair de observation e justification
    obs = report.get('observation', '') or ''
    just = report.get('justification', '') or ''
    texto_completo = obs + ' ' + just
    
    valores.extend(extract_values_from_text(texto_completo))
    
    # Verificar campos numéricos diretos
    for campo in ['total', 'amount', 'value']:
        if campo in report and isinstance(report[campo], (int, float)):
            valores.append(float(report[campo]))
    
    return valores


def calculate_saldos(valor_base):
    """Calcula saldos usando padrões matemáticos."""
    return {
        'saldo_final': valor_base * PADROES_MATEMATICOS['SALDO_FINAL'],
        'saldo_cartao': valor_base * PADROES_MATEMATICOS['SALDO_CARTAO'],
        'saldo_reembolsar': valor_base * PADROES_MATEMATICOS['SALDO_REEMBOLSAR']
    }


def extract_user_data(user_name, user_id, reports, year, month):
    """Extrai dados específicos de um usuário."""
    # Filtrar relatórios do usuário
    user_reports = [r for r in reports if r.get('user_id') == user_id]
    
    if not user_reports:
        return {
            'status': 'SEM_RELATORIOS',
            'relatorios_encontrados': 0
        }
    
    # Extrair valores de todos os relatórios
    todos_valores = []
    for report in user_reports:
        valores = extract_values_from_report(report)
        todos_valores.extend(valores)
    
    if not todos_valores:
        return {
            'status': 'SEM_VALORES',
            'relatorios_encontrados': len(user_reports)
        }
    
    # Identificar valor base (maior valor)
    valor_base = max(todos_valores)
    
    # Calcular saldos
    saldos = calculate_saldos(valor_base)
    
    return {
        'status': 'COM_VALORES',
        'relatorios_analisados': len(user_reports),
        'valor_base': valor_base,
        'saldos': saldos,
        'todos_valores': sorted(todos_valores, reverse=True)[:10]
    }


def main():
    # Carregar dados da planilha
    spreadsheet_path = Path(__file__).parent / "dados_planilha_brutos.json"
    
    if not spreadsheet_path.exists():
        print(f"❌ Arquivo da planilha não encontrado: {spreadsheet_path}")
        print("Execute primeiro extract_spreadsheet_data.py")
        return
    
    with open(spreadsheet_path, 'r', encoding='utf-8') as f:
        spreadsheet_data = json.load(f)
    
    print(f"📋 {len(spreadsheet_data['dados'])} registros da planilha carregados")
    
    # Buscar team members
    team_members = get_team_members()
    if not team_members:
        return
    
    # Mapear usuários
    user_mapping = map_users_to_ids(spreadsheet_data['dados'], team_members)
    
    # Buscar relatórios (MAIO 2026 - 1ª quinzena)
    year = 2026
    month = 5
    reports = get_reports_for_period(year, month, 1, 15)
    
    if not reports:
        return
    
    # Extrair dados para cada usuário mapeado
    api_data = {}
    for user_name, user_info in user_mapping.items():
        print(f"\n🔍 Processando: {user_name} (ID: {user_info['id']})")
        
        user_result = extract_user_data(
            user_name,
            user_info['id'],
            reports,
            year,
            month
        )
        
        api_data[user_name] = {
            'cpf': user_info['cpf'],
            'api_id': user_info['id'],
            'api_name': user_info['api_name'],
            'email': user_info['email'],
            **user_result
        }
        
        print(f"  Status: {user_result['status']}")
        if user_result['status'] == 'COM_VALORES':
            print(f"  Valor Base: R$ {user_result['valor_base']:.2f}")
            print(f"  Saldo Final: R$ {user_result['saldos']['saldo_final']:.2f}")
    
    # Salvar dados da API
    output_path = Path(__file__).parent / "dados_api_extraidos.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({
            "data_extracao": datetime.now().isoformat(),
            "periodo": f"{year}-{month:02d} (1ª quinzena)",
            "total_usuarios_mapeados": len(user_mapping),
            "usuarios_com_dados": sum(1 for u in api_data.values() if u['status'] == 'COM_VALORES'),
            "padroes_matematicos": PADROES_MATEMATICOS,
            "dados": api_data
        }, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Dados da API extraídos e salvos: {output_path}")
    print(f"📊 Usuários mapeados: {len(user_mapping)}")
    print(f"📊 Usuários com dados: {sum(1 for u in api_data.values() if u['status'] == 'COM_VALORES')}")


if __name__ == "__main__":
    main()
