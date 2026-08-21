#!/usr/bin/env python3
"""
Insere no Neon os expenses que estão na BASE PREST das planilhas
mas não foram baixados via API (bloqueio 403).

Fonte: planilhas CONTROLE MAIO e JUNHO.
Destino: tabela prestacao_expenses no Neon.
"""
import os
import json
import warnings
import pandas as pd
import psycopg2
from psycopg2.extras import execute_batch
from pathlib import Path
from dotenv import load_dotenv

warnings.filterwarnings("ignore")
BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")

TOLERANCIA = 0.01


def carregar_base_prest(fname):
    f = BASE / "data" / fname
    df = pd.read_excel(f, sheet_name="BASE PREST ", header=2)
    df.columns = [f"col{i}" for i in range(len(df.columns))]
    df["id_despesa"]   = pd.to_numeric(df["col0"], errors="coerce")
    df["id_relatorio"] = pd.to_numeric(df["col1"], errors="coerce")
    df["valor"]        = pd.to_numeric(df["col26"], errors="coerce").fillna(0)
    df["cpf"]          = df["col9"].astype(str).str.strip()
    return df.dropna(subset=["id_despesa", "id_relatorio"])


print("Carregando planilhas...")
df_maio  = carregar_base_prest("CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
df_junho = carregar_base_prest("CONTROLE - VEXPENSES - JUNHO - 2026.xlsx")

# União de todos os IDs únicos das planilhas
df_todas = pd.concat([df_maio, df_junho]).drop_duplicates(subset=["id_despesa"])
df_todas["id_despesa"]   = df_todas["id_despesa"].astype(int)
df_todas["id_relatorio"] = df_todas["id_relatorio"].astype(int)

print(f"  Expenses únicos nas planilhas: {len(df_todas):,}")

# Buscar quais já estão no Neon
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur  = conn.cursor()

cur.execute("SELECT id FROM prestacao_expenses")
ids_neon = {row[0] for row in cur.fetchall()}
print(f"  Expenses já no Neon:           {len(ids_neon):,}")

# Identificar faltantes
faltantes = df_todas[~df_todas["id_despesa"].isin(ids_neon)].copy()
print(f"  Faltantes (a inserir):         {len(faltantes):,}")

if len(faltantes) == 0:
    print("  Nada a inserir!")
    conn.close()
    exit(0)

print(f"\n  Preview dos faltantes:")
print(f"  {'ID Despesa':<12} {'ID Relat.':<12} {'CPF':<14} {'Valor':>12}")
print(f"  {'-'*54}")
for _, r in faltantes.head(10).iterrows():
    print(f"  {int(r['id_despesa']):<12} {int(r['id_relatorio']):<12} {r['cpf']:<14} {r['valor']:>12,.2f}")
if len(faltantes) > 10:
    print(f"  ... e mais {len(faltantes)-10} expenses")

print(f"\n  Total a inserir: R$ {faltantes['valor'].sum():,.2f}")

# Confirmar antes de inserir
print(f"\nInserindo {len(faltantes)} expenses no Neon (origem: planilha)...")

values = []
for _, r in faltantes.iterrows():
    raw = {
        "id":        int(r["id_despesa"]),
        "report_id": int(r["id_relatorio"]),
        "value":     float(r["valor"]),
        "source":    "planilha_controle",
        "cpf":       r["cpf"],
    }
    values.append((
        int(r["id_despesa"]),
        int(r["id_relatorio"]),
        float(r["valor"]),
        None,   # date
        None,   # description
        None,   # status
        json.dumps(raw),
    ))

execute_batch(
    cur,
    """
        INSERT INTO prestacao_expenses (id, report_id, value, date, description, status, raw_data)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            value=EXCLUDED.value,
            raw_data=EXCLUDED.raw_data
    """,
    values,
)
conn.commit()

# Verificação final
cur.execute("SELECT COUNT(*) FROM prestacao_expenses WHERE raw_data->>'source' = 'planilha_controle'")
inseridos = cur.fetchone()[0]
conn.close()

print(f"  Inseridos com sucesso: {inseridos} expenses marcados como 'planilha_controle'")
print(f"\nPronto! O Neon agora tem todos os expenses das planilhas.")
