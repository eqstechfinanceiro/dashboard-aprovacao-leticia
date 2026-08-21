#!/usr/bin/env python3
"""
Corrige valores do Neon especificamente para IDs exclusivos da planilha MAIO
(IDs que estão no MAIO mas não no JUNHO — os que foram removidos/estornados entre quinzenas).
Para IDs que existem nas duas planilhas, o valor do JUNHO já foi aplicado antes.
"""
import os, warnings
import pandas as pd
import psycopg2
from psycopg2.extras import execute_batch
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
    df["id_despesa"]   = pd.to_numeric(df["col0"], errors="coerce")
    df["id_relatorio"] = pd.to_numeric(df["col1"], errors="coerce")
    df["valor"]        = pd.to_numeric(df["col26"], errors="coerce").fillna(0)
    df["cpf"]          = df["col9"].astype(str).str.strip().str.zfill(11)
    return df.dropna(subset=["id_despesa", "id_relatorio"]).copy()


print("Carregando planilhas...")
df_maio  = carregar_bp("CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
df_junho = carregar_bp("CONTROLE - VEXPENSES - JUNHO - 2026.xlsx")

ids_junho = set(df_junho["id_despesa"].astype(int))

# IDs exclusivos do MAIO (não aparecem no JUNHO — foram removidos/estornados)
df_maio["id_despesa"] = df_maio["id_despesa"].astype(int)
df_maio_exclusivos = df_maio[~df_maio["id_despesa"].isin(ids_junho)].copy()

print(f"  IDs exclusivos do MAIO (não estão no JUNHO): {len(df_maio_exclusivos):,}")

# Buscar esses IDs no Neon
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur  = conn.cursor()

ids_list = df_maio_exclusivos["id_despesa"].tolist()
cur.execute("SELECT id, value FROM prestacao_expenses WHERE id = ANY(%s)", (ids_list,))
neon_vals = {row[0]: float(row[1]) for row in cur.fetchall()}

# Identificar divergências
divergem  = []
faltam    = []
for _, row in df_maio_exclusivos.iterrows():
    eid = int(row["id_despesa"])
    pval = float(row["valor"])
    if eid not in neon_vals:
        faltam.append(row)
    elif abs(neon_vals[eid] - pval) > TOLERANCIA:
        divergem.append((eid, neon_vals[eid], pval))

print(f"  Faltando no Neon:       {len(faltam):,}")
print(f"  Com valor divergente:   {len(divergem):,}")

if faltam:
    import json
    rows_ins = []
    for row in faltam:
        raw = {"id": int(row["id_despesa"]), "report_id": int(row["id_relatorio"]),
               "value": float(row["valor"]), "source": "planilha_controle_maio"}
        rows_ins.append((int(row["id_despesa"]), int(row["id_relatorio"]),
                         float(row["valor"]), None, None, None, json.dumps(raw)))
    execute_batch(cur, """
        INSERT INTO prestacao_expenses (id, report_id, value, date, description, status, raw_data)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO NOTHING
    """, rows_ins)
    conn.commit()
    print(f"  Inseridos: {len(faltam)}")

if divergem:
    print(f"\n  Corrigindo {len(divergem)} valores:")
    print(f"  {'ID':<12} {'Neon':>12} {'Planilha':>12} {'Diff':>10}")
    print(f"  {'-'*50}")
    rows_upd = []
    for eid, nval, pval in sorted(divergem, key=lambda x: abs(x[1]-x[2]), reverse=True):
        print(f"  {eid:<12} {nval:>12,.2f} {pval:>12,.2f} {pval-nval:>+10,.2f}")
        rows_upd.append((pval, eid))

    execute_batch(cur, """
        UPDATE prestacao_expenses
        SET value = %s,
            raw_data = raw_data || '{"value_corrected_by_planilha_maio": true}'::jsonb
        WHERE id = %s
    """, rows_upd)
    conn.commit()
    print(f"  OK — {len(divergem)} corrigidos.")

conn.close()

if not faltam and not divergem:
    print("  Nada a corrigir — MAIO já está OK!")
print("\nConcluído.")
