#!/usr/bin/env python3
"""
Investigar a aba PAINEL PRESTAÇÕES para entender a fonte dos dados
"""
import pandas as pd
from pathlib import Path

BASE = Path(__file__).parent.parent
CONTROLE_FILE = BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"

print("=" * 80)
print("  INVESTIGAÇÃO: PAINEL PRESTAÇÕES")
print("=" * 80)

# Ler PAINEL PRESTAÇÕES
df_painel = pd.read_excel(CONTROLE_FILE, sheet_name='PAINEL PRESTAÇÕES')
print(f"\n1. PAINEL PRESTAÇÕES: {df_painel.shape}")
print(f"   Colunas: {list(df_painel.columns)}")

# Mostrar amostra
print("\n2. Amostra de dados:")
amostra = df_painel.head(20)
for idx, row in amostra.iterrows():
    print(f"   {idx}: {dict(row)}")

# Verificar ABNER
print("\n3. Verificando ABNER ANDRADE CAVALCANTE:")
if 'Nome do membro de equipe' in df_painel.columns:
    df_abner = df_painel[df_painel['Nome do membro de equipe'].astype(str).str.contains('ABNER', na=False)]
    print(f"   Registros encontrados: {len(df_abner)}")
    if len(df_abner) > 0:
        print(f"   Total: R$ {df_abner['Valor'].sum():,.2f}")
        print("\n   Amostra:")
        for _, row in df_abner.head(10).iterrows():
            print(f"     {dict(row)}")

# Verificar se há coluna de quinzena
print("\n4. Verificando colunas de período:")
for col in df_painel.columns:
    if 'QUINZENA' in col.upper() or 'MÊS' in col.upper() or 'DATA' in col.upper():
        print(f"   - {col}")

print("=" * 80)
