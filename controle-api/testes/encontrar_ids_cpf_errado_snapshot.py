import os, warnings, pandas as pd, psycopg2
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
    return df.dropna(subset=["id"])

df = bp("CONTROLE - VEXPENSES - JUNHO - 2026.xlsx")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur = conn.cursor()

total_diff = 0
for cpf in ["02013700008", "95417400068", "06274547983"]:
    ids = df[df["cpf"]==cpf]["id"].astype(int).tolist()

    # Buscar esses IDs no snapshot e verificar com qual CPF estão
    cur.execute("""
        SELECT id, value, user_cpf
        FROM prestacao_expense_snapshots
        WHERE id = ANY(%s) AND quinzena = '2026-06-2'
    """, (ids,))
    snap = {r[0]: (float(r[1]), r[2]) for r in cur.fetchall()}

    # IDs que estão no snapshot com CPF diferente
    cpf_errado = {eid: snap[eid] for eid in ids if eid in snap and snap[eid][1] != cpf}
    # IDs ausentes do snapshot
    ausentes = [eid for eid in ids if eid not in snap]

    print(f"\nCPF {cpf}: {len(ids)} IDs na planilha")
    if cpf_errado:
        val_err = sum(v for v, _ in cpf_errado.values())
        print(f"  No snapshot com CPF DIFERENTE: {len(cpf_errado)} IDs | R$ {val_err:,.2f}")
        for eid, (v, sc) in list(cpf_errado.items())[:5]:
            pv = float(df[df["id"]==eid]["valor"].iloc[0])
            print(f"    id={eid} val_plan={pv:.2f} snap_val={v:.2f} snap_cpf={sc}")
        # Corrigir: atualizar user_cpf para o CPF correto da planilha
        rows_fix = [(cpf, eid) for eid in cpf_errado]
        cur.executemany("""
            UPDATE prestacao_expense_snapshots
            SET user_cpf = %s
            WHERE id = %s AND quinzena = '2026-06-2'
        """, rows_fix)
        conn.commit()
        print(f"  → CORRIGIDO: {len(rows_fix)} IDs atualizados para cpf={cpf}")
        total_diff += val_err
    if ausentes:
        val_aus = float(df[df["id"].isin(ausentes)]["valor"].sum())
        print(f"  Ausentes do snapshot: {len(ausentes)} | R$ {val_aus:,.2f}")

# Verificar resultado final
cur.execute("""
    SELECT user_cpf, SUM(value) FROM prestacao_expense_snapshots
    WHERE quinzena='2026-06-2' AND user_cpf IN ('02013700008','95417400068','06274547983')
    GROUP BY user_cpf
""")
print(f"\nApós correção:")
for cpf, total in cur.fetchall():
    plan = float(df[df["cpf"]==cpf]["valor"].sum())
    print(f"  {cpf}: snap=R${float(total):,.2f}  plan=R${plan:,.2f}  diff={float(total)-plan:+,.2f}")

conn.close()
