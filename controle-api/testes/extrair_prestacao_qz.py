#!/usr/bin/env python3
"""Extrair valor de prestação da 2ª QZ de maio 2026 da planilha CONTROLE"""
import pandas as pd
from pathlib import Path

BASE = Path(__file__).parent.parent
CONTROLE_FILE = BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"

print("=" * 80)
print("  EXTRAÇÃO PRESTAÇÃO - 2ª QZ MAIO 2026")
print("=" * 80)

# Ler aba QUINZENAS
df = pd.read_excel(CONTROLE_FILE, sheet_name='QUINZENAS')

# Limpar e preparar dados
# A aba tem: COLABORADOR, CPF, VALOR, QUINZENA, DATA, MÊS, ANO, REGIONAL, OBSERVAÇÃO
print(f"\n  Total de registros: {len(df)}")
print(f"  Colunas: {list(df.columns)}")

# Mostrar amostra
print("\n  Amostra de dados:")
print(df.head(10).to_string())

# Filtrar para maio 2026 e 2ª QZ
# Coluna QUINZENA deve conter '2ª QZ' ou similar
# Coluna MÊS deve ser 'MAIO'
# Coluna ANO deve ser 2026

print("\n  Valores únicos em QUINZENA:", df['QUINZENA'].unique() if 'QUINZENA' in df.columns else 'N/A')
print("  Valores únicos em MÊS:", df['MÊS'].unique() if 'MÊS' in df.columns else 'N/A')
print("  Valores únicos em ANO:", df['ANO'].unique() if 'ANO' in df.columns else 'N/A')

# Tentar filtrar
if all(col in df.columns for col in ['QUINZENA', 'MÊS', 'ANO', 'VALOR']):
    # Converter ANO para numérico se necessário
    df['ANO'] = pd.to_numeric(df['ANO'], errors='coerce')
    
    filtro = (
        (df['QUINZENA'].str.contains('2ª', na=False, case=False)) &
        (df['MÊS'].str.contains('MAIO', na=False, case=False)) &
        (df['ANO'] == 2026)
    )
    
    df_filtrado = df[filtro]
    print(f"\n  Registros 2ª QZ MAIO 2026: {len(df_filtrado)}")
    
    if len(df_filtrado) > 0:
        # Converter VALOR para numérico
        df_filtrado['VALOR_NUM'] = pd.to_numeric(df_filtrado['VALOR'], errors='coerce')
        total = df_filtrado['VALOR_NUM'].sum()
        
        print(f"\n  Total PRESTAÇÃO (2ª QZ MAIO 2026): R$ {total:,.2f}")
        print(f"\n  Detalhamento:")
        for _, row in df_filtrado.iterrows():
            print(f"    {row['COLABORADOR']:<40} R$ {row['VALOR_NUM']:>10,.2f}")
        
        print("\n" + "=" * 80)
        print("  COMPARAÇÃO COM API")
        print("=" * 80)
        print(f"  CONTROLE (planilha): R$ {total:,.2f}")
        print(f"  API (report date):   R$ 205,793.25")
        print(f"  API (expense date):  R$ 124,078.05")
        
        diferenca = abs(total - 205793.25)
        pct = (diferenca / total * 100) if total > 0 else 0
        print(f"\n  Diferença vs API (report): R$ {diferenca:,.2f} ({pct:.1f}%)")
        
        if pct < 10:
            print("  ✅ DENTRO DA MARGEM DE ERRO (< 10%)")
        else:
            print("  ⚠️ DIFERENÇA SIGNIFICATIVA (> 10%)")
            print("\n  Possíveis causas:")
            print("  - Diferença entre 'data do report' e 'data do expense'")
            print("  - Expenses em reports aprovados fora do período de criação")
            print("  - Reports com status diferente de APROVADO na planilha")
            
else:
    print("\n  ⚠️ Colunas necessárias não encontradas")

print("=" * 80)
