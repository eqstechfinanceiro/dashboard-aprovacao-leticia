#!/usr/bin/env python3
"""
Verifica os reports que têm expenses novos na BASE PREST do JUNHO vs MAIO.
Busca esses reports no Neon para ver qual approval_date eles têm.
Objetivo: entender qual campo temporal determina que um report entra na BASE PREST.
"""
import os
import pandas as pd
import warnings
from pathlib import Path
from dotenv import load_dotenv
import psycopg2

warnings.filterwarnings("ignore")
BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")


def load_bp(fname):
    f = BASE / "data" / fname
    df = pd.read_excel(f, sheet_name="BASE PREST ", header=2)
    df.columns = [f"col{i}" for i in range(len(df.columns))]
    df["id_despesa"] = pd.to_numeric(df["col0"], errors="coerce")
    df["id_relatorio"] = pd.to_numeric(df["col1"], errors="coerce")
    df["valor"] = pd.to_numeric(df["col26"], errors="coerce").fillna(0)
    return df.dropna(subset=["id_despesa"])


bp_maio = load_bp("CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
bp_junho = load_bp("CONTROLE - VEXPENSES - JUNHO - 2026.xlsx")

ids_maio = set(bp_maio["id_despesa"].astype(int))
ids_junho = set(bp_junho["id_despesa"].astype(int))
ids_novos = ids_junho - ids_maio

df_novos = bp_junho[bp_junho["id_despesa"].astype(int).isin(ids_novos)]
reports_novos = set(df_novos["id_relatorio"].dropna().astype(int))
print(f"Reports com pelo menos 1 expense novo no JUNHO: {len(reports_novos)}")
print(f"Total de expenses novos: {len(df_novos)} | R$ {df_novos['valor'].sum():,.2f}")

# Buscar no Neon
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur = conn.cursor()
cur.execute("""
    SELECT id, status,
           raw_data->>'created_at' as created_at,
           raw_data->>'approval_date' as approval_date,
           raw_data->>'updated_at' as updated_at
    FROM prestacao_reports
    WHERE id = ANY(%s)
""", (list(reports_novos),))
rows = cur.fetchall()
conn.close()

df_r = pd.DataFrame(rows, columns=["id", "status", "created_at", "approval_date", "updated_at"])
print(f"\nEncontrados no Neon: {len(df_r)} de {len(reports_novos)}")

status_counts = df_r["status"].value_counts()
print("Status:")
for s, c in status_counts.items():
    print(f"  {s}: {c}")

# Distribuicao por approval_date
df_r["ap_ym"] = pd.to_datetime(df_r["approval_date"], errors="coerce").dt.to_period("M").astype(str)
print("\nDistribuicao por approval_date (ANO-MES) dos reports com expenses novos:")
for ym, cnt in df_r["ap_ym"].value_counts().sort_index().items():
    print(f"  {ym}: {cnt} reports")

# Quantos nao estao no Neon
nao_no_neon = reports_novos - set(df_r["id"])
print(f"\nReports NAO no Neon: {len(nao_no_neon)}")
if nao_no_neon:
    # Esses reports estão na BASE PREST mas não foram baixados pelo script
    total_sem_neon = bp_junho[bp_junho["id_relatorio"].astype(float).astype(int).isin(nao_no_neon)]["valor"].sum()
    print(f"  Total de expenses desses reports: R$ {total_sem_neon:,.2f}")
    print(f"  IDs (amostra): {list(nao_no_neon)[:10]}")

# Qual é o total dos expenses cujos reports SÃO APROVADOS e têm approval_date entre 11-25/05
df_r_periodo = df_r[
    (df_r["status"] == "APROVADO") &
    (pd.to_datetime(df_r["approval_date"], errors="coerce") >= pd.Timestamp("2026-05-11")) &
    (pd.to_datetime(df_r["approval_date"], errors="coerce") < pd.Timestamp("2026-05-26"))
]
reports_periodo = set(df_r_periodo["id"])
df_novos_periodo = df_novos[df_novos["id_relatorio"].astype(float).astype(int).isin(reports_periodo)]
print(f"\nExpenses novos cujo report tem approval_date 11-25/05:")
print(f"  Reports: {len(reports_periodo)} | Expenses: {len(df_novos_periodo)} | R$ {df_novos_periodo['valor'].sum():,.2f}")

print(f"\nExpenses novos cujo report NÃO tem approval_date 11-25/05:")
outros = df_novos[~df_novos["id_relatorio"].astype(float).astype(int).isin(reports_periodo)]
print(f"  Expenses: {len(outros)} | R$ {outros['valor'].sum():,.2f}")
