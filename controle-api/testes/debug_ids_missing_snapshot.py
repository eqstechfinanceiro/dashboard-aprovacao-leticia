import os, warnings, pandas as pd, psycopg2
from dotenv import load_dotenv
from pathlib import Path
warnings.filterwarnings("ignore")
load_dotenv(Path(__file__).parent.parent / ".env")

f = Path(__file__).parent.parent / "data" / "CONTROLE - VEXPENSES - JUNHO - 2026.xlsx"
df = pd.read_excel(f, sheet_name="BASE PREST ", header=2)
df.columns = [f"col{i}" for i in range(len(df.columns))]
df["cpf"] = df["col9"].astype(str).str.strip().str.zfill(11)
df["valor"] = pd.to_numeric(df["col26"], errors="coerce").fillna(0)

# Ver os registros crus dos 3 CPFs antes de converter id
for cpf in ["02013700008", "95417400068", "06274547983"]:
    subset = df[df["cpf"]==cpf][["col0","cpf","valor"]].head(5)
    print(f"\nCPF {cpf} — col0 (id_despesa) raw:")
    print(subset.to_string())
    print(f"  dtype col0: {df[df['cpf']==cpf]['col0'].dtype}")
    print(f"  sample values: {df[df['cpf']==cpf]['col0'].head(3).tolist()}")

# Agora converter e ver quantos ficam NaN
df["id"] = pd.to_numeric(df["col0"], errors="coerce")
print(f"\nTotal NaN após to_numeric: {df['id'].isna().sum()}")
print(f"Amostra de NaN (col0 values):")
print(df[df["id"].isna()]["col0"].head(5).tolist())

# Verificar se há duplicatas de id entre CPFs diferentes
df_valid = df.dropna(subset=["id"]).copy()
df_valid["id"] = df_valid["id"].astype(int)

conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur = conn.cursor()
cur.execute("SELECT COUNT(*) FROM prestacao_expense_snapshots WHERE quinzena='2026-06-2'")
snap_total = cur.fetchone()[0]
print(f"\nTotal no snapshot JUNHO: {snap_total:,} (planilha tem {len(df_valid):,})")

# Quais IDs da planilha JUNHO não estão no snapshot JUNHO?
ids_planilha = df_valid["id"].tolist()
cur.execute("SELECT id FROM prestacao_expense_snapshots WHERE id = ANY(%s) AND quinzena='2026-06-2'", (ids_planilha,))
ids_snap = {r[0] for r in cur.fetchall()}
ids_faltam = [i for i in ids_planilha if i not in ids_snap]

print(f"IDs da planilha não no snapshot: {len(ids_faltam)}")
if ids_faltam:
    df_falt = df_valid[df_valid["id"].isin(ids_faltam)]
    print(f"CPFs afetados: {df_falt['cpf'].value_counts().to_dict()}")
    print(f"Total valor: R$ {df_falt['valor'].sum():,.2f}")
    # Inserir os faltantes
    print(f"\nInserindo {len(ids_faltam)} IDs faltantes no snapshot JUNHO...")
    rows = [(int(r["id"]), "2026-06-2", float(r["valor"]), r["cpf"]) for _, r in df_falt.iterrows()]
    from psycopg2.extras import execute_batch
    execute_batch(cur, """
        INSERT INTO prestacao_expense_snapshots (id, quinzena, value, user_cpf)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (id, quinzena) DO UPDATE SET value=EXCLUDED.value, user_cpf=EXCLUDED.user_cpf
    """, rows)
    conn.commit()
    print(f"  Inseridos: {len(rows)}")

conn.close()
