#!/usr/bin/env python3
"""
Investigar o arquivo CONTROLE - MAIO 2026 para encontrar BASE PREST e entender a fórmula
"""
import pandas as pd
from pathlib import Path

BASE = Path(__file__).parent.parent
CONTROLE_FILE = BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"

print("=" * 80)
print("  INVESTIGAÇÃO: CONTROLE MAIO 2026 - BASE PREST")
print("=" * 80)

# 1. Verificar todas as abas
excel_file = pd.ExcelFile(CONTROLE_FILE)
print(f"\n1. Abas disponíveis: {excel_file.sheet_names}")

# 2. Procurar aba com BASE PREST
sheet_base = None
for sheet in excel_file.sheet_names:
    print(f"   - {sheet}")
    if 'BASE' in sheet.upper() or 'PREST' in sheet.upper():
        sheet_base = sheet
        print(f"     → ABA BASE PREST ENCONTRADA: {sheet_base}")

if not sheet_base:
    print("\n   Nenhuma aba com 'BASE' ou 'PREST' encontrada")
    print("   Vou verificar cada aba para encontrar a BASE PREST")
    
    for sheet in excel_file.sheet_names:
        print(f"\n   Verificando aba '{sheet}':")
        df = pd.read_excel(CONTROLE_FILE, sheet_name=sheet, nrows=5)
        print(f"      Colunas: {list(df.columns)}")
        if 'ID da Despesa' in df.columns or 'ID do Relatório' in df.columns:
            sheet_base = sheet
            print(f"      → ABA BASE PREST ENCONTRADA: {sheet_base}")
            break

if sheet_base:
    print(f"\n2. Lendo aba '{sheet_base}' (BASE PREST):")
    df_base = pd.read_excel(CONTROLE_FILE, sheet_name=sheet_base)
    print(f"   Dimensões: {df_base.shape}")
    print(f"   Colunas: {list(df_base.columns)}")
    
    # 3. Verificar se há coluna MÊS
    print("\n3. Verificando coluna MÊS:")
    if 'MÊS' in df_base.columns:
        print(f"   Valores únicos em MÊS: {df_base['MÊS'].unique()}")
        print(f"   Distribuição por MÊS:")
        print(df_base['MÊS'].value_counts())
    else:
        print("   Coluna MÊS não encontrada")
        # Mostrar colunas que podem ser usadas para filtro de período
        print("   Colunas disponíveis para filtro de período:")
        for col in df_base.columns:
            if 'DATA' in col.upper() or 'MÊS' in col.upper() or 'ANO' in col.upper():
                print(f"      - {col}")
    
    # 4. Amostra de dados
    print("\n4. Amostra de dados (primeiras 10 linhas):")
    amostra = df_base.head(10)
    for idx, row in amostra.iterrows():
        print(f"   {idx}: {dict(row)}")
    
    # 5. Verificar colunas J e AA (índices)
    print("\n5. Colunas por índice (J=10ª coluna, AA=27ª coluna):")
    if len(df_base.columns) >= 27:
        print(f"   Coluna J (índice 9): {df_base.columns[9]}")
        print(f"   Coluna AA (índice 26): {df_base.columns[26]}")
    else:
        print(f"   Total de colunas: {len(df_base.columns)}")
        print(f"   Colunas disponíveis: {list(df_base.columns)}")

print("=" * 80)
