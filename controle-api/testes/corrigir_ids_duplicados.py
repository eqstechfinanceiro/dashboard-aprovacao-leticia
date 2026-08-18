import os, warnings, pandas as pd, psycopg2
from psycopg2.extras import execute_batch
from dotenv import load_dotenv
from pathlib import Path
warnings.filterwarnings("ignore")
load_dotenv(Path(__file__).parent.parent / ".env")

def bp(fname):
    f = Path(__file__).parent.parent / "data" / fname
    df = pd.read_excel(f, sheet_name="BASE PREST ", header=2)
    df.columns = [f"col{i}" for i in range(len(df.columns))]
    df["id"]    = pd.to_numeric(df["col0"], errors="coerce")
    df["valor"] = pd.to_numeric(df["col26"], errors="coerce").fillna(0)
    df["cpf"]   = df["col9"].astype(str).str.strip().str.zfill(11)
    return df.dropna(subset=["id"]).copy()

df_junho = bp("CONTROLE - VEXPENSES - JUNHO - 2026.xlsx")
df_junho["id"] = df_junho["id"].astype(int)

# IDs duplicados na planilha JUNHO (mesmo expense_id aparece para CPFs diferentes)
dups = df_junho[df_junho.duplicated(subset=["id"], keep=False)].sort_values("id")
print(f"IDs duplicados na planilha JUNHO: {dups['id'].nunique()} IDs únicos, {len(dups)} linhas")
print(f"Valor total dessas linhas: R$ {dups['valor'].sum():,.2f}")
print()
print(dups[["id","cpf","valor"]].to_string())

# Para o cálculo correto, precisamos somar os valores por CPF mesmo para IDs duplicados.
# A snapshot atual tem PK (id, quinzena) — não permite dois CPFs para o mesmo id/quinzena.
# Solução: criar snapshot agregado por CPF (sem PK de id) OU usar tabela diferente.

# Verificar quais CPFs estão perdendo valor por causa das duplicatas
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur = conn.cursor()

print(f"\nValor perdido por CPF (o que está no snapshot vs planilha):")
for cpf in dups["cpf"].unique():
    ids_cpf = dups[dups["cpf"]==cpf]["id"].tolist()
    val_plan = float(dups[dups["cpf"]==cpf]["valor"].sum())
    cur.execute("""
        SELECT SUM(value) FROM prestacao_expense_snapshots
        WHERE id = ANY(%s) AND quinzena='2026-06-2' AND user_cpf=%s
    """, (ids_cpf, cpf))
    val_snap = float(cur.fetchone()[0] or 0)
    if abs(val_snap - val_plan) > 0.01:
        print(f"  CPF {cpf}: planilha=R${val_plan:.2f}  snapshot=R${val_snap:.2f}  diff={val_snap-val_plan:+.2f}")

# A solução: a snapshot não pode representar um expense compartilhado entre CPFs com PK (id, quinzena).
# Precisamos adicionar user_cpf à PK, ou usar uma tabela de SOMASE pré-calculada.
# Solução mais simples: criar tabela somase_snapshots com (cpf, quinzena) como PK.
print(f"\nCriando tabela somase_snapshots (agregado por CPF+quinzena)...")
cur.execute("""
    CREATE TABLE IF NOT EXISTS somase_snapshots (
        user_cpf  VARCHAR(20) NOT NULL,
        quinzena  VARCHAR(10) NOT NULL,
        total     NUMERIC(14,2) NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_cpf, quinzena)
    )
""")
conn.commit()

# Popular com SOMASE direto da planilha para MAIO e JUNHO
df_maio = bp("CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
df_maio["id"] = df_maio["id"].astype(int)

s_maio  = df_maio.groupby("cpf")["valor"].sum().reset_index()
s_junho = df_junho.groupby("cpf")["valor"].sum().reset_index()

rows_maio  = [(r["cpf"], "2026-05-1", float(r["valor"])) for _, r in s_maio.iterrows()]
rows_junho = [(r["cpf"], "2026-06-2", float(r["valor"])) for _, r in s_junho.iterrows()]

execute_batch(cur, """
    INSERT INTO somase_snapshots (user_cpf, quinzena, total)
    VALUES (%s, %s, %s)
    ON CONFLICT (user_cpf, quinzena) DO UPDATE SET total=EXCLUDED.total, updated_at=NOW()
""", rows_maio + rows_junho)
conn.commit()

cur.execute("SELECT quinzena, COUNT(*), SUM(total) FROM somase_snapshots GROUP BY quinzena ORDER BY quinzena")
for qz, cnt, total in cur.fetchall():
    print(f"  {qz}: {cnt} CPFs | R$ {float(total):,.2f}")

conn.close()
print(f"\nTabela somase_snapshots pronta — SOMASE exato por CPF+quinzena diretamente da planilha.")
