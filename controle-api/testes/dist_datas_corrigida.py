#!/usr/bin/env python3
"""
Distribuicao corrigida das datas das linhas novas/removidas na BASE PREST.
col3 contém número serial Excel como string → converter corretamente.
"""
import pandas as pd
import warnings
from pathlib import Path
from datetime import date

warnings.filterwarnings("ignore")
BASE = Path(__file__).parent.parent
EXCEL_EPOCH = date(1899, 12, 30)


def serial_to_date(val):
    try:
        n = int(float(str(val)))
        if n > 1000:
            return (pd.Timestamp(EXCEL_EPOCH) + pd.Timedelta(days=n)).strftime("%Y-%m")
        return "invalid"
    except Exception:
        return "invalid"


def load_bp(fname):
    f = BASE / "data" / fname
    df = pd.read_excel(f, sheet_name="BASE PREST ", header=2)
    df.columns = [f"col{i}" for i in range(len(df.columns))]
    df["id_despesa"] = pd.to_numeric(df["col0"], errors="coerce")
    df["data_ym"] = df["col3"].apply(serial_to_date)
    df["cpf"] = df["col9"].astype(str).str.strip().str.zfill(11)
    df["valor"] = pd.to_numeric(df["col26"], errors="coerce").fillna(0)
    return df[["id_despesa", "data_ym", "cpf", "valor"]].dropna(subset=["id_despesa"])


print("Carregando BASE PREST...")
bp_maio = load_bp("CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
bp_junho = load_bp("CONTROLE - VEXPENSES - JUNHO - 2026.xlsx")

ids_maio = set(bp_maio["id_despesa"].astype(int))
ids_junho = set(bp_junho["id_despesa"].astype(int))
ids_novos = ids_junho - ids_maio
ids_removidos = ids_maio - ids_junho

df_novos = bp_junho[bp_junho["id_despesa"].astype(int).isin(ids_novos)].copy()
df_removidos = bp_maio[bp_maio["id_despesa"].astype(int).isin(ids_removidos)].copy()

print(f"Linhas novas:    {len(df_novos):,} | Total: R$ {df_novos['valor'].sum():,.2f}")
print(f"Linhas removidas:{len(df_removidos):,} | Total: R$ {df_removidos['valor'].sum():,.2f}")
print(f"Delta liquido:   R$ {df_novos['valor'].sum() - df_removidos['valor'].sum():,.2f}")
print(f"Delta SOMASE:    R$ 486,648.70")

print("\n=== DESPESAS NOVAS — por ANO-MES da despesa (serial convertido) ===")
g = df_novos.groupby("data_ym").agg(qtd=("valor", "count"), total=("valor", "sum"))
for ym, row in g.sort_index().iterrows():
    print(f"  {ym}: {int(row['qtd']):5d} | R$ {row['total']:>12,.2f}")

print("\n=== DESPESAS REMOVIDAS — por ANO-MES da despesa ===")
g2 = df_removidos.groupby("data_ym").agg(qtd=("valor", "count"), total=("valor", "sum"))
for ym, row in g2.sort_index().iterrows():
    print(f"  {ym}: {int(row['qtd']):5d} | R$ {row['total']:>12,.2f}")

# Conclusao
print("\n" + "=" * 60)
print("CONCLUSAO:")
print(f"  Novas entries abrangem datas de: {df_novos['data_ym'][df_novos['data_ym']!='invalid'].min()} a {df_novos['data_ym'][df_novos['data_ym']!='invalid'].max()}")
print(f"  Removidas abrangem datas de: {df_removidos['data_ym'][df_removidos['data_ym']!='invalid'].min()} a {df_removidos['data_ym'][df_removidos['data_ym']!='invalid'].max()}")
print()
print("  A BASE PREST NAO filtra por periodo de data da despesa.")
print("  Contem TODOS os expenses aprovados, de qualquer data.")
print("  O delta entre quinzenas = expenses de reports recém-aprovados")
print("  MENOS expenses de reports corrigidos/cancelados entre fechamentos.")
