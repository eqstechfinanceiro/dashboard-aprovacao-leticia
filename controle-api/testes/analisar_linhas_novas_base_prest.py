#!/usr/bin/env python3
"""
Analisa as 5.702 linhas novas da BASE PREST do JUNHO vs MAIO.
Objetivo: descobrir qual critério determina quais expenses entram na BASE PREST
de cada quinzena (data da despesa? data de aprovacao? data de pagamento?).
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
        if isinstance(val, str):
            return val[:10]
        return str(val)[:10]
    except Exception:
        return str(val)


def load_base_prest(fname):
    f = BASE / "data" / fname
    df = pd.read_excel(f, sheet_name="BASE PREST ", header=2)
    df.columns = [f"col{i}" for i in range(len(df.columns))]
    # col0=ID Despesa, col1=ID Relatório, col2=Nome Relatório, col3=Data, col9=CPF, col26=Valor
    df["id_despesa"] = pd.to_numeric(df["col0"], errors="coerce")
    df["id_relatorio"] = pd.to_numeric(df["col1"], errors="coerce")
    df["nome_relatorio"] = df["col2"].astype(str)
    df["data_raw"] = df["col3"]
    df["cpf"] = df["col9"].astype(str).str.strip().str.zfill(11)
    df["valor"] = pd.to_numeric(df["col26"], errors="coerce").fillna(0)
    df["data_pagto_raw"] = df["col11"]  # Data de Pagamento
    return df[["id_despesa", "id_relatorio", "nome_relatorio", "data_raw", "data_pagto_raw", "cpf", "valor"]].dropna(subset=["id_despesa"])


print("Carregando BASE PREST MAIO (1ª QZ)...")
bp_maio = load_base_prest("CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
print(f"  {len(bp_maio)} linhas | IDs únicos: {bp_maio['id_despesa'].nunique()}")

print("Carregando BASE PREST JUNHO (2ª QZ)...")
bp_junho = load_base_prest("CONTROLE - VEXPENSES - JUNHO - 2026.xlsx")
print(f"  {len(bp_junho)} linhas | IDs únicos: {bp_junho['id_despesa'].nunique()}")

# Linhas novas = id_despesa que está no JUNHO mas não no MAIO
ids_maio = set(bp_maio["id_despesa"].dropna().astype(int))
ids_junho = set(bp_junho["id_despesa"].dropna().astype(int))

ids_novos = ids_junho - ids_maio
ids_removidos = ids_maio - ids_junho

print(f"\nIDs novos no JUNHO (não estavam no MAIO): {len(ids_novos)}")
print(f"IDs removidos do MAIO (não estão no JUNHO): {len(ids_removidos)}")

# Analisar as linhas novas
df_novos = bp_junho[bp_junho["id_despesa"].astype(int).isin(ids_novos)].copy()
print(f"\n{len(df_novos)} linhas novas no JUNHO:")

# Converter datas
df_novos["data"] = df_novos["data_raw"].apply(excel_date)
df_novos["data_pagto"] = df_novos["data_pagto_raw"].apply(excel_date)

print("\nDistribuição das datas das despesas (linhas novas):")
data_counts = df_novos["data"].str[:7].value_counts().sort_index()
for mes, cnt in data_counts.items():
    print(f"  {mes}: {cnt} despesas")

print("\nTotal das linhas novas por mês:")
df_novos["mes"] = df_novos["data"].str[:7]
totais_mes = df_novos.groupby("mes")["valor"].sum()
for mes, total in totais_mes.sort_index().items():
    print(f"  {mes}: R$ {total:,.2f}")

print(f"\nTotal geral das linhas novas: R$ {df_novos['valor'].sum():,.2f}")

# Verificar datas de pagamento das linhas novas
print("\nDistribuição das datas de PAGAMENTO (linhas novas):")
pagto_counts = df_novos["data_pagto"].str[:7].value_counts().sort_index()
for mes, cnt in pagto_counts.items():
    print(f"  {mes}: {cnt}")

# Analisar linhas removidas
if ids_removidos:
    df_removidos = bp_maio[bp_maio["id_despesa"].astype(int).isin(ids_removidos)].copy()
    df_removidos["data"] = df_removidos["data_raw"].apply(excel_date)
    print(f"\n{len(df_removidos)} linhas REMOVIDAS do MAIO:")
    print(f"  Total removido: R$ {df_removidos['valor'].sum():,.2f}")
    data_rem = df_removidos["data"].str[:7].value_counts().sort_index()
    for mes, cnt in data_rem.items():
        print(f"  {mes}: {cnt} despesas | R$ {df_removidos[df_removidos['data'].str[:7]==mes]['valor'].sum():,.2f}")

print("\n" + "=" * 60)
print("RESUMO:")
print(f"  Linhas novas:    {len(df_novos)} | R$ {df_novos['valor'].sum():,.2f}")
if ids_removidos:
    print(f"  Linhas removidas:{len(df_removidos)} | R$ {df_removidos['valor'].sum():,.2f}")
    print(f"  Delta liquido:   R$ {df_novos['valor'].sum() - df_removidos['valor'].sum():,.2f}")
print(f"  Delta SOMASE:    R$ 486,648.70")
