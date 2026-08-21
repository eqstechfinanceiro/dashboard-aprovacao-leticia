#!/usr/bin/env python3
"""
Valida o SOMASE por CPF: Neon (prestacao_expenses) vs BASE PREST das planilhas.

Para cada CPF:
  Planilha: SOMASE('BASE PREST'!J:J, CPF, 'BASE PREST'!AA:AA)  → col9=CPF, col26=valor
  Neon:     SUM(e.value) WHERE e.report_id IN (reports do CPF)

Usa a planilha JUNHO (2ªQZ) como referência, pois é a mais completa.
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
TOLERANCIA = 0.10  # R$ 0,10 de diferença aceita (arredondamento)


# ── 1. SOMASE da planilha ────────────────────────────────────────────────────
print("Carregando BASE PREST da planilha...")
df_bp = pd.read_excel(PLANILHA, sheet_name="BASE PREST ", header=2)
df_bp.columns = [f"col{i}" for i in range(len(df_bp.columns))]
df_bp["cpf"]   = df_bp["col9"].astype(str).str.strip().str.zfill(11)
df_bp["valor"] = pd.to_numeric(df_bp["col26"], errors="coerce").fillna(0)

somase_planilha = (
    df_bp.groupby("cpf")["valor"].sum()
    .reset_index()
    .rename(columns={"valor": "planilha"})
)
print(f"  CPFs únicos na planilha: {len(somase_planilha):,}")
print(f"  Soma total planilha:     R$ {somase_planilha['planilha'].sum():,.2f}")


# ── 2. SOMASE do Neon ────────────────────────────────────────────────────────
print("\nConsultando Neon...")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur = conn.cursor()

cur.execute("""
    SELECT
        COALESCE(r.user_cpf, '') AS cpf,
        SUM(e.value)             AS total_neon
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON r.id = e.report_id
    GROUP BY r.user_cpf
    ORDER BY r.user_cpf
""")
rows = cur.fetchall()
conn.close()

somase_neon = pd.DataFrame(rows, columns=["cpf", "neon"])
somase_neon["cpf"]  = somase_neon["cpf"].astype(str).str.strip().str.zfill(11)
somase_neon["neon"] = somase_neon["neon"].apply(float)

print(f"  CPFs únicos no Neon:     {len(somase_neon):,}")
print(f"  Soma total Neon:         R$ {somase_neon['neon'].sum():,.2f}")


# ── 3. Merge e comparação ────────────────────────────────────────────────────
df = pd.merge(somase_planilha, somase_neon, on="cpf", how="outer")
df["planilha"] = df["planilha"].fillna(0)
df["neon"]     = df["neon"].fillna(0)
df["diff"]     = (df["neon"] - df["planilha"]).round(2)
df["abs_diff"] = df["diff"].abs()

total_cpfs      = len(df)
match_exato     = (df["abs_diff"] <= TOLERANCIA).sum()
divergentes     = df[df["abs_diff"] > TOLERANCIA]
so_na_planilha  = df[(df["planilha"] > 0) & (df["neon"] == 0)]
so_no_neon      = df[(df["neon"] > 0) & (df["planilha"] == 0)]

print(f"\n{'=' * 65}")
print(f"  RESULTADO DA VALIDAÇÃO")
print(f"{'=' * 65}")
print(f"  Total CPFs (union):        {total_cpfs:,}")
print(f"  Match exato (±R$0,10):     {match_exato:,}  ({match_exato/total_cpfs*100:.1f}%)")
print(f"  Divergentes:               {len(divergentes):,}  ({len(divergentes)/total_cpfs*100:.1f}%)")
print(f"  Só na planilha (sem Neon): {len(so_na_planilha):,}")
print(f"  Só no Neon (sem planilha): {len(so_no_neon):,}")
print(f"{'=' * 65}")

soma_planilha = df["planilha"].sum()
soma_neon     = df["neon"].sum()
print(f"\n  Soma planilha: R$ {soma_planilha:>14,.2f}")
print(f"  Soma Neon:     R$ {soma_neon:>14,.2f}")
print(f"  Diferença:     R$ {soma_neon - soma_planilha:>14,.2f}  ({(soma_neon/soma_planilha - 1)*100:+.2f}%)")

# ── 4. Top divergências ──────────────────────────────────────────────────────
if len(divergentes) > 0:
    print(f"\n  Top 20 maiores divergências:")
    top = divergentes.nlargest(20, "abs_diff")[["cpf", "planilha", "neon", "diff"]]
    print(f"  {'CPF':<14} {'Planilha':>14} {'Neon':>14} {'Diff':>12}")
    print(f"  {'-'*56}")
    for _, r in top.iterrows():
        print(f"  {r['cpf']:<14} {r['planilha']:>14,.2f} {r['neon']:>14,.2f} {r['diff']:>+12,.2f}")

if len(so_na_planilha) > 0:
    print(f"\n  CPFs na planilha sem dados no Neon (amostra 5):")
    for _, r in so_na_planilha.head(5).iterrows():
        print(f"    cpf={r['cpf']}  planilha=R${r['planilha']:,.2f}")
