#!/usr/bin/env python3
"""
Cálculo definitivo do Δ(PRESTAÇÃO) entre 1ªQZ MAIO e 2ªQZ MAIO/JUNHO 2026.

Abordagem âncora + incremento:
  - Âncora (1ªQZ):  SOMASE da BASE PREST de MAIO   → planilha snapshot
  - Atual  (2ªQZ):  SOMASE da BASE PREST de JUNHO  → planilha snapshot
  - Δ real:         atual - âncora por CPF
  - Neon acumulado: SUM(expenses) por CPF filtrado pelos IDs da planilha JUNHO
  - Validação:      Neon acumulado ≈ SOMASE planilha JUNHO
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

# ── 1. Carregar SOMASE das duas planilhas ────────────────────────────────────
def somase_planilha(fname):
    f = BASE / "data" / fname
    df = pd.read_excel(f, sheet_name="BASE PREST ", header=2)
    df.columns = [f"col{i}" for i in range(len(df.columns))]
    df["cpf"]   = df["col9"].astype(str).str.strip().str.zfill(11)
    df["valor"] = pd.to_numeric(df["col26"], errors="coerce").fillna(0)
    return df.groupby("cpf")["valor"].sum()

print("Carregando planilhas...")
s_maio  = somase_planilha("CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
s_junho = somase_planilha("CONTROLE - VEXPENSES - JUNHO - 2026.xlsx")

delta_planilha = (s_junho.subtract(s_maio, fill_value=0))

print(f"  1ªQZ MAIO  — CPFs: {len(s_maio):,}  | Total: R$ {s_maio.sum():,.2f}")
print(f"  2ªQZ JUNHO — CPFs: {len(s_junho):,}  | Total: R$ {s_junho.sum():,.2f}")
print(f"  Δ planilha          | Total: R$ {delta_planilha.sum():,.2f}")

# ── 2. SOMASE do Neon via tabela somase_snapshots (agregado exato por CPF) ────
print("\nCalculando SOMASE do Neon via tabela somase_snapshots...")

conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur  = conn.cursor()

cur.execute("SELECT user_cpf, total FROM somase_snapshots WHERE quinzena = '2026-05-1'")
rows_maio = cur.fetchall()

cur.execute("SELECT user_cpf, total FROM somase_snapshots WHERE quinzena = '2026-06-2'")
rows_junho = cur.fetchall()
conn.close()

neon_junho = pd.Series(
    {str(cpf).strip().zfill(11): float(v) for cpf, v in rows_junho},
    name="neon_junho"
)
neon_maio = pd.Series(
    {str(cpf).strip().zfill(11): float(v) for cpf, v in rows_maio},
    name="neon_maio"
)

print(f"  Neon MAIO  (snapshot) — CPFs: {len(neon_maio):,}  | Total: R$ {neon_maio.sum():,.2f}")
print(f"  Neon JUNHO (snapshot) — CPFs: {len(neon_junho):,}  | Total: R$ {neon_junho.sum():,.2f}")

# ── 3. Validação: Neon JUNHO vs planilha JUNHO ───────────────────────────────
df_val = pd.DataFrame({"planilha": s_junho, "neon": neon_junho}).fillna(0)
df_val["diff"] = (df_val["neon"] - df_val["planilha"]).abs()
match = (df_val["diff"] <= TOLERANCIA).sum()

print(f"\n{'='*65}")
print(f"  VALIDAÇÃO: Neon (filtrado) vs Planilha JUNHO")
print(f"{'='*65}")
print(f"  Match exato (±R$0,10): {match}/{len(df_val)}  ({match/len(df_val)*100:.1f}%)")
print(f"  Soma planilha:  R$ {s_junho.sum():>14,.2f}")
print(f"  Soma Neon:      R$ {neon_junho.sum():>14,.2f}")
print(f"  Divergência:    R$ {neon_junho.sum() - s_junho.sum():>+14,.2f}")

# ── 4. Δ(PRESTAÇÃO) — comparação planilha vs Neon ───────────────────────────
delta_neon = neon_junho.subtract(neon_maio, fill_value=0)

print(f"\n{'='*65}")
print(f"  Δ(PRESTAÇÃO): 1ªQZ MAIO → 2ªQZ JUNHO")
print(f"{'='*65}")
print(f"  Δ real (planilha):    R$ {delta_planilha.sum():>14,.2f}")
print(f"  Δ Neon (filtrado):    R$ {delta_neon.sum():>14,.2f}")
print(f"  Diferença residual:   R$ {delta_neon.sum() - delta_planilha.sum():>+14,.2f}")

# ── 5. Top divergências no Δ por CPF ────────────────────────────────────────
df_delta = pd.DataFrame({
    "delta_planilha": delta_planilha,
    "delta_neon":     delta_neon,
}).fillna(0)
df_delta["diff"] = (df_delta["delta_neon"] - df_delta["delta_planilha"]).round(2)
df_delta["abs_diff"] = df_delta["diff"].abs()
divs = df_delta[df_delta["abs_diff"] > TOLERANCIA]

print(f"\n  CPFs com Δ divergente: {len(divs)}")
if len(divs) > 0 and len(divs) <= 20:
    print(f"  {'CPF':<14} {'Δ planilha':>14} {'Δ Neon':>14} {'Diff':>12}")
    print(f"  {'-'*56}")
    for cpf, r in divs.nlargest(20, "abs_diff").iterrows():
        print(f"  {cpf:<14} {r['delta_planilha']:>14,.2f} {r['delta_neon']:>14,.2f} {r['diff']:>+12,.2f}")

print(f"\n{'='*65}")
print(f"  RESUMO FINAL")
print(f"{'='*65}")
print(f"  Planilha 1ªQZ (âncora):   R$ {s_maio.sum():>14,.2f}")
print(f"  Planilha 2ªQZ (atual):    R$ {s_junho.sum():>14,.2f}")
print(f"  Δ real planilha:          R$ {delta_planilha.sum():>+14,.2f}")
print(f"  Δ Neon (replicado):       R$ {delta_neon.sum():>+14,.2f}")
print(f"  Precisão:                 {(1 - abs(delta_neon.sum() - delta_planilha.sum()) / delta_planilha.sum()) * 100:.2f}%")
print(f"{'='*65}")
