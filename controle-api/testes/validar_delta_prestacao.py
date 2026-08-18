#!/usr/bin/env python3
"""
Validar Δ(PRESTAÇÃO) comparando:
- Planilha CONTROLE MAIO (2ª QZ): coluna (-) PRESTAÇÃO DE CONTAS por CPF
- Planilha CARGA 1ª QZ MAIO: precisamos do SALDO PRESTAÇÃO como âncora

O Δ(PRESTAÇÃO) real da planilha = PRESTAÇÃO(2ª QZ) - PRESTAÇÃO(1ª QZ)
mas a planilha não guarda o PRESTAÇÃO da 1ª QZ separado.

Alternativa: usar a CARGA 1ª QZ para reconstruir PRESTAÇÃO(1ª QZ):
SALDO PRESTAÇÃO = CARGA + TRANSFERENCIA + TARIFA - PRESTAÇÃO
→ PRESTAÇÃO = CARGA + TRANSFERENCIA + TARIFA - SALDO PRESTAÇÃO
E SALDO PRESTAÇÃO(1ª QZ) = SALDO FINAL(1ª QZ) + SALDO CARTAO(1ª QZ)
"""
import os
import pandas as pd
from pathlib import Path
from dotenv import load_dotenv
import psycopg2

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")
NEON_URL = os.getenv("NEON_DATABASE_URL")

CONTROLE_MAIO = BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"
CARGA_1QZ_FILE = BASE / "data" / "CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx"
CARGA_2QZ_FILE = BASE / "data" / "CARGA 2 QZ MAIO 26 VEXPENSES EQS (1).xlsx"

print("=" * 80)
print("  VALIDAÇÃO Δ(PRESTAÇÃO) VIA ÂNCORA")
print("=" * 80)

# 1. Ler PAINEL do CONTROLE 2ª QZ - estado atual (acumulado até 25/05)
df_painel = pd.read_excel(CONTROLE_MAIO, sheet_name='PAINEL', header=10)
df_painel['CPF_str'] = df_painel['CPF'].apply(
    lambda x: str(int(x)).zfill(11) if pd.notna(x) and x not in ('', None) else None
)
df_painel = df_painel[df_painel['CPF_str'].notna()].copy()

print(f"\n1. PAINEL carregado: {len(df_painel)} colaboradores")
print(f"   Total PRESTAÇÃO 2ª QZ: R$ {df_painel['(-) PRESTAÇÃO DE CONTAS'].sum():,.2f}")
print(f"   Total CARGA 2ª QZ:     R$ {df_painel['CARGA'].sum():,.2f}")
print(f"   Total SALDO FINAL 2ª QZ: R$ {pd.to_numeric(df_painel['SALDO FINAL'], errors='coerce').sum():,.2f}")

# 2. Ler CARGA 1ª QZ para ter os valores âncora
# Header na linha 2 (índice 2)
df_carga1 = pd.read_excel(CARGA_1QZ_FILE, header=2)
print(f"\n2. CARGA 1ª QZ carregada: {df_carga1.shape}")
print(f"   Colunas: {list(df_carga1.columns)}")

# Mostrar amostra para mapear colunas
print("\n   Amostra (ABNER):")
abner = df_carga1[df_carga1.iloc[:, 1].astype(str).str.contains('ABNER', na=False)]
if len(abner) > 0:
    for i, (col, val) in enumerate(abner.iloc[0].items()):
        print(f"   [{i:2d}] {col!r}: {val}")

# 3. Ler CARGA 2ª QZ
df_carga2 = pd.read_excel(CARGA_2QZ_FILE, sheet_name='2 QZ DE MAIO 26', header=2)
print(f"\n3. CARGA 2ª QZ carregada: {df_carga2.shape}")
print(f"   Colunas: {list(df_carga2.columns)}")

print("\n   Amostra (ABNER):")
abner2 = df_carga2[df_carga2.iloc[:, 1].astype(str).str.contains('ABNER', na=False)]
if len(abner2) > 0:
    for i, (col, val) in enumerate(abner2.iloc[0].items()):
        print(f"   [{i:2d}] {col!r}: {val}")
