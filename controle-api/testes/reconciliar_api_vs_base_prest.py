#!/usr/bin/env python3
"""
Reconcilia os expenses do Neon (approval_date 11-25/05) com as linhas
NOVAS da BASE PREST do JUNHO vs MAIO.

Objetivo: descobrir por que Δ_API (R$1.181.027) != Δ_real (R$486.649).

Hipótese A: reports com approval_date 11-25/05 têm expenses que já estavam
            na BASE PREST da 1ªQZ (portanto não são "novos").
Hipótese B: reports com approval_date 11-25/05 não aparecem na BASE PREST
            (aprovação não reflete na BASE PREST imediatamente).
"""
import os
import pandas as pd
import warnings
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
from datetime import date

warnings.filterwarnings("ignore")
BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")
EXCEL_EPOCH = date(1899, 12, 30)


def load_bp_ids(fname):
    """Retorna set de (id_despesa, id_relatorio, valor) da BASE PREST."""
    f = BASE / "data" / fname
    df = pd.read_excel(f, sheet_name="BASE PREST ", header=2)
    df.columns = [f"col{i}" for i in range(len(df.columns))]
    df["id_despesa"] = pd.to_numeric(df["col0"], errors="coerce")
    df["id_relatorio"] = pd.to_numeric(df["col1"], errors="coerce")
    df["valor"] = pd.to_numeric(df["col26"], errors="coerce").fillna(0)
    df["cpf"] = df["col9"].astype(str).str.strip().str.zfill(11)
    return df.dropna(subset=["id_despesa"])


print("Carregando BASE PREST...")
bp_maio = load_bp_ids("CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
bp_junho = load_bp_ids("CONTROLE - VEXPENSES - JUNHO - 2026.xlsx")

ids_maio = set(bp_maio["id_despesa"].astype(int))
ids_junho = set(bp_junho["id_despesa"].astype(int))
ids_novos_junho = ids_junho - ids_maio

print(f"  IDs na 1ªQZ: {len(ids_maio):,}")
print(f"  IDs na 2ªQZ: {len(ids_junho):,}")
print(f"  IDs novos no JUNHO: {len(ids_novos_junho):,}")

# Carregar expenses do Neon (approval_date 11-25/05)
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur = conn.cursor()

cur.execute("""
    SELECT e.id, e.report_id, e.value, r.user_cpf, r.user_name,
           r.raw_data->>'approval_date' as approval_date
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.status = 'APROVADO'
      AND (r.raw_data->>'approval_date')::timestamp >= '2026-05-11'
      AND (r.raw_data->>'approval_date')::timestamp < '2026-05-26'
""")
rows = cur.fetchall()
conn.close()

df_api = pd.DataFrame(rows, columns=["expense_id", "report_id", "value", "cpf", "nome", "approval_date"])
print(f"\nExpenses da API (approval_date 11-25/05): {len(df_api):,}")
print(f"  Total: R$ {df_api['value'].sum():,.2f}")

# Categorizar cada expense da API
df_api["ja_em_maio"] = df_api["expense_id"].isin(ids_maio)
df_api["em_junho"] = df_api["expense_id"].isin(ids_junho)
df_api["novo_junho"] = df_api["expense_id"].isin(ids_novos_junho)

print(f"\nCategorias dos {len(df_api):,} expenses da API:")
print(f"  Estava na BASE PREST 1ªQZ (já contabilizado): {df_api['ja_em_maio'].sum():,} | R$ {df_api[df_api['ja_em_maio']]['value'].sum():,.2f}")
print(f"  Está na BASE PREST 2ªQZ:                      {df_api['em_junho'].sum():,} | R$ {df_api[df_api['em_junho']]['value'].sum():,.2f}")
print(f"  É NOVO no JUNHO (não estava no MAIO):          {df_api['novo_junho'].sum():,} | R$ {df_api[df_api['novo_junho']]['value'].sum():,.2f}")
print(f"  Não está em nenhuma BASE PREST:                {(~df_api['em_junho'] & ~df_api['ja_em_maio']).sum():,} | R$ {df_api[~df_api['em_junho'] & ~df_api['ja_em_maio']]['value'].sum():,.2f}")

# O Δ correto seria apenas os expenses que são NOVOS no JUNHO
total_api_original = df_api["value"].sum()
delta_correto = df_api[df_api["novo_junho"]]["value"].sum()
delta_ja_contabilizado = df_api[df_api["ja_em_maio"]]["value"].sum()

print(f"\n=== RECONCILIAÇÃO ===")
print(f"  Δ_API bruto (approval_date 11-25/05):              R$ {total_api_original:>12,.2f}")
print(f"  (-) já estavam na 1ªQZ (dupla contagem):          R$ {delta_ja_contabilizado:>12,.2f}")
print(f"  Δ_API corrigido (só expenses novos no JUNHO):      R$ {delta_correto:>12,.2f}")
print(f"  Δ real SOMASE (2ªQZ - 1ªQZ):                      R$ {486648.70:>12,.2f}")
print(f"  Diferença residual:                                R$ {float(delta_correto) - 486648.70:>12,.2f}")

# Expenses na API que NÃO estão em nenhuma BASE PREST
nao_em_bp = df_api[~df_api["em_junho"] & ~df_api["ja_em_maio"]]
print(f"\n  {len(nao_em_bp)} expenses da API não aparecem em nenhuma BASE PREST:")
print(f"  Total: R$ {nao_em_bp['value'].sum():,.2f}")
if len(nao_em_bp) > 0:
    print(f"  Amostra:")
    for _, r in nao_em_bp.head(5).iterrows():
        print(f"    expense_id={r['expense_id']} report={r['report_id']} cpf={r['cpf']} valor={r['value']} approval={str(r['approval_date'])[:10]}")
