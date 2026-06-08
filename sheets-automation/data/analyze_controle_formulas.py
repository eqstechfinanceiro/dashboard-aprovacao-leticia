#!/usr/bin/env python3
"""
Analisa profundamente o arquivo CONTROLE - VEXPENSES
Mapeia todas as abas, fórmulas e origens dos dados
"""

import json
from pathlib import Path

from pyxlsb import open_workbook


def analyze_controle_structure():
    """Analisa a estrutura completa do arquivo CONTROLE."""
    filepath = Path(__file__).parent / "CONTROLE - VEXPENSES - ABRIL- 2026.xlsb"
    
    if not filepath.exists():
        print(f"❌ Arquivo não encontrado: {filepath}")
        return None
    
    print("🔍 Analisando CONTROLE - VEXPENSES - ABRIL- 2026.xlsb\n")
    
    wb = open_workbook(filepath)
    
    # Listar todas as abas
    sheets = list(wb.sheets)
    
    print(f"📋 Total de abas: {len(sheets)}")
    print(f"📋 Nomes das abas:")
    for i, name in enumerate(sheets, 1):
        print(f"  {i}. {name}")
    
    # Analisar cada aba
    sheet_details = {}
    for sheet_name in sheets:
        print(f"\n🔍 Analisando aba: {sheet_name}")
        
        with wb.get_sheet(sheet_name) as sheet:
            rows = []
            row_count = 0
            
            for row_idx, row in enumerate(sheet.rows()):
                if row_idx >= 100:  # Limitar a primeiras 100 linhas
                    break
                
                row_data = []
                for cell in row:
                    if cell and cell.v is not None:
                        row_data.append(str(cell.v))
                    else:
                        row_data.append("")
                
                if any(row_data):  # Se linha não está vazia
                    rows.append(row_data)
                    row_count += 1
            
            sheet_details[sheet_name] = {
                "total_rows_analyzed": row_count,
                "sample_rows": rows[:5],  # Primeiras 5 linhas
                "columns": len(rows[0]) if rows else 0
            }
            
            print(f"  Linhas analisadas: {row_count}")
            print(f"  Colunas: {len(rows[0]) if rows else 0}")
            
            if rows:
                print(f"  Amostra da primeira linha:")
                for i, val in enumerate(rows[0][:10]):
                    print(f"    Col {i}: {val[:50] if val else ''}")
    
    wb.close()
    
    return sheet_details


def identify_formulas_and_sources():
    """Tenta identificar fórmulas e fontes de dados."""
    print("\n🧮 Tentando identificar fórmulas e fontes de dados...\n")
    
    # Como pyxlsb não lê fórmulas diretamente, vamos analisar padrões nos dados
    filepath = Path(__file__).parent / "CONTROLE - VEXPENSES - ABRIL- 2026.xlsb"
    
    wb = open_workbook(filepath)
    
    for sheet_name in list(wb.sheets):
        print(f"\n📊 Aba: {sheet_name}")
        
        with wb.get_sheet(sheet_name) as sheet:
            # Analisar primeiras 20 linhas para identificar padrões
            for row_idx, row in enumerate(sheet.rows()):
                if row_idx >= 20:
                    break
                
                row_data = []
                for cell in row:
                    if cell and cell.v is not None:
                        row_data.append(str(cell.v))
                    else:
                        row_data.append("")
                
                # Procurar padrões que indiquem dados da API
                # CPFs, IDs, datas, valores monetários
                for val in row_data:
                    # CPF pattern
                    if len(val) == 11 and val.isdigit():
                        print(f"  ✅ CPF encontrado: {val}")
                    # ID pattern (numérico longo)
                    if val.isdigit() and len(val) > 5:
                        print(f"  ✅ ID numérico encontrado: {val}")
                    # Valor monetário
                    if val.replace('.', '').replace(',', '').isdigit():
                        print(f"  ✅ Valor encontrado: {val}")
    
    wb.close()


def main():
    print("🎯 INVESTIGAÇÃO PROFUNDA: CONTROLE - VEXPENSES\n")
    print("=" * 60)
    
    # Análise estrutural
    sheet_details = analyze_controle_structure()
    
    # Identificar fórmulas e fontes
    identify_formulas_and_sources()
    
    # Salvar resultados
    if sheet_details:
        output_path = Path(__file__).parent / "controle_structure_analysis.json"
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(sheet_details, f, indent=2, ensure_ascii=False)
        print(f"\n📁 Análise salva: {output_path}")
    
    print("\n💡 PRÓXIMOS PASSOS:")
    print("1. Converter .xlsb para .xlsx para ler fórmulas")
    print("2. Usar openpyxl para extrair fórmulas completas")
    print("3. Mapear dependências entre células")
    print("4. Identificar quais dados vêm da API VExpenses")
    print("5. Replicar cálculos via código")


if __name__ == "__main__":
    main()
