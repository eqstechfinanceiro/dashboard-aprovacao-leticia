#!/usr/bin/env python3
"""Analisar estrutura da planilha CONTROLE para encontrar valores de prestação"""
import pandas as pd
from pathlib import Path

BASE = Path(__file__).parent.parent
CONTROLE_FILE = BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"

print("=" * 80)
print("  ANÁLISE DA PLANILHA CONTROLE - MAIO 2026")
print("=" * 80)

xl = pd.ExcelFile(CONTROLE_FILE)

# Analisar cada aba relevante
for sheet_name in ['PAINEL PRESTAÇÕES', 'BASE PREST ', 'PAINEL', 'QUINZENAS']:
    if sheet_name in xl.sheet_names:
        print(f"\n📋 Aba: '{sheet_name}'")
        df = pd.read_excel(CONTROLE_FILE, sheet_name=sheet_name, header=None)
        print(f"  Dimensões: {df.shape}")
        
        # Mostrar primeiras 10 linhas e 10 colunas
        print("  Primeiras células (10x10):")
        for i in range(min(10, len(df))):
            row_vals = []
            for j in range(min(10, len(df.columns))):
                val = df.iloc[i, j]
                if pd.notna(val):
                    row_vals.append(f"[{i},{j}]={val}")
            if row_vals:
                print(f"    {' | '.join(row_vals)}")
        
        # Procurar por valores numéricos que pareçam prestação (grandes valores)
        print("\n  Procurando valores numéricos significativos...")
        for i in range(min(20, len(df))):
            for j in range(len(df.columns)):
                val = df.iloc[i, j]
                if pd.notna(val) and isinstance(val, (int, float)):
                    if 1000 <= val <= 500000:  # Valores entre 1.000 e 500.000
                        print(f"    [{i},{j}] = R$ {val:,.2f}")

print("\n" + "=" * 80)
print("  RESUMO COMPARAÇÃO")
print("=" * 80)
print(f"  API (report date): R$ 205,793.25")
print(f"  API (expense date): R$ 124,078.05")
print("=" * 80)
