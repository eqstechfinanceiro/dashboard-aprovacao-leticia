#!/usr/bin/env python3
"""
Compara o Δ(PRESTAÇÃO) real das planilhas com o calculado via API.

1ª QZ = CONTROLE MAIO  (fechamento 10/05)
2ª QZ = CONTROLE JUNHO (fechamento 25/05)
Δ real = PRESTACAO(2ªQZ) - PRESTACAO(1ªQZ) por CPF
Δ API  = expenses de reports aprovados entre 11/05 e 25/05 por approval_date
"""
import os
import warnings
import pandas as pd
from pathlib import Path
from dotenv import load_dotenv
import psycopg2

warnings.filterwarnings("ignore")

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")
NEON_URL = os.getenv("NEON_DATABASE_URL")


def load_prestacao(fname):
    f = BASE / "data" / fname
    df = pd.read_excel(f, sheet_name="PAINEL", header=10)
    df["CPF_str"] = df["CPF"].apply(
        lambda x: str(int(x)).zfill(11) if pd.notna(x) and str(x).strip() not in ("", "nan") else None
    )
    df = df[df["CPF_str"].notna()].copy()
    df["PRESTACAO"] = pd.to_numeric(df["(-) PRESTAÇÃO DE CONTAS"], errors="coerce").fillna(0)
    df["COLABORADOR"] = df["COLABORADOR"].astype(str)
    return df.set_index("CPF_str")[["PRESTACAO", "COLABORADOR"]]


print("=" * 72)
print("  COMPARAÇÃO Δ(PRESTAÇÃO): PLANILHAS vs API")
print("=" * 72)

p1 = load_prestacao("CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
p2 = load_prestacao("CONTROLE - VEXPENSES - JUNHO - 2026.xlsx")

total_1qz = p1["PRESTACAO"].sum()
total_2qz = p2["PRESTACAO"].sum()
delta_total_plan = total_2qz - total_1qz

print(f"\n1ª QZ MAIO  - {len(p1)} CPFs | PRESTACAO total: R$ {total_1qz:,.2f}")
print(f"2ª QZ JUNHO - {len(p2)} CPFs | PRESTACAO total: R$ {total_2qz:,.2f}")
print(f"Δ total PLANILHA:              R$ {delta_total_plan:,.2f}")

# Delta por CPF (planilha)
delta_plan = {}
all_cpfs = set(p1.index) | set(p2.index)
for cpf in all_cpfs:
    v1 = float(p1.loc[cpf, "PRESTACAO"]) if cpf in p1.index else 0.0
    v2 = float(p2.loc[cpf, "PRESTACAO"]) if cpf in p2.index else 0.0
    delta_plan[cpf] = v2 - v1

cpfs_com_delta = {cpf: d for cpf, d in delta_plan.items() if abs(d) > 0.01}
print(f"\nCPFs com Δ != 0 na planilha: {len(cpfs_com_delta)}")

# Delta por CPF (API)
conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor()
cur.execute("""
    SELECT r.user_cpf, r.user_name, SUM(e.value) as delta_api
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.status = 'APROVADO'
      AND (r.raw_data->>'approval_date')::timestamp >= '2026-05-11'
      AND (r.raw_data->>'approval_date')::timestamp < '2026-05-26'
    GROUP BY r.user_cpf, r.user_name
""")
delta_api = {cpf: {"nome": nome, "delta": float(v)} for cpf, nome, v in cur.fetchall()}
conn.close()

total_api = sum(v["delta"] for v in delta_api.values())
print(f"CPFs com Δ via API (11-25/05):  {len(delta_api)}")
print(f"Δ total API:                   R$ {total_api:,.2f}")
print(f"Δ total PLANILHA:              R$ {delta_total_plan:,.2f}")
print(f"Diferença (API - Planilha):    R$ {total_api - delta_total_plan:,.2f}")

# Comparação por CPF - maiores divergências
print("\n" + "=" * 72)
print("  TOP 15 DIVERGÊNCIAS POR CPF (|API - Planilha|)")
print("=" * 72)
print(f"{'Colaborador':<35} {'Δ Planilha':>14} {'Δ API':>13} {'Diff':>11}")
print("-" * 75)

todos_cpfs = set(cpfs_com_delta.keys()) | set(delta_api.keys())
diffs = []
for cpf in todos_cpfs:
    plan = cpfs_com_delta.get(cpf, 0.0)
    api = delta_api.get(cpf, {}).get("delta", 0.0)
    nome = delta_api.get(cpf, {}).get("nome") or (
        p1.loc[cpf, "COLABORADOR"] if cpf in p1.index else
        p2.loc[cpf, "COLABORADOR"] if cpf in p2.index else cpf
    )
    diffs.append((nome, plan, api, api - plan))

diffs.sort(key=lambda x: abs(x[3]), reverse=True)
for nome, plan, api, diff in diffs[:15]:
    print(f"{str(nome)[:35]:<35} R$ {plan:>11,.2f} R$ {api:>10,.2f} R$ {diff:>8,.2f}")

print("\n" + "=" * 72)
print("  RESUMO FINAL")
print("=" * 72)
print(f"  Δ total pela planilha (2ªQZ - 1ªQZ): R$ {delta_total_plan:,.2f}")
print(f"  Δ total pela API (approval_date):     R$ {total_api:,.2f}")
pct = (total_api / delta_total_plan * 100) if delta_total_plan != 0 else 0
print(f"  Match:                                {pct:.1f}%")
