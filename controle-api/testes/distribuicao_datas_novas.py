#!/usr/bin/env python3
"""
Verifica a distribuição por mês das linhas novas/removidas entre 1ª e 2ª QZ.
Objetivo: descobrir qual é o critério que determina quais expenses entram na BASE PREST.
"""
import pandas as pd
import warnings
from pathlib import Path
from datetime import datetime

warnings.filterwarnings("ignore")
BASE = Path(__file__).parent.parent
EXCEL_BASE = datetime(1899, 12, 30)


def excel_date(val):
    try:
        if isinstance(val, (int, float)) and not pd.isna(val):
            return (EXCEL_BASE + pd.Timedelta(days=int(val))).strftime("%Y-%m-%d")
        if hasattr(val, "strftime"):
            return val.strftime("%Y-%m-%d")
        return str(val)[:10]
    except Exception:
        return str(val)


def load_bp(fname):
    f = BASE / "data" / fname
    df = pd.read_excel(f, sheet_name="BASE PREST ", header=2)
    df.columns = [f"col{i}" for i in range(len(df.columns))]
    df["id_despesa"] = pd.to_numeric(df["col0"], errors="coerce")
    df["id_relatorio"] = pd.to_numeric(df["col1"], errors="coerce")
    df["data_expense"] = df["col3"].apply(excel_date)    # Data da despesa
    df["data_pagto"] = df["col11"].apply(excel_date)     # Data de Pagamento
    df["cpf"] = df["col9"].astype(str).str.strip().str.zfill(11)
    df["valor"] = pd.to_numeric(df["col26"], errors="coerce").fillna(0)
    return df[["id_despesa", "id_relatorio", "data_expense", "data_pagto", "cpf", "valor"]].dropna(subset=["id_despesa"])


print("Carregando BASE PREST...")
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
print(f"Delta SOMASE:    R$ 486,648.70")

# Distribuicao por ANO-MES das datas de EXPENSE das linhas novas
print("\n" + "=" * 60)
print("Distribuicao por ANO-MES das DESPESAS NOVAS (data expense)")
print("=" * 60)
df_novos["anoMes"] = df_novos["data_expense"].str[:7]
dist = df_novos.groupby("anoMes").agg(qtd=("valor", "count"), total=("valor", "sum"))
for anoMes, row in dist.iterrows():
    print(f"  {anoMes}: {int(row['qtd']):5d} despesas | R$ {row['total']:>12,.2f}")

# Distribuicao por ANO-MES das datas de PAGAMENTO das linhas novas
print("\n" + "=" * 60)
print("Distribuicao por ANO-MES das DESPESAS NOVAS (data PAGAMENTO)")
print("=" * 60)
df_novos["anoMesPagto"] = df_novos["data_pagto"].str[:7]
dist2 = df_novos.groupby("anoMesPagto").agg(qtd=("valor", "count"), total=("valor", "sum"))
for anoMes, row in dist2.iterrows():
    print(f"  {anoMes}: {int(row['qtd']):5d} despesas | R$ {row['total']:>12,.2f}")

# Distribuicao das linhas REMOVIDAS
print("\n" + "=" * 60)
print("Distribuicao por ANO-MES das DESPESAS REMOVIDAS (data expense)")
print("=" * 60)
df_removidos["anoMes"] = df_removidos["data_expense"].str[:7]
dist3 = df_removidos.groupby("anoMes").agg(qtd=("valor", "count"), total=("valor", "sum"))
for anoMes, row in dist3.iterrows():
    print(f"  {anoMes}: {int(row['qtd']):5d} despesas | R$ {row['total']:>12,.2f}")

print("\n" + "=" * 60)
print("Distribuicao por ANO-MES das DESPESAS REMOVIDAS (data PAGAMENTO)")
print("=" * 60)
df_removidos["anoMesPagto"] = df_removidos["data_pagto"].str[:7]
dist4 = df_removidos.groupby("anoMesPagto").agg(qtd=("valor", "count"), total=("valor", "sum"))
for anoMes, row in dist4.iterrows():
    print(f"  {anoMes}: {int(row['qtd']):5d} despesas | R$ {row['total']:>12,.2f}")
