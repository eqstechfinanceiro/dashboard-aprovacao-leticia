#!/usr/bin/env python3
"""
Cria tabela prestacao_expense_snapshots e popula com os valores históricos
dos 30 expenses que tiveram valor alterado entre MAIO e JUNHO.

Isso permite calcular o SOMASE MAIO com o valor correto do snapshot MAIO,
sem sobrescrever o valor atual do Neon (que reflete o JUNHO/API atual).
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

conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur  = conn.cursor()

# ── 1. Criar tabela de snapshots ─────────────────────────────────────────────
cur.execute("""
    CREATE TABLE IF NOT EXISTS prestacao_expense_snapshots (
        id         BIGINT NOT NULL,
        quinzena   VARCHAR(10) NOT NULL,
        value      NUMERIC(14,2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, quinzena)
    )
""")
conn.commit()
print("Tabela prestacao_expense_snapshots criada/verificada.")

# ── 2. Carregar planilhas ────────────────────────────────────────────────────
def carregar_bp(fname):
    f = BASE / "data" / fname
    df = pd.read_excel(f, sheet_name="BASE PREST ", header=2)
    df.columns = [f"col{i}" for i in range(len(df.columns))]
    df["id_despesa"] = pd.to_numeric(df["col0"], errors="coerce")
    df["valor"]      = pd.to_numeric(df["col26"], errors="coerce").fillna(0)
    df["cpf"]        = df["col9"].astype(str).str.strip().str.zfill(11)
    return df.dropna(subset=["id_despesa"]).copy()

print("Carregando planilhas...")
df_maio  = carregar_bp("CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
df_junho = carregar_bp("CONTROLE - VEXPENSES - JUNHO - 2026.xlsx")

df_maio["id_despesa"]  = df_maio["id_despesa"].astype(int)
df_junho["id_despesa"] = df_junho["id_despesa"].astype(int)

# ── 3. Inserir snapshot MAIO para todos os IDs da planilha MAIO ───────────────
# (isso garante que qualquer futuro cálculo de SOMASE MAIO use o valor correto)
rows_maio = [
    (int(r["id_despesa"]), "2026-05-1", float(r["valor"]))
    for _, r in df_maio.iterrows()
]
execute_batch(cur, """
    INSERT INTO prestacao_expense_snapshots (id, quinzena, value)
    VALUES (%s, %s, %s)
    ON CONFLICT (id, quinzena) DO UPDATE SET value = EXCLUDED.value
""", rows_maio)
conn.commit()
print(f"  Snapshot MAIO inserido: {len(rows_maio):,} registros")

# ── 4. Inserir snapshot JUNHO para todos os IDs da planilha JUNHO ─────────────
rows_junho = [
    (int(r["id_despesa"]), "2026-06-2", float(r["valor"]))
    for _, r in df_junho.iterrows()
]
execute_batch(cur, """
    INSERT INTO prestacao_expense_snapshots (id, quinzena, value)
    VALUES (%s, %s, %s)
    ON CONFLICT (id, quinzena) DO UPDATE SET value = EXCLUDED.value
""", rows_junho)
conn.commit()
print(f"  Snapshot JUNHO inserido: {len(rows_junho):,} registros")

cur.execute("SELECT COUNT(*) FROM prestacao_expense_snapshots")
total = cur.fetchone()[0]
print(f"  Total na tabela: {total:,}")
conn.close()

print("\nPronto! Snapshots históricos salvos.")
print("Use a tabela prestacao_expense_snapshots para calcular SOMASE por quinzena com valores exatos.")
