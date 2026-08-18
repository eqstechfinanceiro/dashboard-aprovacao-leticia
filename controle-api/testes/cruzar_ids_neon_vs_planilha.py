"""
Cruza os IDs de despesa entre Neon e BASE PREST da planilha JUNHO.
Objetivo: entender QUAIS expenses do Neon estão na planilha e quais não estão,
para descobrir o critério exato que determina o que entra na BASE PREST.
"""
import os, warnings
import pandas as pd
import psycopg2
from pathlib import Path
from dotenv import load_dotenv

warnings.filterwarnings("ignore")
BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")

PLANILHA = BASE / "data" / "CONTROLE - VEXPENSES - JUNHO - 2026.xlsx"

# 1. IDs da planilha
print("Carregando BASE PREST...")
df_bp = pd.read_excel(PLANILHA, sheet_name="BASE PREST ", header=2)
df_bp.columns = [f"col{i}" for i in range(len(df_bp.columns))]
df_bp["id_despesa"]  = pd.to_numeric(df_bp["col0"], errors="coerce")
df_bp["id_relatorio"] = pd.to_numeric(df_bp["col1"], errors="coerce")
df_bp["valor"]       = pd.to_numeric(df_bp["col26"], errors="coerce").fillna(0)
df_bp = df_bp.dropna(subset=["id_despesa"])
df_bp["id_despesa"] = df_bp["id_despesa"].astype(int)
ids_planilha = set(df_bp["id_despesa"])
print(f"  Expenses na planilha: {len(ids_planilha):,}  | R$ {df_bp['valor'].sum():,.2f}")

# 2. IDs do Neon
print("Consultando Neon...")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur = conn.cursor()
cur.execute("""
    SELECT e.id, e.report_id, e.value,
           r.user_cpf,
           r.status,
           (r.raw_data->>'approval_date')::date as approval_date
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON r.id = e.report_id
""")
rows = cur.fetchall()
conn.close()

df_neon = pd.DataFrame(rows, columns=["id","report_id","value","cpf","status","approval_date"])
df_neon["value"] = df_neon["value"].apply(float)
ids_neon = set(df_neon["id"])
print(f"  Expenses no Neon:     {len(ids_neon):,}  | R$ {df_neon['value'].sum():,.2f}")

# 3. Cruzamento
na_planilha_e_neon = ids_planilha & ids_neon
so_na_planilha     = ids_planilha - ids_neon
so_no_neon         = ids_neon - ids_planilha

print(f"\n  Em ambos (planilha ∩ Neon):  {len(na_planilha_e_neon):,}")
print(f"  Só na planilha (sem Neon):   {len(so_na_planilha):,}")
print(f"  Só no Neon (sem planilha):   {len(so_no_neon):,}")

# Valor dos que estão em ambos vs só no Neon
df_neon["em_planilha"] = df_neon["id"].isin(ids_planilha)
em_ambos   = df_neon[df_neon["em_planilha"]]
so_neon    = df_neon[~df_neon["em_planilha"]]

print(f"\n  Valor dos expenses EM AMBOS:  R$ {em_ambos['value'].sum():,.2f}")
print(f"  Valor dos SÓ NO NEON:         R$ {so_neon['value'].sum():,.2f}")

# Status dos reports dos expenses SÓ NO NEON
print(f"\n  Status dos reports (expenses só no Neon):")
for s, cnt in so_neon["status"].value_counts().items():
    val = so_neon[so_neon["status"]==s]["value"].sum()
    print(f"    {s:<12}: {cnt:>6} expenses | R$ {val:>12,.2f}")

# Distribuição por approval_date dos SÓ NO NEON (aprovados)
so_neon_aprov = so_neon[so_neon["status"] == "APROVADO"].copy()
so_neon_aprov["ap_ym"] = pd.to_datetime(so_neon_aprov["approval_date"], errors="coerce").dt.to_period("M").astype(str)
print(f"\n  Approval_date dos APROVADOS só no Neon ({len(so_neon_aprov):,} expenses, R$ {so_neon_aprov['value'].sum():,.2f}):")
for ym, g in so_neon_aprov.groupby("ap_ym"):
    print(f"    {ym}: {len(g):>5} expenses | R$ {g['value'].sum():>10,.2f}")
