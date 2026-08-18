#!/usr/bin/env python3
"""
Investigação dos 7 CPFs ainda divergentes após usar snapshots.
Foca nos 3 maiores: o SOMASE JUNHO do Neon está menor que a planilha.
Hipótese: CPF do relatório foi atualizado na API após o fechamento da planilha.
"""
import os, warnings
import pandas as pd
import psycopg2
from pathlib import Path
from dotenv import load_dotenv

warnings.filterwarnings("ignore")
BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")

CPFS_ALVO = ["02013700008", "95417400068", "06274547983", "48210811053",
             "90443306087", "02344854002", "16306431730"]

def carregar_bp(fname):
    f = BASE / "data" / fname
    df = pd.read_excel(f, sheet_name="BASE PREST ", header=2)
    df.columns = [f"col{i}" for i in range(len(df.columns))]
    df["id_despesa"]   = pd.to_numeric(df["col0"], errors="coerce")
    df["id_relatorio"] = pd.to_numeric(df["col1"], errors="coerce")
    df["valor"]        = pd.to_numeric(df["col26"], errors="coerce").fillna(0)
    df["cpf"]          = df["col9"].astype(str).str.strip().str.zfill(11)
    return df.dropna(subset=["id_despesa"]).copy()

df_maio  = carregar_bp("CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
df_junho = carregar_bp("CONTROLE - VEXPENSES - JUNHO - 2026.xlsx")
df_maio["id_despesa"]  = df_maio["id_despesa"].astype(int)
df_junho["id_despesa"] = df_junho["id_despesa"].astype(int)

conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur  = conn.cursor()

for cpf in CPFS_ALVO:
    ids_jun = df_junho[df_junho["cpf"]==cpf]["id_despesa"].tolist()
    ids_mai = df_maio[df_maio["cpf"]==cpf]["id_despesa"].tolist()

    plan_jun = df_junho[df_junho["cpf"]==cpf]["valor"].sum()
    plan_mai = df_maio[df_maio["cpf"]==cpf]["valor"].sum()

    # Snapshot Neon
    cur.execute("""
        SELECT SUM(s.value) FROM prestacao_expense_snapshots s WHERE s.id = ANY(%s) AND s.quinzena='2026-06-2'
    """, (ids_jun,))
    snap_jun = float(cur.fetchone()[0] or 0)

    cur.execute("""
        SELECT SUM(s.value) FROM prestacao_expense_snapshots s WHERE s.id = ANY(%s) AND s.quinzena='2026-05-1'
    """, (ids_mai,))
    snap_mai = float(cur.fetchone()[0] or 0)

    print(f"\nCPF {cpf}")
    print(f"  JUNHO: planilha={plan_jun:,.2f}  snapshot_neon={snap_jun:,.2f}  diff={snap_jun-plan_jun:+,.2f}")
    print(f"  MAIO:  planilha={plan_mai:,.2f}  snapshot_neon={snap_mai:,.2f}  diff={snap_mai-plan_mai:+,.2f}")

    # Se JUNHO difere: quais IDs da planilha JUNHO não estão no snapshot?
    if abs(snap_jun - plan_jun) > 0.10:
        cur.execute("""
            SELECT s.id, s.value
            FROM prestacao_expense_snapshots s
            WHERE s.id = ANY(%s) AND s.quinzena='2026-06-2'
        """, (ids_jun,))
        snap_ids = {r[0]: float(r[1]) for r in cur.fetchall()}
        faltam = [i for i in ids_jun if i not in snap_ids]
        if faltam:
            total_falt = df_junho[df_junho["id_despesa"].isin(faltam)]["valor"].sum()
            print(f"  IDs da planilha JUNHO sem snapshot no Neon: {len(faltam)} | R$ {total_falt:,.2f}")
            for eid in faltam[:5]:
                v = float(df_junho[df_junho["id_despesa"]==eid]["valor"].iloc[0])
                print(f"    id={eid}  val_planilha={v:.2f}")
                # Verificar se existe no Neon com CPF diferente
                cur.execute("""
                    SELECT e.id, e.value, COALESCE(r.user_cpf,'?'), r.id
                    FROM prestacao_expenses e
                    JOIN prestacao_reports r ON r.id = e.report_id
                    WHERE e.id = %s
                """, (eid,))
                row = cur.fetchone()
                if row:
                    print(f"      → no Neon: val={float(row[1]):.2f}  cpf={str(row[2]).zfill(11)}  report={row[3]}")
                else:
                    print(f"      → NÃO existe no Neon!")

    # Se MAIO difere por excesso (CPF 48210811053: snap_mai=0, plan_mai>0)
    if abs(snap_mai - plan_mai) > 0.10 and plan_mai > 0 and snap_mai == 0:
        print(f"  Expenses do MAIO sem snapshot: IDs={ids_mai}")
        cur.execute("SELECT id, value FROM prestacao_expenses WHERE id = ANY(%s)", (ids_mai,))
        for r in cur.fetchall():
            print(f"    id={r[0]} val={float(r[1]):.2f} — existe no Neon mas sem snapshot '2026-05-1'")

conn.close()
