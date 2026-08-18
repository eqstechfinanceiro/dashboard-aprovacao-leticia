#!/usr/bin/env python3
"""
Investiga os 31 CPFs com Δ divergente entre Neon e planilha.
Para cada CPF divergente, mostra:
- SOMASE MAIO planilha vs Neon
- SOMASE JUNHO planilha vs Neon
- Δ planilha vs Δ Neon
- Quais expense IDs estão na planilha mas não no Neon (e vice-versa)
"""
import os
import warnings
import pandas as pd
import psycopg2
from pathlib import Path
from dotenv import load_dotenv

warnings.filterwarnings("ignore")
BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")
TOLERANCIA = 0.10


def carregar_bp(fname):
    f = BASE / "data" / fname
    df = pd.read_excel(f, sheet_name="BASE PREST ", header=2)
    df.columns = [f"col{i}" for i in range(len(df.columns))]
    df["id_despesa"]   = pd.to_numeric(df["col0"], errors="coerce")
    df["id_relatorio"] = pd.to_numeric(df["col1"], errors="coerce")
    df["valor"]        = pd.to_numeric(df["col26"], errors="coerce").fillna(0)
    df["cpf"]          = df["col9"].astype(str).str.strip().str.zfill(11)
    return df.dropna(subset=["id_despesa"]).copy()


