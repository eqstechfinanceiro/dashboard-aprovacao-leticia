#!/usr/bin/env python3
"""Extrair valor de prestação - Abordagem direta"""
import pandas as pd
from pathlib import Path

BASE = Path(__file__).parent.parent
CONTROLE_FILE = BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"

print("=" * 80)
print("  EXTRAÇÃO PRESTAÇÃO - ABORDAGEM DIRETA")
print("=" * 80)

# Ler sem header, depois atribuir manualmente
df = pd.read_excel(CONTROLE_FILE, sheet_name='QUINZENAS', header=None)

print(f"  Dimensões: {df.shape}")

# As colunas parecem estar em:
# Col 0 = COLABORADOR
# Col 1 = CPF
# Col 2 = VALOR (mas tem um valor grande na primeira linha: 17216218.81)
# Col 3 = QUINZENA
# Col 4 = DATA
# Col 5 = MÊS
# Col 6 = ANO
# Col 7 = REGIONAL
# Col 8 = OBSERVAÇÃO

# Remover as primeiras linhas que são lixo (até a linha que tem "COLABORADOR")
header_row = None
for i in range(20):
    if str(df.iloc[i, 0]).upper() == 'COLABORADOR':
        header_row = i
        break

print(f"  Linha do header encontrada: {header_row}")

if header_row is not None:
    # Re-ler com o header correto
    df = pd.read_excel(CONTROLE_FILE, sheet_name='QUINZENAS', header=header_row)
    
    print(f"\n  Colunas: {list(df.columns)}")
    print(f"  Total de registros: {len(df)}")
    
    # Converter colunas relevantes
    df['VALOR'] = pd.to_numeric(df['VALOR'], errors='coerce')
    df['ANO'] = pd.to_numeric(df['ANO'], errors='coerce')
    
    # Filtrar para 2ª QZ de maio 2026
    filtro = (
        (df['QUINZENA'].astype(str).str.contains('2ª', na=False, case=False)) &
        (df['MÊS'].astype(str).str.contains('MAIO', na=False, case=False)) &
        (df['ANO'] == 2026) &
        (df['VALOR'] > 0)  # Ignorar valores zerados
    )
    
    df_filtrado = df[filtro].copy()
    print(f"\n  Registros 2ª QZ MAIO 2026 (com valor > 0): {len(df_filtrado)}")
    
    if len(df_filtrado) > 0:
        total = df_filtrado['VALOR'].sum()
        
        print(f"\n  ✅ Total PRESTAÇÃO (2ª QZ MAIO 2026): R$ {total:,.2f}")
        
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
        
        print(f"\n  Diferença vs API (report):  R$ {dif_report:,.2f} ({pct_report:.1f}%)")
        
        if pct_report < 10:
            print("\n  ✅ DENTRO DA MARGEM DE ERRO (< 10%)")
            print("  A API (report date) está alinhada com a planilha CONTROLE")
        else:
            print("\n  ⚠️ DIFERENÇA SIGNIFICATIVA")
            print("  Possível causa: A planilha usa outro critério de data")
    else:
        print("\n  ⚠️ Nenhum registro encontrado")
        # Mostrar o que tem para MAIO 2026
        df_maior = df[(df['MÊS'].astype(str).str.contains('MAIO', na=False, case=False)) & (df['ANO'] == 2026)]
        print(f"  Total MAIO 2026 (todas quinzenas): {len(df_maior)}")
        if len(df_maior) > 0:
            print("  Quinzenas disponíveis:")
            print(df_maior['QUINZENA'].value_counts())
else:
    print("  ⚠️ Não conseguiu encontrar o header")

print("=" * 80)
