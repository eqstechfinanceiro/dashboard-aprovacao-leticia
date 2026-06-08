#!/usr/bin/env python3
"""
Compara dados do CONTROLE com dados da API VExpenses
para identificar o padrão de transformação
"""

import json
from pathlib import Path

from pyxlsb import open_workbook


def load_api_data():
    """Carrega dados da API extraídos anteriormente."""
    filepath = Path(__file__).parent / "dados_api_extraidos.json"
    
    if not filepath.exists():
        print(f"❌ Arquivo da API não encontrado: {filepath}")
        return None
    
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def extract_controle_quinzenas():
    """Extrai dados de quinzenas do CONTROLE."""
    filepath = Path(__file__).parent / "CONTROLE - VEXPENSES - ABRIL- 2026.xlsb"
    
    quinzenas = {}
    
    wb = open_workbook(filepath)
    
    if 'QUINZENAS' in list(wb.sheets):
        with wb.get_sheet('QUINZENAS') as sheet:
            rows = []
            for row_idx, row in enumerate(sheet.rows()):
                if row_idx >= 1000:
                    break
                
                row_data = []
                for cell in row:
                    if cell and cell.v is not None:
                        row_data.append(str(cell.v))
                    else:
                        row_data.append("")
                
                if any(row_data):
                    rows.append(row_data)
            
            # Header está na linha 2 (idx 1)
            if len(rows) >= 2:
                header = rows[1]
                
                # Encontrar índices
                cpf_idx = None
                valor_idx = None
                qz_idx = None
                mes_idx = None
                ano_idx = None
                
                for i, h in enumerate(header):
                    h_upper = str(h).upper()
                    if 'CPF' in h_upper:
                        cpf_idx = i
                    elif 'VALOR' in h_upper:
                        valor_idx = i
                    elif 'QUINZENA' in h_upper:
                        qz_idx = i
                    elif 'M' in h_upper and len(h) == 1:
                        mes_idx = i
                    elif 'ANO' in h_upper:
                        ano_idx = i
                
                print(f"Índices: CPF={cpf_idx}, VALOR={valor_idx}, QZ={qz_idx}, M={mes_idx}, ANO={ano_idx}")
                
                # Extrair dados a partir da linha 3 (idx 2)
                for row in rows[2:]:
                    indices = [idx for idx in [cpf_idx, valor_idx, qz_idx, mes_idx, ano_idx] if idx is not None]
                    if indices and len(row) > max(indices):
                        cpf = row[cpf_idx].replace('.', '').replace('-', '') if cpf_idx is not None and cpf_idx < len(row) else ''
                        valor = float(row[valor_idx]) if valor_idx is not None and valor_idx < len(row) and row[valor_idx] else 0
                        qz = row[qz_idx] if qz_idx is not None and qz_idx < len(row) else ''
                        mes = row[mes_idx] if mes_idx is not None and mes_idx < len(row) else ''
                        ano = row[ano_idx] if ano_idx is not None and ano_idx < len(row) else ''
                        
                        if cpf and valor:
                            key = f"{cpf}_{ano}_{mes}_{qz}"
                            quinzenas[key] = {
                                'cpf': cpf,
                                'valor': valor,
                                'quinzena': qz,
                                'mes': mes,
                                'ano': ano
                            }
    
    wb.close()
    
    return quinzenas


def extract_controle_saldo_cartao():
    """Extrai dados de saldo de cartão do CONTROLE."""
    filepath = Path(__file__).parent / "CONTROLE - VEXPENSES - ABRIL- 2026.xlsb"
    
    saldo_cartao = {}
    
    wb = open_workbook(filepath)
    
    if 'SALDO CARTAO' in list(wb.sheets):
        with wb.get_sheet('SALDO CARTAO') as sheet:
            rows = []
            for row_idx, row in enumerate(sheet.rows()):
                if row_idx >= 1000:
                    break
                
                row_data = []
                for cell in row:
                    if cell and cell.v is not None:
                        row_data.append(str(cell.v))
                    else:
                        row_data.append("")
                
                if any(row_data):
                    rows.append(row_data)
            
            # Header está na linha 2 (idx 1)
            if len(rows) >= 2:
                header = rows[1]
                
                # Encontrar índices (CPF col 2, VALOR col 3, DATA col 4)
                for row in rows[2:]:
                    if len(row) >= 5:
                        cpf = row[2].replace('.', '').replace('-', '') if row[2] else ''
                        valor = float(row[3]) if row[3] else 0
                        data = row[4] if row[4] else ''
                        
                        if cpf and valor:
                            if cpf not in saldo_cartao:
                                saldo_cartao[cpf] = []
                            saldo_cartao[cpf].append({
                                'valor': valor,
                                'data': data
                            })
    
    wb.close()
    
    return saldo_cartao


