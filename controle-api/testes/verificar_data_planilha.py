#!/usr/bin/env python3
"""Verificar como a planilha calcula a data para filtrar quinzenas"""
import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta

BASE = Path(__file__).parent.parent
CONTROLE_FILE = BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"

print("=" * 80)
print("  VERIFICAÇÃO DA DATA NA PLANILHA")
print("=" * 80)

# Ler planilha
df = pd.read_excel(CONTROLE_FILE, sheet_name='QUINZENAS', header=3)
df['VALOR'] = pd.to_numeric(df['VALOR'], errors='coerce')
df['ANO'] = pd.to_numeric(df['ANO'], errors='coerce')

# Converter DATA de número serial Excel para data
# O número 45819 corresponde a uma data específica
print("\n1. Análise da coluna DATA:")
print("   Amostra de valores na coluna DATA:")
amostra = df[df['DATA'].notna()]['DATA'].head(10)
for val in amostra:
    print(f"   {val} (tipo: {type(val).__name__})")

# Tentar converter de número serial Excel para data
# Excel: 1 = 01/01/1900 (com exceção do bug do ano bissexto)
print("\n2. Convertendo número serial Excel para data:")
def excel_to_date(serial):
    """Converte número serial Excel para data Python"""
    if pd.isna(serial):
        return None
    try:
        # Excel conta a partir de 30/12/1899 (com bug do ano bissexto)
        base_date = datetime(1899, 12, 30)
        return base_date + timedelta(days=int(serial))
    except:
        return None

# Testar conversão
for val in [45819, 45820, 45834]:
    data_convertida = excel_to_date(val)
    print(f"   {val} -> {data_convertida}")

# Aplicar conversão na coluna DATA
df['DATA_CONVERTIDA'] = df['DATA'].apply(excel_to_date)

# Mostrar amostra com data convertida
print("\n3. Amostra com DATA convertida:")
amostra = df[['COLABORADOR', 'QUINZENA', 'MÊS', 'ANO', 'DATA', 'DATA_CONVERTIDA', 'VALOR']].head(20)
for _, row in amostra.iterrows():
    print(f"   {row['COLABORADOR'][:30]:<30} QZ:{row['QUINZENA']:<6} "
          f"DATA:{str(row['DATA_CONVERTIDA']):<12} VALOR:R$ {row['VALOR']:>10,.2f}")

# Filtrar para maio 2026
print("\n4. Filtrando para 2ª QZ de MAIO 2026:")
df_maio = df[
    (df['MÊS'].astype(str).str.contains('MAIO', na=False, case=False)) &
    (df['ANO'] == 2026)
].copy()

print(f"   Total registros MAIO 2026: {len(df_maio)}")

# Verificar distribuição por quinzena
print("\n   Distribuição por quinzena:")
for qz in ['1ª QZ', '2ª QZ']:
    df_qz = df_maio[df_maio['QUINZENA'].astype(str).str.contains(qz, na=False, case=False)]
    if len(df_qz) > 0:
        print(f"   {qz}: {len(df_qz)} registros")
        print(f"      Primeira data: {df_qz['DATA_CONVERTIDA'].min()}")
        print(f"      Última data: {df_qz['DATA_CONVERTIDA'].max()}")
        print(f"      Total: R$ {df_qz['VALOR'].sum():,.2f}")

# Verificar datas específicas para 2ª QZ
print("\n5. Análise de datas para 2ª QZ:")
df_2qz = df_maio[df_maio['QUINZENA'].astype(str).str.contains('2ª', na=False, case=False)]
if len(df_2qz) > 0:
    print("   Distribuição de datas:")
    print(df_2qz['DATA_CONVERTIDA'].value_counts().sort_index().head(20))

print("=" * 80)
