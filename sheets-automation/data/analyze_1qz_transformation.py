#!/usr/bin/env python3
"""
Analisa a transformação de dados de 1QZ da API para o CONTROLE
Identifica o padrão de cálculo
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


def extract_controle_quinzenas_abril_1qz():
    """Extrai dados de quinzenas de ABRIL 1QZ do CONTROLE."""
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
                
                # Extrair dados de ABRIL 1QZ
                for row in rows[2:]:
                    indices = [idx for idx in [cpf_idx, valor_idx, qz_idx, mes_idx, ano_idx] if idx is not None]
                    if indices and len(row) > max(indices):
                        cpf = row[cpf_idx].replace('.', '').replace('-', '') if cpf_idx is not None and cpf_idx < len(row) else ''
                        valor = float(row[valor_idx]) if valor_idx is not None and valor_idx < len(row) and row[valor_idx] else 0
                        qz = row[qz_idx] if qz_idx is not None and qz_idx < len(row) else ''
                        mes = row[mes_idx] if mes_idx is not None and mes_idx < len(row) else ''
                        ano = row[ano_idx] if ano_idx is not None and ano_idx < len(row) else ''
                        
                        # Filtrar apenas 1QZ (independente do mês)
                        if cpf and valor and '1' in str(qz):
                            key = f"{cpf}_{ano}_{mes}"
                            quinzenas[key] = {
                                'cpf': cpf,
                                'valor': valor,
                                'quinzena': qz,
                                'mes': mes,
                                'ano': ano
                            }
    
    wb.close()
    
    return quinzenas


def compare_1qz_values(api_data, controle_quinzenas):
    """Compara valores de 1QZ entre API e CONTROLE."""
    print("\n🔍 Comparando valores de 1QZ: API vs CONTROLE\n")
    
    api_users = api_data['dados']
    
    matches = []
    differences = []
    
    for user_name, user_data in api_users.items():
        if 'cpf' in user_data:
            cpf = user_data['cpf'].replace('.', '').replace('-', '')
            
            # Buscar qualquer entrada deste CPF no CONTROLE
            controle_entries = [v for k, v in controle_quinzenas.items() if v['cpf'] == cpf]
            
            if controle_entries:
                api_1qz = user_data.get('1qz', 0)
                # Pegar a primeira entrada (pode haver múltiplos períodos)
                controle_1qz = controle_entries[0]['valor']
                
                if api_1qz == controle_1qz:
                    matches.append({
                        'cpf': cpf,
                        'name': user_name,
                        'api': api_1qz,
                        'controle': controle_1qz
                    })
                else:
                    differences.append({
                        'cpf': cpf,
                        'name': user_name,
                        'api': api_1qz,
                        'controle': controle_1qz,
                        'ratio': controle_1qz / api_1qz if api_1qz > 0 else 0
                    })
    
    print(f"📊 Total de usuários na API: {len(api_users)}")
    print(f"📊 Usuários com dados no CONTROLE: {len(controle_quinzenas)}")
    print(f"✅ Valores idênticos: {len(matches)}")
    print(f"⚠️ Valores diferentes: {len(differences)}")
    
    if matches:
        print(f"\n📋 Amostra de valores idênticos:")
        for m in matches[:5]:
            print(f"  {m['name']}: API={m['api']}, CONTROLE={m['controle']}")
    
    if differences:
        print(f"\n📋 Amostra de valores diferentes:")
        for d in differences[:10]:
            print(f"  {d['name']}: API={d['api']}, CONTROLE={d['controle']}, Ratio={d['ratio']:.2f}")
        
        # Analisar padrão de diferença
        ratios = [d['ratio'] for d in differences if d['ratio'] > 0]
        if ratios:
            avg_ratio = sum(ratios) / len(ratios)
            print(f"\n📊 Média do ratio (CONTROLE/API): {avg_ratio:.2f}")
            
            # Verificar se há um padrão consistente
            unique_ratios = set(round(r, 2) for r in ratios)
            print(f"📊 Ratios únicos: {len(unique_ratios)}")
            if len(unique_ratios) <= 5:
                print(f"📊 Ratios: {sorted(unique_ratios)}")
    
    return {
        'total_api': len(api_users),
        'total_controle': len(controle_quinzenas),
        'matches': len(matches),
        'differences': len(differences),
        'match_rate': len(matches) / len(controle_quinzenas) if controle_quinzenas else 0
    }


def main():
    print("🎯 ANÁLISE DE TRANSFORMAÇÃO: 1QZ API → CONTROLE\n")
    print("=" * 60)
    
    # Carregar dados da API
    api_data = load_api_data()
    if not api_data:
        return
    
    # Extrair dados do CONTROLE
    print("📊 Extraindo dados de ABRIL 1QZ do CONTROLE...")
    controle_quinzenas = extract_controle_quinzenas_abril_1qz()
    print(f"✅ Quinzenas extraídas: {len(controle_quinzenas)}")
    
    # Comparar
    results = compare_1qz_values(api_data, controle_quinzenas)
    
    # Salvar resultados
    output_path = Path(__file__).parent / "1qz_transformation_analysis.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    print(f"\n📁 Resultados salvos: {output_path}")
    
    print("\n💡 CONCLUSÃO:")
    if results['match_rate'] > 0.8:
        print("✅ Alta correspondência entre API e CONTROLE")
        print("✅ O CONTROLE provavelmente usa dados diretos da API")
    elif results['match_rate'] > 0.5:
        print("⚠️ Correspondência parcial")
        print("🔍 Pode haver transformação ou filtros aplicados")
    else:
        print("❌ Baixa correspondência")
        print("🔍 Os dados podem vir de outra fonte ou sofrer transformação complexa")


if __name__ == "__main__":
    main()
