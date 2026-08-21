#!/usr/bin/env python3
"""Verifica as datas por ANO-MES das linhas novas entre MAIO e JUNHO."""
import pandas as pd
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
BASE = Path(__file__).parent.parent


def load_bp(fname):
    f = BASE / "data" / fname
    df = pd.read_excel(f, sheet_name="BASE PREST ", header=2)
    df.columns = [f"col{i}" for i in range(len(df.columns))]
    df["id_despesa"] = pd.to_numeric(df["col0"], errors="coerce")
    # col3 = Data — pandas lê como datetime automaticamente
    df["data_expense"] = pd.to_datetime(df["col3"], errors="coerce")
    df["data_pagto"] = pd.to_datetime(df["col11"], errors="coerce")
    df["cpf"] = df["col9"].astype(str).str.strip().str.zfill(11)
    df["valor"] = pd.to_numeric(df["col26"], errors="coerce").fillna(0)
    return df[["id_despesa", "data_expense", "data_pagto", "cpf", "valor"]].dropna(subset=["id_despesa"])


bp_maio = load_bp("CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
bp_junho = load_bp("CONTROLE - VEXPENSES - JUNHO - 2026.xlsx")

ids_maio = set(bp_maio["id_despesa"].astype(int))
ids_junho = set(bp_junho["id_despesa"].astype(int))
ids_novos = ids_junho - ids_maio
ids_removidos = ids_maio - ids_junho

df_novos = bp_junho[bp_junho["id_despesa"].astype(int).isin(ids_novos)].copy()
df_removidos = bp_maio[bp_maio["id_despesa"].astype(int).isin(ids_removidos)].copy()

print(f"Linhas novas:    {len(df_novos):,} | Total: R$ {df_novos['valor'].sum():,.2f}")
print(f"Linhas removidas:{len(df_removidos):,} | Total: R$ {df_removidos['valor'].sum():,.2f}")
print(f"Delta liquido:   R$ {df_novos['valor'].sum() - df_removidos['valor'].sum():,.2f}")

# Distribuicao por ANO-MES das datas de despesa
print("\n=== DESPESAS NOVAS — por data da despesa (YearMonth) ===")
df_novos["ym"] = df_novos["data_expense"].dt.to_period("M").astype(str)
g = df_novos.groupby("ym").agg(qtd=("valor", "count"), total=("valor", "sum"))
for ym, row in g.iterrows():
    print(f"  {ym}: {int(row['qtd']):5d} | R$ {row['total']:>12,.2f}")

print("\n=== DESPESAS REMOVIDAS — por data da despesa (YearMonth) ===")
df_removidos["ym"] = df_removidos["data_expense"].dt.to_period("M").astype(str)
g2 = df_removidos.groupby("ym").agg(qtd=("valor", "count"), total=("valor", "sum"))
for ym, row in g2.iterrows():
    print(f"  {ym}: {int(row['qtd']):5d} | R$ {row['total']:>12,.2f}")
