#!/usr/bin/env python3
"""Checa o valor raw da col3 (Data) para as linhas novas com data 1970-01."""
import pandas as pd
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
BASE = Path(__file__).parent.parent


def load_bp_raw(fname):
    f = BASE / "data" / fname
    df = pd.read_excel(f, sheet_name="BASE PREST ", header=2)
    df.columns = [f"col{i}" for i in range(len(df.columns))]
    df["id_despesa"] = pd.to_numeric(df["col0"], errors="coerce")
    df["valor"] = pd.to_numeric(df["col26"], errors="coerce").fillna(0)
    return df.dropna(subset=["id_despesa"])


bp_maio = load_bp_raw("CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
bp_junho = load_bp_raw("CONTROLE - VEXPENSES - JUNHO - 2026.xlsx")

ids_maio = set(bp_maio["id_despesa"].astype(int))
ids_junho = set(bp_junho["id_despesa"].astype(int))
ids_novos = ids_junho - ids_maio

df_novos = bp_junho[bp_junho["id_despesa"].astype(int).isin(ids_novos)].copy()

print(f"Total linhas novas: {len(df_novos)}")
print(f"\nTipos e amostras da col3 (Data) nas linhas novas:")
print(f"  Tipo único(s): {df_novos['col3'].dtype}")
print(f"  Valor count col3:")
vc = df_novos["col3"].value_counts(dropna=False).head(10)
for val, cnt in vc.items():
    print(f"    {repr(val)}: {cnt}")

print(f"\nAmostra de 10 linhas novas (col0=ID, col3=Data, col9=CPF, col26=Valor):")
sample = df_novos[["col0","col1","col2","col3","col9","col26"]].head(10)
for _, row in sample.iterrows():
    print(f"  ID={row['col0']} | Relat={row['col1']} | Nome={str(row['col2'])[:25]} | Data={repr(row['col3'])} | CPF={row['col9']} | Valor={row['col26']}")

# Verificar se as linhas com col3=NaN ou 0 são expenses de um tipo especial
print(f"\nDistribuicao por tipo de col3 (Data):")
print(f"  Nulos: {df_novos['col3'].isna().sum()}")
print(f"  Zero (0): {(df_novos['col3'] == 0).sum()}")
print(f"  Numerico: {pd.to_numeric(df_novos['col3'], errors='coerce').notna().sum()}")
print(f"  Texto: {(df_novos['col3'].apply(lambda x: isinstance(x, str))).sum()}")

# Qual a coluna real de data nas linhas novas?
print(f"\nVerificando outras colunas de data (col3, col11) para as linhas novas:")
sample2 = df_novos[["col0","col3","col11","col26"]].head(20)
for _, row in sample2.iterrows():
    print(f"  ID={row['col0']} | col3={repr(row['col3'])} | col11={repr(row['col11'])} | valor={row['col26']}")
