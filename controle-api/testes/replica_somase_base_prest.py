#!/usr/bin/env python3
"""
Replica exatamente a formula SOMASE da planilha:
=SOMASE('BASE PREST'!J:J; [@CPF]; 'BASE PREST'!AA:AA)
  J:J  = coluna 9  = CPF/CNPJ
  AA:AA = coluna 26 = Valor

Calcula por CPF para 1ª QZ (MAIO) e 2ª QZ (JUNHO),
compara com PAINEL, e identifica o delta real.
"""
import pandas as pd
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
BASE = Path(__file__).parent.parent


def somase_por_cpf(fname):
    """Retorna dict cpf -> soma de Valor na BASE PREST."""
    f = BASE / "data" / fname
    df = pd.read_excel(f, sheet_name="BASE PREST ", header=2)
    # Coluna 9 = CPF/CNPJ, coluna 26 = Valor
    cpf_col = df.columns[9]   # 'CPF/CNPJ'
    val_col = df.columns[26]  # 'Valor'
    df["_cpf"] = df[cpf_col].astype(str).str.strip().str.zfill(11)
    df["_val"] = pd.to_numeric(df[val_col], errors="coerce").fillna(0)
    resultado = df.groupby("_cpf")["_val"].sum()
    return resultado


def load_painel(fname):
    f = BASE / "data" / fname
    df = pd.read_excel(f, sheet_name="PAINEL", header=10)
    df["CPF_str"] = df["CPF"].apply(
        lambda x: str(int(x)).zfill(11) if pd.notna(x) and str(x).strip() not in ("", "nan") else None
    )
    df = df[df["CPF_str"].notna()].copy()
    df["PRESTACAO"] = pd.to_numeric(df["(-) PRESTAÇÃO DE CONTAS"], errors="coerce").fillna(0)
    return df.set_index("CPF_str")[["PRESTACAO", "COLABORADOR"]]


print("=" * 72)
print("  REPLICA SOMASE: BASE PREST x PAINEL")
print("=" * 72)

# Calcular SOMASE para cada quinzena
print("\nCalculando SOMASE da 1ª QZ (MAIO)...")
s1 = somase_por_cpf("CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
print(f"  Total geral: R$ {s1.sum():,.2f} | CPFs únicos: {len(s1)}")

print("Calculando SOMASE da 2ª QZ (JUNHO)...")
s2 = somase_por_cpf("CONTROLE - VEXPENSES - JUNHO - 2026.xlsx")
print(f"  Total geral: R$ {s2.sum():,.2f} | CPFs únicos: {len(s2)}")

# Carregar PAINEL de ambos
p1 = load_painel("CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
p2 = load_painel("CONTROLE - VEXPENSES - JUNHO - 2026.xlsx")

print("\n" + "=" * 72)
print("  VALIDAÇÃO: SOMASE == PAINEL (por CPF)")
print("=" * 72)

# Comparar SOMASE com PAINEL para 1ª QZ
erros_1 = []
for cpf in p1.index:
    prest_painel = float(p1.loc[cpf, "PRESTACAO"])
    prest_somase = float(s1.get(cpf, 0))
    diff = abs(prest_painel - prest_somase)
    if diff > 0.02:
        erros_1.append((cpf, str(p1.loc[cpf, "COLABORADOR"]), prest_painel, prest_somase, diff))

print(f"\n1ª QZ: {len(erros_1)} divergências entre PAINEL e SOMASE (de {len(p1)} CPFs)")
if erros_1:
    erros_1.sort(key=lambda x: -x[4])
    for cpf, nome, plan, soma, diff in erros_1[:5]:
        print(f"  {nome[:40]}: Painel={plan:,.2f} | SOMASE={soma:,.2f} | diff={diff:,.2f}")

erros_2 = []
for cpf in p2.index:
    prest_painel = float(p2.loc[cpf, "PRESTACAO"])
    prest_somase = float(s2.get(cpf, 0))
    diff = abs(prest_painel - prest_somase)
    if diff > 0.02:
        erros_2.append((cpf, str(p2.loc[cpf, "COLABORADOR"]), prest_painel, prest_somase, diff))

print(f"2ª QZ: {len(erros_2)} divergências entre PAINEL e SOMASE (de {len(p2)} CPFs)")
if erros_2:
    erros_2.sort(key=lambda x: -x[4])
    for cpf, nome, plan, soma, diff in erros_2[:5]:
        print(f"  {nome[:40]}: Painel={plan:,.2f} | SOMASE={soma:,.2f} | diff={diff:,.2f}")

print("\n" + "=" * 72)
print("  DELTA REAL: SOMASE 2ª QZ - SOMASE 1ª QZ")
print("=" * 72)

# Delta por CPF via SOMASE
todos_cpfs = set(s1.index) | set(s2.index)
delta_somase = {}
for cpf in todos_cpfs:
    v1 = float(s1.get(cpf, 0))
    v2 = float(s2.get(cpf, 0))
    d = v2 - v1
    if abs(d) > 0.01:
        nome = str(p1.loc[cpf, "COLABORADOR"]) if cpf in p1.index else str(p2.loc[cpf, "COLABORADOR"]) if cpf in p2.index else cpf
        delta_somase[cpf] = {"nome": nome, "v1": v1, "v2": v2, "delta": d}

delta_total = sum(v["delta"] for v in delta_somase.values())
print(f"\n  Total SOMASE 1ª QZ: R$ {s1.sum():,.2f}")
print(f"  Total SOMASE 2ª QZ: R$ {s2.sum():,.2f}")
print(f"  Δ SOMASE (2ª - 1ª): R$ {delta_total:,.2f}")
print(f"  Δ PAINEL (2ª - 1ª): R$ {float(p2['PRESTACAO'].sum()) - float(p1['PRESTACAO'].sum()):,.2f}")
print(f"  Linhas BASE PREST MAIO:  60.317")
print(f"  Linhas BASE PREST JUNHO: 66.019")
print(f"  Novas linhas no JUNHO:   5.702")

print("\n  Top 10 CPFs com maior Δ SOMASE:")
print(f"  {'Colaborador':<38} {'SOMASE 1QZ':>14} {'SOMASE 2QZ':>14} {'Delta':>12}")
print("  " + "-" * 80)
sorted_delta = sorted(delta_somase.values(), key=lambda x: -x["delta"])
for v in sorted_delta[:10]:
    print(f"  {v['nome'][:38]:<38} R$ {v['v1']:>11,.2f} R$ {v['v2']:>11,.2f} R$ {v['delta']:>9,.2f}")

print("\n  Top 5 CPFs com Δ NEGATIVO (diminuiu):")
negativos = sorted([v for v in delta_somase.values() if v["delta"] < 0], key=lambda x: x["delta"])
for v in negativos[:5]:
    print(f"  {v['nome'][:38]:<38} R$ {v['v1']:>11,.2f} R$ {v['v2']:>11,.2f} R$ {v['delta']:>9,.2f}")
