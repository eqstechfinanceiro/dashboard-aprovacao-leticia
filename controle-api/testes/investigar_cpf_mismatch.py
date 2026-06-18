#!/usr/bin/env python3
"""
Para os CPFs divergentes onde os IDs existem no Neon mas o valor total difere,
verifica se os expenses da planilha JUNHO estão atribuídos a CPF diferente no Neon.
"""
import os, warnings
import pandas as pd
import psycopg2
from pathlib import Path
from dotenv import load_dotenv

warnings.filterwarnings("ignore")
BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")

# CPFs top divergentes
CPF_ALVO = [
    "02013700008", "11897381638", "91688205004",
    "95417400068", "03032275326", "48210811053",
]

df_junho = pd.read_excel(
    BASE / "data" / "CONTROLE - VEXPENSES - JUNHO - 2026.xlsx",
    sheet_name="BASE PREST ", header=2
)
df_junho.columns = [f"col{i}" for i in range(len(df_junho.columns))]
df_junho["id_despesa"] = pd.to_numeric(df_junho["col0"], errors="coerce")
df_junho["valor"]      = pd.to_numeric(df_junho["col26"], errors="coerce").fillna(0)
df_junho["cpf"]        = df_junho["col9"].astype(str).str.strip().str.zfill(11)

df_maio = pd.read_excel(
    BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx",
    sheet_name="BASE PREST ", header=2
)
df_maio.columns = [f"col{i}" for i in range(len(df_maio.columns))]
df_maio["id_despesa"] = pd.to_numeric(df_maio["col0"], errors="coerce")
df_maio["valor"]      = pd.to_numeric(df_maio["col26"], errors="coerce").fillna(0)
df_maio["cpf"]        = df_maio["col9"].astype(str).str.strip().str.zfill(11)

conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur  = conn.cursor()

for cpf in CPF_ALVO:
    ids_jun = df_junho[df_junho["cpf"]==cpf]["id_despesa"].dropna().astype(int).tolist()
    ids_mai = df_maio[df_maio["cpf"]==cpf]["id_despesa"].dropna().astype(int).tolist()

    # Buscar esses IDs no Neon e ver qual CPF está registrado
    cur.execute("""
        SELECT e.id, e.value, COALESCE(r.user_cpf,'?') as neon_cpf, r.id as report_id
        FROM prestacao_expenses e
        JOIN prestacao_reports r ON r.id = e.report_id
        WHERE e.id = ANY(%s)
        ORDER BY e.id
    """, (ids_jun + ids_mai,))
    rows = cur.fetchall()

    df_check = pd.DataFrame(rows, columns=["id","value","neon_cpf","report_id"])
    df_check["value"] = df_check["value"].apply(float)
    df_check["neon_cpf"] = df_check["neon_cpf"].astype(str).str.strip().str.zfill(11)

    cpf_mismatch = df_check[df_check["neon_cpf"] != cpf]

    plan_jun_total = df_junho[df_junho["cpf"]==cpf]["valor"].sum()
    plan_mai_total = df_maio[df_maio["cpf"]==cpf]["valor"].sum()
    neon_jun_ids   = set(df_check[df_check["id"].isin(ids_jun)]["id"])
    neon_jun_total = df_check[df_check["id"].isin(ids_jun)]["value"].sum()
    neon_mai_total = df_check[df_check["id"].isin(ids_mai)]["value"].sum()

    print(f"\nCPF {cpf}")
    print(f"  JUNHO: planilha={plan_jun_total:,.2f}  neon={neon_jun_total:,.2f}  diff={neon_jun_total-plan_jun_total:+,.2f}")
    print(f"  MAIO:  planilha={plan_mai_total:,.2f}  neon={neon_mai_total:,.2f}  diff={neon_mai_total-plan_mai_total:+,.2f}")

    if len(cpf_mismatch) > 0:
        print(f"  MISMATCH CPF: {len(cpf_mismatch)} expenses com CPF diferente no Neon:")
        for _, r in cpf_mismatch.iterrows():
            src = "JUN" if r["id"] in ids_jun else "MAI"
            print(f"    [{src}] id={r['id']} val={float(r['value']):.2f}  neon_cpf={r['neon_cpf']}  report={r['report_id']}")
    else:
        # IDs na planilha que não existem no Neon
        ids_neon = set(df_check["id"].astype(int))
        faltam_jun = [i for i in ids_jun if i not in ids_neon]
        faltam_mai = [i for i in ids_mai if i not in ids_neon]
        if faltam_jun:
            vals = df_junho[df_junho["id_despesa"].isin(faltam_jun)]["valor"].sum()
            print(f"  IDs faltando no Neon (JUNHO): {len(faltam_jun)} | R$ {vals:,.2f}")
            for eid in faltam_jun[:5]:
                v = float(df_junho[df_junho["id_despesa"]==eid]["valor"].iloc[0])
                print(f"    id={eid} val={v:.2f}")
        if faltam_mai:
            vals = df_maio[df_maio["id_despesa"].isin(faltam_mai)]["valor"].sum()
            print(f"  IDs faltando no Neon (MAIO):  {len(faltam_mai)} | R$ {vals:,.2f}")
        if not faltam_jun and not faltam_mai:
            print(f"  IDs todos presentes. Verificar valor individual:")
            # Comparar valor por ID
            for eid in ids_jun[:5]:
                plan_v = float(df_junho[df_junho["id_despesa"]==eid]["valor"].iloc[0]) if eid in ids_jun else 0
                neon_v = float(df_check[df_check["id"]==eid]["value"].iloc[0]) if eid in set(df_check["id"]) else 0
                if abs(plan_v - neon_v) > 0.01:
                    print(f"    id={eid} plan={plan_v:.2f} neon={neon_v:.2f} diff={neon_v-plan_v:+.2f}")

conn.close()
