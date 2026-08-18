#!/usr/bin/env python3
"""
Verifica expenses que aparecem em AMBAS as planilhas (MAIO e JUNHO)
mas com valores DIFERENTES entre as duas.
Esses causam divergência no Δ porque o Neon tem apenas um valor (o mais recente).
"""
import os, warnings
import pandas as pd
import psycopg2
from pathlib import Path
from dotenv import load_dotenv

warnings.filterwarnings("ignore")
BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")
TOLERANCIA = 0.01


def carregar_bp(fname):
    f = BASE / "data" / fname
    df = pd.read_excel(f, sheet_name="BASE PREST ", header=2)
    df.columns = [f"col{i}" for i in range(len(df.columns))]
    df["id_despesa"] = pd.to_numeric(df["col0"], errors="coerce")
    df["valor"]      = pd.to_numeric(df["col26"], errors="coerce").fillna(0)
    df["cpf"]        = df["col9"].astype(str).str.strip().str.zfill(11)
    return df.dropna(subset=["id_despesa"]).copy()


df_maio  = carregar_bp("CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
df_junho = carregar_bp("CONTROLE - VEXPENSES - JUNHO - 2026.xlsx")

df_maio["id_despesa"]  = df_maio["id_despesa"].astype(int)
df_junho["id_despesa"] = df_junho["id_despesa"].astype(int)

# Merge por ID — expenses presentes nas duas planilhas
merged = pd.merge(
    df_maio[["id_despesa","cpf","valor"]].rename(columns={"valor":"val_maio","cpf":"cpf_maio"}),
    df_junho[["id_despesa","cpf","valor"]].rename(columns={"valor":"val_junho","cpf":"cpf_junho"}),
    on="id_despesa"
)

# Com valor diferente
dif_valor = merged[abs(merged["val_maio"] - merged["val_junho"]) > TOLERANCIA].copy()
dif_valor["diff"] = dif_valor["val_junho"] - dif_valor["val_maio"]
dif_valor["impacto_delta"] = dif_valor["diff"]  # no Δ cada R$1 de diferença no MAIO afeta o Δ em -R$1

print(f"IDs em AMBAS as planilhas: {len(merged):,}")
print(f"IDs com valor diferente entre MAIO e JUNHO: {len(dif_valor):,}")
print(f"Soma das diferenças: R$ {dif_valor['diff'].sum():,.2f}")
print(f"Impacto no Δ (se Neon usa valor JUNHO): R$ {-dif_valor['impacto_delta'].sum():,.2f}")

print(f"\n  {'ID':<12} {'CPF':<14} {'val_maio':>10} {'val_junho':>10} {'diff':>10}")
print(f"  {'-'*60}")
for _, r in dif_valor.sort_values("diff", key=abs, ascending=False).iterrows():
    print(f"  {r['id_despesa']:<12} {r['cpf_maio']:<14} {r['val_maio']:>10,.2f} {r['val_junho']:>10,.2f} {r['diff']:>+10,.2f}")

# Buscar valores atuais no Neon para esses IDs
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur  = conn.cursor()
ids = dif_valor["id_despesa"].tolist()
cur.execute("SELECT id, value FROM prestacao_expenses WHERE id = ANY(%s)", (ids,))
neon_vals = {r[0]: float(r[1]) for r in cur.fetchall()}
conn.close()

dif_valor["val_neon"] = dif_valor["id_despesa"].map(neon_vals)

# Verificar qual valor o Neon tem: MAIO ou JUNHO?
neon_usa_maio  = (abs(dif_valor["val_neon"] - dif_valor["val_maio"])  < TOLERANCIA).sum()
neon_usa_junho = (abs(dif_valor["val_neon"] - dif_valor["val_junho"]) < TOLERANCIA).sum()
neon_outro     = len(dif_valor) - neon_usa_maio - neon_usa_junho

print(f"\nValor atual no Neon para esses IDs:")
print(f"  Igual ao MAIO:  {neon_usa_maio}")
print(f"  Igual ao JUNHO: {neon_usa_junho}")
print(f"  Outro valor:    {neon_outro}")
print(f"\nImpacto no Δ de usar JUNHO em vez de MAIO para esses IDs:")
print(f"  R$ {dif_valor['diff'].sum():+,.2f}  (positivo = JUNHO > MAIO = Δ Neon > Δ planilha)")
