#!/usr/bin/env python3
"""
Explorar estrutura da planilha CARGA 1 QZ para entender o formato
"""

import pandas as pd
from pathlib import Path

CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")

print("=" * 80)
print("EXPLORANDO ESTRUTURA DA CARGA 1 QZ")
print("=" * 80)

xl = pd.ExcelFile(CARGA_1QZ)
print(f"\nSheets disponiveis: {xl.sheet_names}")

for sheet in xl.sheet_names:
    print(f"\n{'='*60}")
    print(f"Sheet: {sheet}")
    print(f"{'='*60}")
    
    # Ler sem header para ver estrutura
    df = pd.read_excel(CARGA_1QZ, sheet_name=sheet, header=None)
    print(f"\nShape: {df.shape}")
    print(f"\nPrimeiras 10 linhas (todas colunas):")
    print(df.head(10).to_string())
    
    print(f"\nUltimas 5 linhas:")
    print(df.tail(5).to_string())
