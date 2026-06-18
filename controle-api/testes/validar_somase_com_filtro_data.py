#!/usr/bin/env python3
"""
Testa diferentes cortes de approval_date para replicar o SOMASE da planilha JUNHO.
A planilha é fechada no dia 25 de cada mês (2ªQZ) ou dia 10 (1ªQZ).
Fechamento da 2ªQZ JUNHO 2026 = 25/06/2026.
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

PLANILHA = BASE / "data" / "CONTROLE - VEXPENSES - JUNHO - 2026.xlsx"
TOLERANCIA = 0.10

# ── 1. SOMASE da planilha ────────────────────────────────────────────────────
df_bp = pd.read_excel(PLANILHA, sheet_name="BASE PREST ", header=2)
df_bp.columns = [f"col{i}" for i in range(len(df_bp.columns))]
df_bp["cpf"]   = df_bp["col9"].astype(str).str.strip().str.zfill(11)
df_bp["valor"] = pd.to_numeric(df_bp["col26"], errors="coerce").fillna(0)
somase_planilha = df_bp.groupby("cpf")["valor"].sum()
total_planilha = somase_planilha.sum()
print(f"Planilha JUNHO — soma total: R$ {total_planilha:,.2f}  ({len(somase_planilha)} CPFs)")

# ── 2. Testar vários cortes de data ──────────────────────────────────────────
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur = conn.cursor()

cortes = [
    ("Sem filtro (tudo)",           None),
    ("approval_date <= 2026-06-25", "2026-06-25"),
    ("approval_date <= 2026-06-10", "2026-06-10"),
    ("approval_date <= 2026-06-01", "2026-06-01"),
    ("approval_date <= 2026-05-25", "2026-05-25"),
]

print(f"\n{'Corte':<38} {'Soma Neon':>14} {'Diff':>14} {'Match%':>8} {'CPFs':>6}")
print("-" * 85)

for label, data_corte in cortes:
    if data_corte:
        cur.execute("""
            SELECT COALESCE(r.user_cpf,''), SUM(e.value)
            FROM prestacao_expenses e
            JOIN prestacao_reports r ON r.id = e.report_id
            WHERE (r.raw_data->>'approval_date')::date <= %s
            GROUP BY r.user_cpf
        """, (data_corte,))
    else:
        cur.execute("""
            SELECT COALESCE(r.user_cpf,''), SUM(e.value)
            FROM prestacao_expenses e
            JOIN prestacao_reports r ON r.id = e.report_id
            GROUP BY r.user_cpf
        """)

    rows = cur.fetchall()
    df_neon = pd.DataFrame(rows, columns=["cpf", "neon"])
    df_neon["cpf"]  = df_neon["cpf"].astype(str).str.strip().str.zfill(11)
    df_neon["neon"] = df_neon["neon"].apply(float)

    df = pd.merge(somase_planilha.reset_index().rename(columns={"valor":"planilha"}),
                  df_neon, on="cpf", how="outer").fillna(0)
    df["diff"]     = (df["neon"] - df["planilha"]).abs()
    soma_neon      = df["neon"].sum()
    match          = (df["diff"] <= TOLERANCIA).sum()
    total_cpfs     = len(df)

    print(f"  {label:<36} {soma_neon:>14,.2f} {soma_neon - total_planilha:>+14,.2f} {match/total_cpfs*100:>7.1f}% {total_cpfs:>6}")

conn.close()

# ── 3. Investigar o melhor corte com detalhe ─────────────────────────────────
print(f"\n--- Detalhando corte approval_date <= 2026-06-25 ---")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur = conn.cursor()
cur.execute("""
    SELECT COALESCE(r.user_cpf,''), SUM(e.value)
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON r.id = e.report_id
    WHERE (r.raw_data->>'approval_date')::date <= '2026-06-25'
    GROUP BY r.user_cpf
""")
df_neon = pd.DataFrame(cur.fetchall(), columns=["cpf","neon"])
df_neon["cpf"] = df_neon["cpf"].astype(str).str.strip().str.zfill(11)
df_neon["neon"] = df_neon["neon"].apply(float)
conn.close()

df = pd.merge(
    somase_planilha.reset_index().rename(columns={"valor":"planilha"}),
    df_neon, on="cpf", how="outer"
).fillna(0)
df["diff"] = (df["neon"] - df["planilha"]).round(2)
df["abs_diff"] = df["diff"].abs()

divergentes = df[df["abs_diff"] > TOLERANCIA]
print(f"  Divergentes: {len(divergentes)} CPFs")
if len(divergentes) > 0:
    print(f"\n  {'CPF':<14} {'Planilha':>14} {'Neon':>14} {'Diff':>12}")
    print(f"  {'-'*56}")
    for _, r in divergentes.nlargest(15, "abs_diff").iterrows():
        print(f"  {r['cpf']:<14} {r['planilha']:>14,.2f} {r['neon']:>14,.2f} {r['diff']:>+12,.2f}")
