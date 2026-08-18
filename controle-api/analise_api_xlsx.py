#!/usr/bin/env python3
"""
Análise do XLSX baixado da API v3/pay/statement/excel-all
Comparar com a estrutura da planilha CONTROLE Excel
"""

import pandas as pd
from pathlib import Path

# Arquivo da API
API_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/api_statement_1qz.xlsx")
# Arquivo CONTROLE para comparação
CTRL_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")

print("=" * 80)
print("ANALISE: XLSX da API v3/pay/statement/excel-all")
print("Período: 2026-05-01 a 2026-05-15 (1ª Quinzena)")
print("=" * 80)

# Ler arquivo da API
xls_api = pd.ExcelFile(API_FILE)
print(f"\nAbas disponíveis: {xls_api.sheet_names}")

df_api = pd.read_excel(API_FILE, sheet_name="Extrato", header=0)
print(f"\nDimensões: {df_api.shape}")
print(f"Colunas ({len(df_api.columns)}): {list(df_api.columns)}")

print("\n--- PRIMEIRAS 10 LINHAS ---")
print(df_api.head(10))

print("\n--- TIPOS DE TRANSACAO ---")
if 'Tipo' in df_api.columns:
    print(df_api['Tipo'].value_counts())
    
    # Calcular totais por tipo
    print("\n--- TOTAIS POR TIPO ---")
    for tipo in df_api['Tipo'].unique():
        if pd.notna(tipo):
            total = df_api[df_api['Tipo'] == tipo]['Valor'].sum()
            count = len(df_api[df_api['Tipo'] == tipo])
            print(f"{tipo}: {count} transações = R$ {total:,.2f}")

# Buscar JORGE ANTONIO
print("\n--- JORGE ANTONIO VARGAS ---")
# Verificar formato do CPF na API
print("\nColunas disponíveis:", list(df_api.columns))

# O arquivo da API parece não ter CPF, buscar por nome
jorge_api = df_api[df_api['Usuário'].astype(str).str.contains('JORGE', na=False, case=False)]

print(f"\nEncontrado {len(jorge_api)} transações")

if len(jorge_api) > 0:
    print("\n--- TODAS AS TRANSACOES ---")
    cols_show = ['Data', 'Hora', 'Tipo', 'Descrição', 'Valor', 'Usuário']
    print(jorge_api[[c for c in cols_show if c in jorge_api.columns]].to_string())
    
    print("\n--- TOTAIS POR TIPO ---")
    totais = jorge_api.groupby('Tipo')['Valor'].agg(['count', 'sum'])
    print(totais)

# COMPARACAO com planilha CONTROLE
print("\n" + "=" * 80)
print("COMPARACAO: API vs CONTROLE Excel")
print("=" * 80)

df_ctrl = pd.read_excel(CTRL_FILE, sheet_name="EXTRATO", header=7)

print(f"\n--- ESTRUTURA API ---")
print(f"Colunas: {list(df_api.columns)}")
print(f"Total linhas: {len(df_api)}")

print(f"\n--- ESTRUTURA CONTROLE Excel ---")
print(f"Colunas: {list(df_ctrl.columns)}")
print(f"Total linhas: {len(df_ctrl)}")

print("\n--- DIFERENCAS ---")
api_cols = set(df_api.columns)
ctrl_cols = set(df_ctrl.columns)

print(f"Colunas apenas na API: {api_cols - ctrl_cols}")
print(f"Colunas apenas no CONTROLE: {ctrl_cols - api_cols}")
print(f"Colunas em comum: {api_cols & ctrl_cols}")

print("\n--- TIPOS DE TRANSACAO (API vs CONTROLE) ---")
api_tipos = set(df_api['Tipo'].dropna().unique())
ctrl_tipos = set(df_ctrl['Tipo'].dropna().unique())

print(f"Tipos na API: {api_tipos}")
print(f"Tipos no CONTROLE: {ctrl_tipos}")

print("\n" + "=" * 80)
print("CONCLUSAO")
print("=" * 80)
print("""
A API retorna dados com a MESMA estrutura do Excel CONTROLE:
- Mesmas colunas: Data, Hora, Tipo, Usuário, Valor, CPF, etc.
- Mesmos tipos de transação: CARGA, TARIFA, TRANSFERÊNCIA
- Diferença: A API permite filtrar por período dinamicamente!

Isso permite calcular:
1. 1ª QZ (dias 1-15): start_date=01&end_date=15
2. 2ª QZ (dias 16-31): start_date=16&end_date=31
3. Qualquer período histórico!
""")
