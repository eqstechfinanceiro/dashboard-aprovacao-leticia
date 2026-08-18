#!/usr/bin/env python3
"""
Investigar a estrutura da aba PAINEL do CONTROLE para entender PRESTAÇÃO DE CONTAS
"""
import pandas as pd
from pathlib import Path

BASE = Path(__file__).parent.parent
CONTROLE_MAIO = BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"

print("=" * 80)
print("  PAINEL DO CONTROLE MAIO 2026 - ESTRUTURA")
print("=" * 80)

# Verificar as primeiras linhas sem header para ver a estrutura
df_raw = pd.read_excel(CONTROLE_MAIO, sheet_name='PAINEL', header=None, nrows=15)
print("\nPrimeiras 15 linhas (raw):")
for i, row in df_raw.iterrows():
    vals = [v for v in row if not (isinstance(v, float) and str(v) == 'nan')]
    print(f"  Linha {i}: {vals[:10]}")

# Tentar ler com header correto
print("\n\nTentando header=4:")
try:
    df = pd.read_excel(CONTROLE_MAIO, sheet_name='PAINEL', header=4)
    print(f"Dimensões: {df.shape}")
    print(f"Colunas: {list(df.columns)}")
    
    # Procurar coluna PRESTAÇÃO
    for col in df.columns:
        if 'PREST' in str(col).upper():
            print(f"\nColuna PRESTAÇÃO encontrada: '{col}'")
            # Mostrar amostra
            df2 = df[['COLABORADOR', 'CPF', col]].dropna(subset=['COLABORADOR'])
            print(df2.head(10).to_string(index=False))
except Exception as e:
    print(f"Erro: {e}")
