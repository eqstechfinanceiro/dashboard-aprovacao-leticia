#!/usr/bin/env python3
"""
Extrair PRESTAÇÃO DE CONTAS do PAINEL do CONTROLE (1ª QZ e 2ª QZ MAIO 2026)
para entender exatamente o que a planilha calcula e comparar com a API.
"""
import pandas as pd
from pathlib import Path

BASE = Path(__file__).parent.parent
CONTROLE_MAIO = BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"
CARGA_1QZ = BASE / "data" / "CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx"
CARGA_2QZ = BASE / "data" / "CARGA 2 QZ MAIO 26 VEXPENSES EQS (1).xlsx"

print("=" * 80)
print("  EXTRAINDO PRESTAÇÃO DE CONTAS DO PAINEL")
print("=" * 80)

# 1. Ler o PAINEL do CONTROLE (header na linha 10, índice base 0)
df_painel = pd.read_excel(CONTROLE_MAIO, sheet_name='PAINEL', header=10)
print(f"\n1. PAINEL carregado: {df_painel.shape}")
print(f"   Colunas: {list(df_painel.columns)}")

# 2. Mostrar a linha do ABNER para mapear todas as colunas
print("\n2. Mapeamento de colunas (ABNER como exemplo):")
abner = df_painel[df_painel.iloc[:, 1].astype(str).str.contains('ABNER', na=False)]
if len(abner) > 0:
    row = abner.iloc[0]
    for i, (col, val) in enumerate(row.items()):
        print(f"   [{i:2d}] {col!r}: {val}")

print("\n" + "=" * 80)
print("  LENDO A CARGA 2ª QZ MAIO (valores colados do PAINEL atualizado)")
print("=" * 80)

# 3. Ler a CARGA 2QZ - header na linha 2 (índice 2)
df_carga = pd.read_excel(CARGA_2QZ, sheet_name='2 QZ DE MAIO 26', header=2)
print(f"\n3. CARGA 2QZ carregada: {df_carga.shape}")
print(f"   Colunas: {list(df_carga.columns)}")

# Mostrar ABNER
print("\n4. ABNER na CARGA 2QZ:")
abner2 = df_carga[df_carga.iloc[:, 1].astype(str).str.contains('ABNER', na=False)]
if len(abner2) > 0:
    row2 = abner2.iloc[0]
    for i, (col, val) in enumerate(row2.items()):
        print(f"   [{i:2d}] {col!r}: {val}")
