#!/usr/bin/env python3
"""
Corrige o Neon para que o SOMASE por CPF bata 100% com as planilhas.

Dois tipos de correção:
1. Expenses que faltam no Neon (presentes na planilha) → INSERT
2. Expenses com valor diferente no Neon vs planilha → UPDATE para o valor da planilha

O valor da planilha é o registro oficial do fechamento da quinzena.
"""
import os, json, warnings
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

# União de todas as despesas únicas das planilhas (JUNHO sobrescreve MAIO se houver conflito de ID)
df_todas = pd.concat([df_maio, df_junho]).drop_duplicates(subset=["id_despesa"], keep="last")
df_todas["id_despesa"]   = df_todas["id_despesa"].astype(int)
df_todas["id_relatorio"] = df_todas["id_relatorio"].astype(int)
plan_by_id = df_todas.set_index("id_despesa")

print(f"  Expenses únicos nas planilhas: {len(plan_by_id):,}")

# Buscar todos esses IDs no Neon
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur  = conn.cursor()

all_ids = plan_by_id.index.tolist()
cur.execute("""
    SELECT e.id, e.value
    FROM prestacao_expenses e
    WHERE e.id = ANY(%s)
""", (all_ids,))
neon_rows = {row[0]: float(row[1]) for row in cur.fetchall()}

# Identificar os dois tipos de problema
faltam    = []  # IDs na planilha mas ausentes no Neon
divergem  = []  # IDs presentes no Neon com valor diferente da planilha

for eid, row in plan_by_id.iterrows():
    plan_val = float(row["valor"])
    if eid not in neon_rows:
        faltam.append(eid)
    elif abs(neon_rows[eid] - plan_val) > TOLERANCIA:
        divergem.append((eid, neon_rows[eid], plan_val))

print(f"\n  IDs faltando no Neon:            {len(faltam):,}")
print(f"  IDs com valor divergente no Neon: {len(divergem):,}")

total_inserir  = sum(float(plan_by_id.loc[i, "valor"]) for i in faltam)
total_corrigir = sum(abs(n - p) for _, n, p in divergem)
print(f"  Valor a inserir:   R$ {total_inserir:,.2f}")
print(f"  Diff a corrigir:   R$ {total_corrigir:,.2f}")

# ── Inserir faltantes ────────────────────────────────────────────────────────
if faltam:
    print(f"\nInserindo {len(faltam)} expenses faltantes...")
    rows_insert = []
    for eid in faltam:
        r = plan_by_id.loc[eid]
        raw = {"id": eid, "report_id": int(r["id_relatorio"]), "value": float(r["valor"]),
               "source": "planilha_controle"}
        rows_insert.append((eid, int(r["id_relatorio"]), float(r["valor"]), None, None, None, json.dumps(raw)))

    execute_batch(cur, """
        INSERT INTO prestacao_expenses (id, report_id, value, date, description, status, raw_data)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO NOTHING
    """, rows_insert)
    conn.commit()
    print(f"  OK — {len(faltam)} inseridos.")

# ── Corrigir valores divergentes ─────────────────────────────────────────────
if divergem:
    print(f"\nCorrigindo {len(divergem)} valores divergentes...")
    print(f"  {'ID':<12} {'Neon atual':>12} {'Planilha':>12} {'Diff':>10}")
    print(f"  {'-'*50}")
    rows_update = []
    for eid, neon_val, plan_val in sorted(divergem, key=lambda x: abs(x[1]-x[2]), reverse=True):
        print(f"  {eid:<12} {neon_val:>12,.2f} {plan_val:>12,.2f} {plan_val-neon_val:>+10,.2f}")
        rows_update.append((plan_val, eid))

    execute_batch(cur, """
        UPDATE prestacao_expenses
        SET value = %s,
            raw_data = raw_data || '{"value_corrected_by_planilha": true}'::jsonb
        WHERE id = %s
    """, rows_update)
    conn.commit()
    print(f"  OK — {len(divergem)} valores corrigidos.")

conn.close()
print(f"\nConcluído.")
