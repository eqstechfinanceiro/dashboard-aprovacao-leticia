#!/usr/bin/env python3
"""
Analisa a BASE PREST de ambas as planilhas:
- Mapear colunas (qual é CPF, qual é valor/AA)
- Calcular SOMASE por CPF (replica a formula da planilha)
- Comparar total com o PAINEL
- Verificar o que mudou entre 1ª e 2ª QZ (delta real da BASE PREST)
"""
import pandas as pd
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
BASE = Path(__file__).parent.parent

def load_base_prest(fname):
    f = BASE / "data" / fname
    # Header na linha 2 (índice 2)
    df = pd.read_excel(f, sheet_name="BASE PREST ", header=2)
    print(f"\n{fname[:45]}")
    print(f"  Colunas totais: {len(df.columns)}")
    print(f"  Linhas: {len(df)}")
    # Mostrar colunas com índice
    for i, c in enumerate(df.columns):
        print(f"    [{i:3d}] {c!r}")
    return df

print("=" * 70)
print("  MAPEAMENTO DA BASE PREST")
print("=" * 70)

df_maio = load_base_prest("CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
df_junho = load_base_prest("CONTROLE - VEXPENSES - JUNHO - 2026.xlsx")
