#!/usr/bin/env python3
"""
Investigar casos específicos de divergência entre planilha e API.
- GUILHERME FORTKAMP: Δ planilha=0, Δ API=373k
- BRUNO FERREIRA: Δ planilha=-33k, Δ API=+2k
"""
import pandas as pd
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
BASE = Path(__file__).parent.parent

CASOS = {
    "07568146936": "GUILHERME FORTKAMP",
    "16306431730": "BRUNO FERREIRA",
    "02027745203": "ABNER (controle)",
}

for label, fname in [
    ("1QZ_MAIO", "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"),
    ("2QZ_JUNHO", "CONTROLE - VEXPENSES - JUNHO - 2026.xlsx"),
]:
    f = BASE / "data" / fname
    df = pd.read_excel(f, sheet_name="PAINEL", header=10)
    df["CPF_str"] = df["CPF"].apply(
        lambda x: str(int(x)).zfill(11) if pd.notna(x) and str(x).strip() not in ("", "nan") else None
    )
    print(f"\n{'=' * 60}")
    print(f"  {label}  |  {fname[:40]}")
    print(f"{'=' * 60}")
    for cpf, nome in CASOS.items():
        row = df[df["CPF_str"] == cpf]
        if len(row):
            r = row.iloc[0]
            prest = r["(-) PRESTAÇÃO DE CONTAS"]
            carga = r["CARGA"]
            transf = r["TRANSFERENCIA"]
            tarifa = r["(-) TARIFA"]
            saldo_prest = r["SALDO PRESTAÇÃO"]
            saldo_final = r["SALDO FINAL"]
            print(f"\n  {nome} ({cpf}):")
            print(f"    PRESTACAO:      R$ {float(prest):>14,.2f}")
            print(f"    CARGA:          R$ {float(carga):>14,.2f}")
            print(f"    TRANSFERENCIA:  R$ {float(transf):>14,.2f}")
            print(f"    TARIFA:         R$ {float(tarifa):>14,.2f}")
            print(f"    SALDO PRESTAÇÃO:R$ {float(saldo_prest):>14,.2f}")
            print(f"    SALDO FINAL:    R$ {float(saldo_final):>14,.2f}")
        else:
            print(f"\n  {nome} ({cpf}): NAO ENCONTRADO")

# Agora verificar a BASE PREST da planilha JUNHO para GUILHERME
print("\n\n" + "=" * 60)
print("  BASE PREST do CONTROLE JUNHO - amostra GUILHERME")
print("=" * 60)
f = BASE / "data" / "CONTROLE - VEXPENSES - JUNHO - 2026.xlsx"
# Ler BASE PREST sem header para ver estrutura
df_bp = pd.read_excel(f, sheet_name="BASE PREST ", header=None, nrows=5)
print("Primeiras 5 linhas (raw):")
for i, row in df_bp.iterrows():
    vals = [v for v in row if not (isinstance(v, float) and str(v) == "nan")]
    print(f"  Linha {i}: {vals[:15]}")

# Ler com header correto
df_bp2 = pd.read_excel(f, sheet_name="BASE PREST ", header=1)
print(f"\nColunas BASE PREST: {list(df_bp2.columns[:15])}")
print(f"Total linhas: {len(df_bp2)}")
