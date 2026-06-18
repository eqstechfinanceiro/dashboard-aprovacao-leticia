#!/usr/bin/env python3
"""Extrair valor de prestação da 2ª QZ de maio 2026 - CORRIGIDO"""
import pandas as pd
from pathlib import Path

BASE = Path(__file__).parent.parent
CONTROLE_FILE = BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"

print("=" * 80)
print("  EXTRAÇÃO PRESTAÇÃO - 2ª QZ MAIO 2026 (CORRIGIDO)")
print("=" * 80)

# Ler aba QUINZENAS pulando as primeiras linhas e usando a linha 2 como header
df = pd.read_excel(CONTROLE_FILE, sheet_name='QUINZENAS', header=2)

print(f"  Total de registros: {len(df)}")
print(f"  Colunas: {list(df.columns)}")

# Limpar nomes das colunas
df.columns = [str(c).strip().upper() for c in df.columns]
print(f"  Colunas limpas: {list(df.columns)}")

# Mostrar amostra
print("\n  Amostra de dados (primeiras 10 linhas):")
print(df.head(10).to_string())

# Verificar valores únicos
print("\n  Valores únicos em QUINZENA:", df['QUINZENA'].dropna().unique()[:10] if 'QUINZENA' in df.columns else 'N/A')
print("  Valores únicos em MÊS:", df['MÊS'].dropna().unique()[:10] if 'MÊS' in df.columns else 'N/A')

# Filtrar para 2ª QZ de maio 2026
if all(col in df.columns for col in ['QUINZENA', 'MÊS', 'ANO', 'VALOR']):
    df['ANO'] = pd.to_numeric(df['ANO'], errors='coerce')
    df['VALOR'] = pd.to_numeric(df['VALOR'], errors='coerce')
    
    filtro = (
        (df['QUINZENA'].astype(str).str.contains('2ª', na=False, case=False)) &
        (df['MÊS'].astype(str).str.contains('MAIO', na=False, case=False)) &
        (df['ANO'] == 2026)
    )
    
    df_filtrado = df[filtro].copy()
    print(f"\n  Registros 2ª QZ MAIO 2026: {len(df_filtrado)}")
    
    if len(df_filtrado) > 0:
        total = df_filtrado['VALOR'].sum()
        
        print(f"\n  ✅ Total PRESTAÇÃO (2ª QZ MAIO 2026): R$ {total:,.2f}")
        print(f"\n  Detalhamento (top 20):")
        df_sorted = df_filtrado.sort_values('VALOR', ascending=False)
        for _, row in df_sorted.head(20).iterrows():
            nome = str(row.get('COLABORADOR', 'N/A'))[:35]
            valor = row['VALOR']
            print(f"    {nome:<35} R$ {valor:>10,.2f}")
        
        # Comparação com API
        print("\n" + "=" * 80)
        print("  COMPARAÇÃO COM API")
        print("=" * 80)
        api_report = 205793.25
        api_expense = 124078.05
        
        print(f"  CONTROLE (planilha):   R$ {total:,.2f}")
        print(f"  API (report date):     R$ {api_report:,.2f}")
        print(f"  API (expense date):    R$ {api_expense:,.2f}")
        
        dif_report = abs(total - api_report)
        pct_report = (dif_report / total * 100) if total > 0 else 0
        
        dif_expense = abs(total - api_expense)
        pct_expense = (dif_expense / total * 100) if total > 0 else 0
        
        print(f"\n  Diferença vs API (report):  R$ {dif_report:,.2f} ({pct_report:.1f}%)")
        print(f"  Diferença vs API (expense): R$ {dif_expense:,.2f} ({pct_expense:.1f}%)")
        
        if pct_report < 10:
            print("\n  ✅ API (report date) DENTRO DA MARGEM")
        else:
            print("\n  ⚠️ DIFERENÇA SIGNIFICATIVA")
            
        if pct_expense < 10:
            print("  ✅ API (expense date) DENTRO DA MARGEM")
        else:
            print("  ⚠️ DIFERENÇA SIGNIFICATIVA com expense date")
            print("\n  NOTA: A diferença pode ser devido a:")
            print("  - Expenses com data diferente da data de aprovação do report")
            print("  - Reports aprovados em datas diferentes das despesas")
            print("  - A planilha CONTROLE pode usar outro critério de data")
    else:
        print("\n  ⚠️ Nenhum registro encontrado para 2ª QZ MAIO 2026")
        print("  Verificando quinzenas disponíveis para MAIO 2026:")
        df_maior = df[df['MÊS'].astype(str).str.contains('MAIO', na=False, case=False)]
        print(f"  Total MAIO 2026: {len(df_maior)}")
        if len(df_maior) > 0:
            print(df_maior['QUINZENA'].value_counts())
else:
    print("\n  ⚠️ Colunas necessárias não encontradas")
    print("  Colunas disponíveis:", list(df.columns))

print("=" * 80)
