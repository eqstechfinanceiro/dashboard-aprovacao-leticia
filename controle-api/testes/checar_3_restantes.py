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

for cpf in ["02013700008", "95417400068", "06274547983"]:
    ids = df[df["cpf"]==cpf]["id"].astype(int).tolist()
    plan_total = float(df[df["cpf"]==cpf]["valor"].sum())

    cur.execute(
        "SELECT id, value, user_cpf FROM prestacao_expense_snapshots WHERE id = ANY(%s) AND quinzena='2026-06-2'",
        (ids,)
    )
    snap_rows = cur.fetchall()
    snap_ids  = {r[0] for r in snap_rows}
    snap_total = sum(float(r[1]) for r in snap_rows)

    faltam = [i for i in ids if i not in snap_ids]
    val_faltam = float(df[df["id"].isin(faltam)]["valor"].sum())

    print(f"\nCPF {cpf}:")
    print(f"  planilha: {len(ids)} IDs | R$ {plan_total:,.2f}")
    print(f"  snapshot: {len(snap_ids)} IDs | R$ {snap_total:,.2f}")
    print(f"  diff: R$ {snap_total - plan_total:+,.2f}")
    faltam = [i for i in ids if i not in snap_ids]
    val_faltam = float(df[df["id"].isin(faltam)]["valor"].sum())
    if faltam:
        print(f"  IDs FALTANDO no snapshot: {len(faltam)} | R$ {val_faltam:,.2f}")
        for eid in faltam[:10]:
            rows_eid = df[df["id"]==eid]
            v = float(rows_eid["valor"].iloc[0]) if len(rows_eid) else 0
            cur.execute(
                "SELECT id, value, user_cpf FROM prestacao_expense_snapshots WHERE id=%s AND quinzena='2026-06-2'",
                (eid,)
            )
            r = cur.fetchone()
            if r:
                print(f"    id={eid} val_plan={v:.2f} → snapshot existe com cpf={r[2]} val={float(r[1]):.2f}")
            else:
                print(f"    id={eid} val_plan={v:.2f} → NÃO está no snapshot JUNHO!")
    else:
        # Verificar se algum está com CPF diferente na snapshot
        wrong_cpf = [(r[0], float(r[1]), r[2]) for r in snap_rows if str(r[2]).strip().zfill(11) != cpf]
        if wrong_cpf:
            print(f"  IDs com CPF ERRADO na snapshot: {len(wrong_cpf)}")
            for eid, v, sc in wrong_cpf[:5]:
                print(f"    id={eid} val={v:.2f} snap_cpf={sc}")

conn.close()
