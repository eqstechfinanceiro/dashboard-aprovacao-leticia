#!/usr/bin/env python3
"""
Script para analisar planilhas usando apenas pandas
"""

import pandas as pd
import json
from pathlib import Path

def analyze_sheet(file_path, sheet_name):
    """Analisa uma sheet específica"""
    print(f"\n--- SHEET: {sheet_name} ---")

    try:
        df = pd.read_excel(file_path, sheet_name=sheet_name, header=None, engine='openpyxl')
    except:
        try:
            df = pd.read_excel(file_path, sheet_name=sheet_name, header=None, engine='pyxlsb')
        except Exception as e:
            print(f"Erro ao ler sheet {sheet_name}: {e}")
            return None

    sheet_data = {
        "name": sheet_name,
        "max_row": len(df),
        "max_column": len(df.columns),
        "columns": [],
        "sample_rows": []
    }

    print(f"Dimensões: {len(df)} linhas x {len(df.columns)} colunas")

    # Ler todas as colunas da primeira linha
    for col_idx in range(min(50, len(df.columns))):  # Limitar a 50 colunas
        cell_value = df.iloc[0, col_idx]
        sheet_data["columns"].append({
            "index": col_idx + 1,
            "name": str(cell_value) if pd.notna(cell_value) else ""
        })
        print(f"  Coluna {col_idx + 1}: {cell_value}")

    if len(df.columns) > 50:
        print(f"  ... mais {len(df.columns) - 50} colunas (total: {len(df.columns)})")

    # Ler primeiras 3 linhas como amostra
    print(f"\nPrimeiras 3 linhas de dados:")
    for row_idx in range(min(3, len(df))):
        row_data = []
        for col_idx in range(min(20, len(df.columns))):  # Limitar a 20 colunas para amostra
            cell_value = df.iloc[row_idx, col_idx]
            row_data.append(str(cell_value) if pd.notna(cell_value) else "")
        sheet_data["sample_rows"].append(row_data)
        print(f"  Linha {row_idx + 1}: {row_data}")

    return sheet_data

def main():
    base_path = Path(r"c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/data")

    planilha1 = base_path / "1QZ ABRIL 2026 - VEXPENSES (1).xlsx"
    planilha2 = base_path / "CONTROLE - VEXPENSES - ABRIL- 2026 (1).xlsb"

    all_results = {}

    # Analisar planilha 1
    print(f"\n{'='*80}")
    print(f"PLANILHA 1: {planilha1.name}")
    print(f"{'='*80}")

    try:
        xls1 = pd.ExcelFile(planilha1, engine='openpyxl')
        print(f"Sheets encontradas: {xls1.sheet_names}")

        all_results["planilha1"] = {
            "file": str(planilha1),
            "type": "xlsx",
            "sheets": {}
        }

        for sheet_name in xls1.sheet_names:
            sheet_data = analyze_sheet(planilha1, sheet_name)
            if sheet_data:
                all_results["planilha1"]["sheets"][sheet_name] = sheet_data
    except Exception as e:
        print(f"Erro ao analisar planilha 1: {e}")

    # Analisar planilha 2
    print(f"\n{'='*80}")
    print(f"PLANILHA 2: {planilha2.name}")
    print(f"{'='*80}")

    try:
        xls2 = pd.ExcelFile(planilha2, engine='pyxlsb')
        print(f"Sheets encontradas: {xls2.sheet_names}")

        all_results["planilha2"] = {
            "file": str(planilha2),
            "type": "xlsb",
            "sheets": {}
        }

        for sheet_name in xls2.sheet_names:
            sheet_data = analyze_sheet(planilha2, sheet_name)
            if sheet_data:
                all_results["planilha2"]["sheets"][sheet_name] = sheet_data
    except Exception as e:
        print(f"Erro ao analisar planilha 2: {e}")

    # Salvar resultado em JSON
    output_path = Path(r"c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/vexpenses-dashboard/spreadsheets_complete_analysis.json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*80}")
    print(f"Análise completa salva em: {output_path}")
    print(f"{'='*80}")

if __name__ == "__main__":
    main()