print("Carregando planilhas...")
df_maio  = carregar_bp("CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
df_junho = carregar_bp("CONTROLE - VEXPENSES - JUNHO - 2026.xlsx")

s_maio  = df_maio.groupby("cpf")["valor"].sum()
s_junho = df_junho.groupby("cpf")["valor"].sum()
delta_planilha = s_junho.subtract(s_maio, fill_value=0)

# IDs por CPF nas planilhas
ids_maio_por_cpf  = df_maio.groupby("cpf")["id_despesa"].apply(set)
ids_junho_por_cpf = df_junho.groupby("cpf")["id_despesa"].apply(set)

# Neon
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur  = conn.cursor()

ids_junho_list = df_junho["id_despesa"].dropna().astype(int).tolist()
ids_maio_list  = df_maio["id_despesa"].dropna().astype(int).tolist()

cur.execute("""
    SELECT e.id, COALESCE(r.user_cpf,''), e.value
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON r.id = e.report_id
    WHERE e.id = ANY(%s)
""", (ids_junho_list,))
neon_junho_raw = pd.DataFrame(cur.fetchall(), columns=["id","cpf","value"])
neon_junho_raw["cpf"] = neon_junho_raw["cpf"].astype(str).str.strip().str.zfill(11)
neon_junho_raw["value"] = neon_junho_raw["value"].apply(float)

cur.execute("""
    SELECT e.id, COALESCE(r.user_cpf,''), e.value
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON r.id = e.report_id
    WHERE e.id = ANY(%s)
""", (ids_maio_list,))
neon_maio_raw = pd.DataFrame(cur.fetchall(), columns=["id","cpf","value"])
neon_maio_raw["cpf"] = neon_maio_raw["cpf"].astype(str).str.strip().str.zfill(11)
neon_maio_raw["value"] = neon_maio_raw["value"].apply(float)
conn.close()

neon_junho = neon_junho_raw.groupby("cpf")["value"].sum()
neon_maio  = neon_maio_raw.groupby("cpf")["value"].sum()
delta_neon = neon_junho.subtract(neon_maio, fill_value=0)

# Identificar divergentes no Δ
df_delta = pd.DataFrame({
    "delta_plan": delta_planilha,
    "delta_neon": delta_neon,
}).fillna(0)
df_delta["diff"] = (df_delta["delta_neon"] - df_delta["delta_plan"]).round(2)
df_delta["abs"]  = df_delta["diff"].abs()
divs = df_delta[df_delta["abs"] > TOLERANCIA].sort_values("abs", ascending=False)

print(f"\nTotal CPFs divergentes no Δ: {len(divs)}\n")
print(f"{'CPF':<14} {'Δplan':>12} {'Δneon':>12} {'diff':>10} | "
      f"{'maio_plan':>10} {'maio_neon':>10} {'jun_plan':>10} {'jun_neon':>10}")
print("-" * 100)
for cpf, row in divs.iterrows():
    mp = float(s_maio.get(cpf, 0))
    mn = float(neon_maio.get(cpf, 0))
    jp = float(s_junho.get(cpf, 0))
    jn = float(neon_junho.get(cpf, 0))
    print(f"{cpf:<14} {row['delta_plan']:>12,.2f} {row['delta_neon']:>12,.2f} {row['diff']:>+10,.2f} | "
          f"{mp:>10,.2f} {mn:>10,.2f} {jp:>10,.2f} {jn:>10,.2f}")

# Para os top 5 divergentes, mostrar quais IDs estão na planilha mas não no Neon
print(f"\n\n=== DETALHAMENTO POR EXPENSE ID (top 5 divergentes) ===")
ids_neon_junho = set(neon_junho_raw["id"].astype(int))
ids_neon_maio  = set(neon_maio_raw["id"].astype(int))

for cpf, row in divs.head(5).iterrows():
    print(f"\nCPF {cpf} | Δ diff = R$ {row['diff']:+,.2f}")

    # IDs da planilha JUNHO para este CPF
    ids_jp = set(df_junho[df_junho["cpf"]==cpf]["id_despesa"].astype(int))
    # IDs da planilha MAIO para este CPF
    ids_mp = set(df_maio[df_maio["cpf"]==cpf]["id_despesa"].astype(int))

    so_plan_jun = ids_jp - ids_neon_junho
    so_plan_mai = ids_mp - ids_neon_maio
    cpf_neon_jun_ids = set(neon_junho_raw[neon_junho_raw["cpf"]==cpf]["id"].astype(int))
    cpf_neon_mai_ids = set(neon_maio_raw[neon_maio_raw["cpf"]==cpf]["id"].astype(int))
    so_neon_jun = cpf_neon_jun_ids - ids_jp
    so_neon_mai = cpf_neon_mai_ids - ids_mp

    if so_plan_jun:
        vals = df_junho[df_junho["id_despesa"].isin(so_plan_jun)]["valor"].sum()
        print(f"  IDs na planilha JUNHO mas NÃO no Neon: {len(so_plan_jun)} | R$ {vals:,.2f}")
        for eid in list(so_plan_jun)[:5]:
            v = float(df_junho[df_junho["id_despesa"]==eid]["valor"].iloc[0])
            print(f"    id={eid} valor={v:.2f}")
    if so_plan_mai:
        vals = df_maio[df_maio["id_despesa"].isin(so_plan_mai)]["valor"].sum()
        print(f"  IDs na planilha MAIO mas NÃO no Neon:  {len(so_plan_mai)} | R$ {vals:,.2f}")
        for eid in list(so_plan_mai)[:5]:
            v = float(df_maio[df_maio["id_despesa"]==eid]["valor"].iloc[0])
            print(f"    id={eid} valor={v:.2f}")
    if so_neon_jun:
        vals = neon_junho_raw[neon_junho_raw["id"].isin(so_neon_jun)]["value"].sum()
        print(f"  IDs no Neon JUNHO mas NÃO na planilha: {len(so_neon_jun)} | R$ {vals:,.2f}")
    if so_neon_mai:
        vals = neon_maio_raw[neon_maio_raw["id"].isin(so_neon_mai)]["value"].sum()
        print(f"  IDs no Neon MAIO mas NÃO na planilha:  {len(so_neon_mai)} | R$ {vals:,.2f}")
    if not any([so_plan_jun, so_plan_mai, so_neon_jun, so_neon_mai]):
        # CPF mapeado diferente entre Neon e planilha
        print(f"  IDs batem, mas CPF difere no Neon para esses expenses!")
        sample = df_junho[df_junho["cpf"]==cpf].head(3)
        for _, r in sample.iterrows():
            neon_row = neon_junho_raw[neon_junho_raw["id"]==int(r["id_despesa"])]
            neon_cpf = neon_row["cpf"].iloc[0] if len(neon_row) else "NÃO ENCONTRADO"
            print(f"    id={int(r['id_despesa'])} planilha_cpf={cpf} neon_cpf={neon_cpf}")