def compare_with_api(api_data, controle_quinzenas, controle_saldo):
    """Compara dados do CONTROLE com dados da API."""
    print("\n🔍 Comparando dados do CONTROLE com dados da API\n")
    
    # Extrair dados da API
    api_users = api_data['dados']
    
    print(f"📊 Usuários na API: {len(api_users)}")
    print(f"📊 Quinzenas no CONTROLE: {len(controle_quinzenas)}")
    print(f"📊 Saldo cartão no CONTROLE: {len(controle_saldo)}")
    
    # Cruzar por CPF
    api_cpfs = set()
    for user_name, user_data in api_users.items():
        if 'cpf' in user_data:
            api_cpfs.add(user_data['cpf'].replace('.', '').replace('-', ''))
    
    controle_cpfs = set()
    for key, data in controle_quinzenas.items():
        controle_cpfs.add(data['cpf'])
    
    for cpf in controle_saldo.keys():
        controle_cpfs.add(cpf)
    
    print(f"\n📊 CPFs na API: {len(api_cpfs)}")
    print(f"📊 CPFs no CONTROLE: {len(controle_cpfs)}")
    
    # Intersecção
    common_cpfs = api_cpfs & controle_cpfs
    print(f"✅ CPFs em comum: {len(common_cpfs)}")
    
    # Mostrar exemplos
    if common_cpfs:
        print(f"\n📋 Amostra de CPFs em comum:")
        for cpf in list(common_cpfs)[:5]:
            print(f"  - {cpf}")
            
            # Mostrar dados da API
            for user_name, user_data in api_users.items():
                if 'cpf' in user_data:
                    api_cpf = user_data['cpf'].replace('.', '').replace('-', '')
                    if api_cpf == cpf:
                        print(f"    API: {user_name}")
                        if '1qz' in user_data:
                            print(f"    1QZ API: {user_data['1qz']}")
                        break
            
            # Mostrar dados do CONTROLE
            for key, data in controle_quinzenas.items():
                if data['cpf'] == cpf:
                    print(f"    CONTROLE 1QZ: {data['valor']}")
                    break
    
    return {
        'api_users': len(api_users),
        'controle_quinzenas': len(controle_quinzenas),
        'controle_saldo': len(controle_saldo),
        'api_cpfs': len(api_cpfs),
        'controle_cpfs': len(controle_cpfs),
        'common_cpfs': len(common_cpfs)
    }


def main():
    print("🎯 COMPARAÇÃO: CONTROLE vs API VEXPENSES\n")
    print("=" * 60)
    
    # Carregar dados da API
    api_data = load_api_data()
    if not api_data:
        return
    
    # Extrair dados do CONTROLE
    print("📊 Extraindo dados do CONTROLE...")
    controle_quinzenas = extract_controle_quinzenas()
    print(f"✅ Quinzenas extraídas: {len(controle_quinzenas)}")
    
    controle_saldo = extract_controle_saldo_cartao()
    print(f"✅ Saldo cartão extraído: {len(controle_saldo)}")
    
    # Comparar
    results = compare_with_api(api_data, controle_quinzenas, controle_saldo)
    
    # Salvar resultados
    output_path = Path(__file__).parent / "controle_api_comparison.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    print(f"\n📁 Resultados salvos: {output_path}")
    
    print("\n💡 CONCLUSÃO:")
    if results['common_cpfs'] > 0:
        print("✅ Existem CPFs em comum entre API e CONTROLE")
        print("✅ Isso sugere que o CONTROLE usa dados da API")
        print("🎯 Próximo passo: identificar como os dados são transformados")
    else:
        print("⚠️ Não foram encontrados CPFs em comum")
        print("🔍 Os dados podem vir de outra fonte")


if __name__ == "__main__":
    main()
