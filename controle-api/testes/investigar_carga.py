#!/usr/bin/env python3
"""
Investigar a aba CARGA para entender como ela usa PRESTAÇÃO DE CONTAS
"""
import pandas as pd
from pathlib import Path

BASE = Path(__file__).parent.parent
CARGA_FILE = BASE / "data" / "CARGA 2 QZ MAIO 26 VEXPENSES EQS (1).xlsx"

print("=" * 80)
print("  INVESTIGAÇÃO: ABA CARGA - PRESTAÇÃO DE CONTAS")
print("=" * 80)

# Verificar abas disponíveis
excel_file = pd.ExcelFile(CARGA_FILE)
print(f"\n1. Abas disponíveis: {excel_file.sheet_names}")

# Ler a aba principal
df_carga = pd.read_excel(CARGA_FILE, sheet_name=excel_file.sheet_names[0])
print(f"\n2. Dimensões: {df_carga.shape}")
print(f"   Colunas: {list(df_carga.columns)}")

# Mostrar amostra
print("\n3. Amostra de dados:")
amostra = df_carga.head(10)
for idx, row in amostra.iterrows():
    print(f"   {idx}: {dict(row)}")

# Verificar se há coluna PRESTAÇÃO DE CONTAS
print("\n4. Colunas relacionadas a PRESTAÇÃO:")
for col in df_carga.columns:
    if 'PREST' in col.upper() or 'DE CONTAS' in col.upper():
        print(f"   - {col}")

# Verificar ABNER
print("\n5. Verificando ABNER ANDRADE CAVALCANTE:")
for col in df_carga.columns:
    if 'COLABORADOR' in col.upper() or 'NOME' in col.upper():
        df_abner = df_carga[df_carga[col].astype(str).str.contains('ABNER', na=False)]
        if len(df_abner) > 0:
            print(f"   Encontrado na coluna '{col}'")
            for _, row in df_abner.iterrows():
                print(f"   {dict(row)}")
            break

print("=" * 80)
