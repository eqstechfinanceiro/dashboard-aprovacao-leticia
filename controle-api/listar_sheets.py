#!/usr/bin/env python3
import pandas as pd
from pathlib import Path

# Listar sheets das planilhas CARGA
files = [
    Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx"),
    Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 2 QZ MAIO 26 VEXPENSES EQS (1).xlsx"),
]

for f in files:
    print(f"\n{'='*60}")
    print(f"Arquivo: {f.name}")
    print(f"{'='*60}")
    
    xl = pd.ExcelFile(f)
    print(f"Sheets disponíveis: {xl.sheet_names}")
    
    # Ler primeira linha de cada sheet
    for sheet in xl.sheet_names:
        print(f"\n--- Sheet: {sheet} ---")
        try:
            df = pd.read_excel(f, sheet_name=sheet, header=None, nrows=10)
            print(df.head(5).to_string())
        except Exception as e:
            print(f"Erro: {e}")
