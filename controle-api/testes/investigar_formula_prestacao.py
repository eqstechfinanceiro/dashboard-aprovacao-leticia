#!/usr/bin/env python3
"""
Investigar como a planilha calcula PRESTAÇÃO DE CONTAS por quinzena
"""
import pandas as pd
from pathlib import Path

BASE = Path(__file__).parent.parent
CONTROLE_FILE = BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"

print("=" * 80)
print("  INVESTIGAÇÃO: FÓRMULA PRESTAÇÃO DE CONTAS")
print("=" * 80)

# 1. Verificar quais abas existem
excel_file = pd.ExcelFile(CONTROLE_FILE)
print(f"\n1. Abas disponíveis: {excel_file.sheet_names}")

# 2. Ler a aba que contém BASE PREST (pode ter nome diferente)
sheet_base = None
for sheet in excel_file.sheet_names:
    if 'BASE' in sheet.upper() or 'PREST' in sheet.upper():
        sheet_base = sheet
        break

if sheet_base:
    print(f"\n2. Estrutura da aba '{sheet_base}':")
    df_base = pd.read_excel(CONTROLE_FILE, sheet_name=sheet_base)
    print(f"   Dimensões: {df_base.shape}")
    print(f"   Colunas: {list(df_base.columns)}")
else:
    print("\n2. Nenhuma aba com 'BASE' ou 'PREST' encontrada")
    sheet_base = excel_file.sheet_names[0]
    df_base = pd.read_excel(CONTROLE_FILE, sheet_name=sheet_base)
    print(f"   Usando primeira aba '{sheet_base}': {df_base.shape}")

# 3. Verificar as colunas e amostra de dados
print("\n3. Amostra de dados:")
if len(df_base.columns) > 0:
    amostra = df_base.head(20)
    for idx, row in amostra.iterrows():
        print(f"   {idx}: {dict(row)}")

# 4. Verificar se há coluna MÊS
print("\n4. Verificando coluna MÊS:")
if 'MÊS' in df_base.columns:
    print(f"   Valores únicos em MÊS: {df_base['MÊS'].unique()}")
    print(f"   Distribuição por MÊS:")
    print(df_base['MÊS'].value_counts())
else:
    print("   Coluna MÊS não encontrada")

# 5. Verificar a aba QUINZENAS
print("\n5. Estrutura da aba QUINZENAS:")
if 'QUINZENAS' in excel_file.sheet_names:
    df_qz = pd.read_excel(CONTROLE_FILE, sheet_name='QUINZENAS', header=3)
    print(f"   Dimensões: {df_qz.shape}")
    print(f"   Colunas: {list(df_qz.columns)}")
    
    # Mostrar amostra
    print("\n   Amostra da QUINZENAS:")
    amostra_qz = df_qz.head(10)
    for _, row in amostra_qz.iterrows():
        print(f"   {dict(row)}")

# 6. Verificar a aba PAINEL
print("\n6. Estrutura da aba PAINEL:")
if 'PAINEL' in excel_file.sheet_names:
    df_painel = pd.read_excel(CONTROLE_FILE, sheet_name='PAINEL')
    print(f"   Dimensões: {df_painel.shape}")
    print(f"   Colunas: {list(df_painel.columns)}")
    
    # Mostrar amostra
    print("\n   Amostra do PAINEL:")
    amostra_painel = df_painel.head(5)
    for _, row in amostra_painel.iterrows():
        print(f"   {dict(row)}")

print("=" * 80)
