#!/usr/bin/env python3
"""
Script simplificado para analisar planilhas completamente
"""

import pandas as pd
import json
from pathlib import Path

def analyze_sheet(file_path, sheet_name):
    """Analisa uma sheet específica"""
    print(f"\n--- SHEET: {sheet_name} ---")
    df = pd.read_excel(file_path, sheet_name=sheet_name, header=None)

    sheet_data = {
        "name": sheet_name,
        "max_row": len(df),
        "max_column": len(df.columns),
        "columns": [],
        "sample_rows": []
    }

    print(f"Dimensões: {len(df)} linhas x {len(df.columns)} colunas")

    # Ler todas as colunas da primeira linha
    for col_idx in range(len(df.columns)):
        cell_value = df.iloc[0, col_idx]
        sheet_data["columns"].append({
            "index": col_idx + 1,
            "name": str(cell_value) if pd.notna(cell_value) else ""
        })
        if col_idx < 30:  # Mostrar apenas primeiras 30 colunas
            print(f"  Coluna {col_idx + 1}: {cell_value}")

    if len(df.columns) > 30:
        print(f"  ... mais {len(df.columns) - 30} colunas")

    # Ler primeiras 3 linhas como amostra
    print(f"\nPrimeiras 3 linhas de dados:")
    for row_idx in range(min(3, len(df))):
        row_data = []
        for col_idx in range(len(df.columns)):
            cell_value = df.iloc[row_idx, col_idx]
            row_data.append(str(cell_value) if pd.notna(cell_value) else "")
        sheet_data["sample_rows"].append(row_data)
        if row_idx < 3:
            print(f"  Linha {row_idx + 1}: {row_data[:15]}...")  # Primeiras 15 colunas

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

    xls1 = pd.ExcelFile(planilha1)
    print(f"Sheets encontradas: {xls1.sheet_names}")

    all_results["planilha1"] = {
        "file": str(planilha1),
        "type": "xlsx",
        "sheets": {}
    }

    for sheet_name in xls1.sheet_names:
        sheet_data = analyze_sheet(planilha1, sheet_name)
        all_results["planilha1"]["sheets"][sheet_name] = sheet_data

    # Analisar planilha 2
    print(f"\n{'='*80}")
    print(f"PLANILHA 2: {planilha2.name}")
    print(f"{'='*80}")

    xls2 = pd.ExcelFile(planilha2)
    print(f"Sheets encontradas: {xls2.sheet_names}")

    all_results["planilha2"] = {
        "file": str(planilha2),
        "type": "xlsb",
        "sheets": {}
    }

    for sheet_name in xls2.sheet_names:
        sheet_data = analyze_sheet(planilha2, sheet_name)
        all_results["planilha2"]["sheets"][sheet_name] = sheet_data

    # Salvar resultado em JSON
    output_path = Path(r"c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/vexpenses-dashboard/spreadsheets_complete_analysis.json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*80}")
    print(f"Análise completa salva em: {output_path}")
    print(f"{'='*80}")

if __name__ == "__main__":
    main()
