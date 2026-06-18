#!/usr/bin/env python3
"""
Entender como a planilha filtra PRESTAÇÃO DE CONTAS por quinzena
"""
import pandas as pd
from pathlib import Path

BASE = Path(__file__).parent.parent
CONTROLE_FILE = BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"

print("=" * 80)
print("  ENTENDENDO O FILTRO POR QUINZENA")
print("=" * 80)

# Ler BASE PREST com header correto (o nome da aba pode ter espaço no final)
excel_file = pd.ExcelFile(CONTROLE_FILE)
sheet_base = None
for sheet in excel_file.sheet_names:
    if 'BASE' in sheet.upper() and 'PREST' in sheet.upper():
        sheet_base = sheet
        break

if not sheet_base:
    # Usar a primeira aba que tem colunas de despesa
    for sheet in excel_file.sheet_names:
        df_test = pd.read_excel(CONTROLE_FILE, sheet_name=sheet, nrows=5)
        if 'ID da Despesa' in str(df_test.columns) or 'ID do Relatório' in str(df_test.columns):
            sheet_base = sheet
            break

print(f"   Usando aba: {sheet_base}")
df_base = pd.read_excel(CONTROLE_FILE, sheet_name=sheet_base, header=0)
print(f"\n1. BASE PREST (com header na linha 1):")
print(f"   Dimensões: {df_base.shape}")
print(f"   Colunas: {list(df_base.columns)}")

# Renomear colunas Unnamed para facilitar
df_base.columns = [
    'ID da Despesa', 'ID do Relatório', 'Nome do relatório', 'Data',
    'Nome do membro de equipe', 'Banco', 'Agência', 'Conta', 'Pix',
    'CPF/CNPJ', 'Status', 'Data de Pagamento', 'Descrição da despesa',
    'Tipo de Despesa', 'Reembolsável', 'Anotação da Despesa',
    'Anotação de Rateio', 'Centro de Custos', 'Forma de pagamento',
    'Projeto', 'Percentual de projeto', 'Início do Percurso por GPS',
    'Fim do Percurso por GPS', 'Valor do KM', 'Kilômetros Percorridos',
    'Moeda do Relatório', 'Valor', 'MÊS', 'CPF', 'Coluna1', 'colaborador'
]

print(f"\n2. Colunas renomeadas:")
print(f"   Coluna J (CPF/CNPJ): índice 9")
print(f"   Coluna AA (Valor): índice 26")

# Verificar coluna MÊS
print("\n3. Verificando coluna MÊS:")
if 'MÊS' in df_base.columns:
    print(f"   Valores únicos em MÊS: {df_base['MÊS'].unique()}")
    print(f"   Distribuição por MÊS:")
    print(df_base['MÊS'].value_counts())
else:
    print("   Coluna MÊS não encontrada")

# Verificar coluna Data
print("\n4. Verificando coluna Data:")
if 'Data' in df_base.columns:
    df_base['Data'] = pd.to_datetime(df_base['Data'], errors='coerce')
    print(f"   Período de dados: {df_base['Data'].min()} a {df_base['Data'].max()}")
    print(f"   Distribuição por mês:")
    df_base['Mês_Num'] = df_base['Data'].dt.month
    print(df_base['Mês_Num'].value_counts().sort_index())

# Verificar a aba QUINZENAS para entender como ela calcula
print("\n5. Verificando aba QUINZENAS:")
df_qz = pd.read_excel(CONTROLE_FILE, sheet_name='QUINZENAS', header=3)
print(f"   Colunas: {list(df_qz.columns)}")

# Filtrar para 2ª QZ MAIO 2026
filtro = (
    (df_qz['QUINZENA'].astype(str).str.contains('2ª', na=False, case=False)) &
    (df_qz['MÊS'].astype(str).str.contains('MAIO', na=False, case=False)) &
    (df_qz['ANO'] == 2026)
)
df_2qz = df_qz[filtro]
print(f"\n   2ª QZ MAIO 2026: {len(df_2qz)} registros")
print(f"   Total VALOR: R$ {df_2qz['VALOR'].sum():,.2f}")

# Verificar se há relação entre DATA na QUINZENAS e Data na BASE PREST
print("\n6. Verificando relação DATA QUINZENAS vs BASE PREST:")
print("   DATA na QUINZENAS é número serial Excel (ex: 45819 = 11/06/2025)")
print("   Isso indica que a planilha usa DATA DE FECHAMENTO, não data da despesa")

# Calcular total da BASE PREST para MAIO 2026
print("\n7. Calculando total BASE PREST para MAIO 2026:")
if 'Data' in df_base.columns:
    df_maio = df_base[(df_base['Data'].dt.month == 5) & (df_base['Data'].dt.year == 2026)]
    print(f"   Total despesas MAIO 2026: R$ {df_maio['Valor'].sum():,.2f}")
    print(f"   Total despesas (todas): R$ {df_base['Valor'].sum():,.2f}")

print("=" * 80)
