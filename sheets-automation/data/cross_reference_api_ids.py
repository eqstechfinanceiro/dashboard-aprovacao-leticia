#!/usr/bin/env python3
"""
Cruza IDs do arquivo CONTROLE com dados da API VExpenses
para identificar correspondências e origem dos dados
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


def extract_ids_from_controle():
    """Extrai IDs numéricos do arquivo CONTROLE."""
    filepath = Path(__file__).parent / "CONTROLE - VEXPENSES - ABRIL- 2026.xlsb"
    
    ids_found = set()
    
    wb = open_workbook(filepath)
    
    for sheet_name in list(wb.sheets):
        with wb.get_sheet(sheet_name) as sheet:
            for row_idx, row in enumerate(sheet.rows()):
                if row_idx >= 1000:  # Limitar análise
                    break
                
                for cell in row:
                    if cell and cell.v is not None:
                        val = str(cell.v)
                        # IDs numéricos longos (provavelmente report_id ou expense_id)
                        if val.isdigit() and len(val) >= 5:
                            ids_found.add(val)
    
    wb.close()
    
    return ids_found


def cross_reference_with_api(api_data, controle_ids):
    """Cruza IDs do CONTROLE com dados da API."""
    print("🔍 Cruzando IDs do CONTROLE com dados da API VExpenses\n")
    
    # Extrair IDs da API
    api_report_ids = set()
    api_user_ids = set()
    
    for user_name, user_data in api_data['dados'].items():
        api_user_ids.add(str(user_data['api_id']))
    
    print(f"📊 IDs encontrados no CONTROLE: {len(controle_ids)}")
    print(f"📊 User IDs da API: {len(api_user_ids)}")
    
    # Verificar correspondências
    matches_user = controle_ids & api_user_ids
    
    print(f"\n✅ Correspondências com User IDs: {len(matches_user)}")
    
    if matches_user:
        print("  IDs que correspondem:")
        for match_id in list(matches_user)[:10]:
            print(f"    - {match_id}")
    
    # Mostrar IDs do CONTROLE que parecem ser report IDs (muito longos)
    long_ids = [id for id in controle_ids if len(id) >= 7]
    print(f"\n📊 IDs longos (possíveis report IDs): {len(long_ids)}")
    print("  Amostra:")
    for long_id in long_ids[:10]:
        print(f"    - {long_id}")
    
    return {
        'controle_ids': len(controle_ids),
        'api_user_ids': len(api_user_ids),
        'user_id_matches': len(matches_user),
        'long_ids': len(long_ids),
        'matches': list(matches_user)[:20]
    }


def analyze_controle_structure_detailed():
    """Analisa estrutura detalhada das abas principais."""
    filepath = Path(__file__).parent / "CONTROLE - VEXPENSES - ABRIL- 2026.xlsb"
    
    print("\n🔍 Análise detalhada das abas principais\n")
    
    key_sheets = ['QUINZENAS', 'SALDO CARTAO', 'ADICIONAIS', 'EXTRATO']
    
    wb = open_workbook(filepath)
    
    for sheet_name in key_sheets:
        if sheet_name in list(wb.sheets):
            print(f"\n📋 {sheet_name}:")
            
            with wb.get_sheet(sheet_name) as sheet:
                # Analisar estrutura
                rows = []
                for row_idx, row in enumerate(sheet.rows()):
                    if row_idx >= 10:
                        break
                    
                    row_data = []
                    for cell in row:
                        if cell and cell.v is not None:
                            row_data.append(str(cell.v))
                        else:
                            row_data.append("")
                    
                    if any(row_data):
                        rows.append(row_data)
                
                print(f"  Linhas analisadas: {len(rows)}")
                if rows:
                    print(f"  Estrutura (primeiras 3 linhas):")
                    for i, row in enumerate(rows[:3]):
                        print(f"    Linha {i+1}: {row[:8]}")
    
    wb.close()


def main():
    print("🎯 CRUZAMENTO: CONTROLE vs API VEXPENSES\n")
    print("=" * 60)
    
    # Carregar dados da API
    api_data = load_api_data()
    if not api_data:
        return
    
    # Extrair IDs do CONTROLE
    controle_ids = extract_ids_from_controle()
    
    # Cruzar com API
    results = cross_reference_with_api(api_data, controle_ids)
    
    # Análise detalhada
    analyze_controle_structure_detailed()
    
    # Salvar resultados
    output_path = Path(__file__).parent / "cross_reference_results.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    print(f"\n📁 Resultados salvos: {output_path}")
    
    print("\n💡 CONCLUSÃO:")
    if results['user_id_matches'] > 0:
        print("✅ O CONTROLE contém User IDs da API VExpenses")
        print("✅ Isso confirma que os dados são puxados da API")
        print("🎯 Próximo passo: identificar como os dados são extraídos")
    else:
        print("⚠️ Não foram encontradas correspondências diretas")
        print("🔍 Os dados podem ser extraídos via outro método")


if __name__ == "__main__":
    main()
