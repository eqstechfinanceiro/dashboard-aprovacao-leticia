#!/usr/bin/env python3
import pandas as pd
from pathlib import Path

DATA_DIR = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data")

# Analisar CARGA QZ
print("=" * 80)
print("ANALISE: CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")
print("=" * 80)

file = DATA_DIR / "CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx"
df = pd.read_excel(file, sheet_name="Planilha1", header=5)
print(f"\nDimensoes: {df.shape}")
print(f"Colunas: {list(df.columns)}")

print("\n--- PRIMEIRAS 5 LINHAS ---")
print(df.head())

print("\n--- JORGE ANTONIO VARGAS ---")
jorge = df[df['COLABORADOR'].astype(str).str.contains('JORGE', na=False, case=False)]
if len(jorge) > 0:
    cols = ['COLABORADOR', 'CPF', 'SALDO REEMBOLSAR', 'SALDO FINAL', 'SALDO CARTAO', 'CARGA PARCIAL', 'REEMBOLSO', 'Carga Final ']
    cols = [c for c in cols if c in jorge.columns]
    print(jorge[cols].to_string())

# Analisar CONTROLE - EXTRATO
print("\n" + "=" * 80)
print("ANALISE: CONTROLE - EXTRATO")
print("=" * 80)

file2 = DATA_DIR / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"
df_ext = pd.read_excel(file2, sheet_name="EXTRATO", header=7)
print(f"\nDimensoes EXTRATO: {df_ext.shape}")
print(f"Colunas: {list(df_ext.columns)}")

print("\n--- TIPOS DE TRANSACAO ---")
if 'TIPO' in df_ext.columns:
    print(df_ext['TIPO'].value_counts())
elif 'Tipo' in df_ext.columns:
    print(df_ext['Tipo'].value_counts())

print("\n--- PRIMEIRAS 10 LINHAS ---")
print(df_ext.head(10))

# Buscar JORGE ANTONIO no EXTRATO
print("\n--- JORGE ANTONIO NO EXTRATO ---")
cpf_col = 'CPF' if 'CPF' in df_ext.columns else 'cpf'
if cpf_col in df_ext.columns:
    jorge_ext = df_ext[df_ext[cpf_col].astype(str).str.contains('01063690080', na=False)]
    if len(jorge_ext) > 0:
        print(f"Encontrado {len(jorge_ext)} transacoes")
        print(jorge_ext.head(20))
        
        # Calcular totais por tipo
        tipo_col = 'TIPO' if 'TIPO' in df_ext.columns else 'Tipo'
        valor_col = 'VALOR' if 'VALOR' in df_ext.columns else 'Valor'
        if tipo_col in jorge_ext.columns and valor_col in jorge_ext.columns:
            print(f"\n--- TOTAIS POR TIPO ---")
            print(jorge_ext.groupby(tipo_col)[valor_col].sum())
    else:
        print("CPF nao encontrado")

print("\n" + "=" * 80)
print("Analise concluida!")
print("=" * 80)
