#!/usr/bin/env python3
"""
Recria a tabela prestacao_expense_snapshots adicionando coluna user_cpf
diretamente da planilha — evita depender do user_cpf do Neon que pode divergir.
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

conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur  = conn.cursor()

# Adicionar coluna user_cpf se não existir
cur.execute("""
    ALTER TABLE prestacao_expense_snapshots
    ADD COLUMN IF NOT EXISTS user_cpf VARCHAR(20)
""")
conn.commit()

# Atualizar com CPF da planilha MAIO
rows_maio = [
    (int(r["id_despesa"]), "2026-05-1", float(r["valor"]), r["cpf"])
    for _, r in df_maio.iterrows()
]
execute_batch(cur, """
    INSERT INTO prestacao_expense_snapshots (id, quinzena, value, user_cpf)
    VALUES (%s, %s, %s, %s)
    ON CONFLICT (id, quinzena) DO UPDATE SET value = EXCLUDED.value, user_cpf = EXCLUDED.user_cpf
""", rows_maio)

# Atualizar com CPF da planilha JUNHO
rows_junho = [
    (int(r["id_despesa"]), "2026-06-2", float(r["valor"]), r["cpf"])
    for _, r in df_junho.iterrows()
]
execute_batch(cur, """
    INSERT INTO prestacao_expense_snapshots (id, quinzena, value, user_cpf)
    VALUES (%s, %s, %s, %s)
    ON CONFLICT (id, quinzena) DO UPDATE SET value = EXCLUDED.value, user_cpf = EXCLUDED.user_cpf
""", rows_junho)

conn.commit()
print(f"  MAIO:  {len(rows_maio):,} registros com user_cpf")
print(f"  JUNHO: {len(rows_junho):,} registros com user_cpf")

# Verificação rápida: SOMASE por CPF usando user_cpf da snapshot
cur.execute("""
    SELECT user_cpf, SUM(value)
    FROM prestacao_expense_snapshots
    WHERE quinzena = '2026-06-2'
    GROUP BY user_cpf
""")
neon_jun = {str(r[0]).strip().zfill(11): float(r[1]) for r in cur.fetchall()}
total_jun = sum(neon_jun.values())

cur.execute("""
    SELECT user_cpf, SUM(value)
    FROM prestacao_expense_snapshots
    WHERE quinzena = '2026-05-1'
    GROUP BY user_cpf
""")
neon_mai = {str(r[0]).strip().zfill(11): float(r[1]) for r in cur.fetchall()}
total_mai = sum(neon_mai.values())

conn.close()

print(f"\nSOMASE via snapshot (user_cpf da planilha):")
print(f"  MAIO:  R$ {total_mai:,.2f}  (planilha: R$ 5,646,466.31)")
print(f"  JUNHO: R$ {total_jun:,.2f}  (planilha: R$ 6,133,115.01)")
print(f"  Δ Neon: R$ {total_jun - total_mai:,.2f}  (Δ planilha: R$ 486,648.70)")
