#!/usr/bin/env python3
"""
Investigar como a aba QUINZENAS calcula o VALOR por quinzena
"""
import pandas as pd
from pathlib import Path

BASE = Path(__file__).parent.parent
CONTROLE_FILE = BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"

print("=" * 80)
print("  INVESTIGAÇÃO: COMO QUINZENAS CALCULA VALOR")
print("=" * 80)

# Ler QUINZENAS
df_qz = pd.read_excel(CONTROLE_FILE, sheet_name='QUINZENAS', header=3)
print(f"\n1. QUINZENAS: {df_qz.shape}")
print(f"   Colunas: {list(df_qz.columns)}")

# Filtrar 2ª QZ MAIO 2026
filtro = (
    (df_qz['QUINZENA'].astype(str).str.contains('2ª', na=False, case=False)) &
    (df_qz['MÊS'].astype(str).str.contains('MAIO', na=False, case=False)) &
    (df_qz['ANO'] == 2026)
)
df_2qz = df_qz[filtro].copy()
print(f"\n2. 2ª QZ MAIO 2026: {len(df_2qz)} registros")
print(f"   Total VALOR: R$ {df_2qz['VALOR'].sum():,.2f}")

# Verificar se há coluna calculada
print("\n3. Amostra de dados 2ª QZ:")
amostra = df_2qz.head(10)
for _, row in amostra.iterrows():
    print(f"   {row['COLABORADOR'][:30]:<30} CPF:{row['CPF']:<15} VALOR:R$ {row['VALOR']:>10,.2f}")

# Ler BASE PREST
excel_file = pd.ExcelFile(CONTROLE_FILE)
sheet_base = None
for sheet in excel_file.sheet_names:
    if 'BASE' in sheet.upper() and 'PREST' in sheet.upper():
        sheet_base = sheet
        break

df_base = pd.read_excel(CONTROLE_FILE, sheet_name=sheet_base, header=0)
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

df_base['Data'] = pd.to_datetime(df_base['Data'], errors='coerce')
df_base['CPF/CNPJ'] = pd.to_numeric(df_base['CPF/CNPJ'], errors='coerce')

# Verificar ABNER na BASE PREST
print("\n4. Verificando ABNER ANDRADE CAVALCANTE na BASE PREST:")
cpf_abner = 2027745203.0
df_abner = df_base[df_base['CPF/CNPJ'] == cpf_abner]
print(f"   Total despesas ABNER (todas): R$ {df_abner['Valor'].sum():,.2f}")
print(f"   Total despesas ABNER (MAIO 2026): R$ {df_abner[(df_abner['Data'].dt.month == 5) & (df_abner['Data'].dt.year == 2026)]['Valor'].sum():,.2f}")

# Verificar ABNER na QUINZENAS
abner_qz = df_2qz[df_2qz['CPF'] == cpf_abner]
print(f"\n5. ABNER na QUINZENAS (2ª QZ MAIO 2026):")
if len(abner_qz) > 0:
    print(f"   VALOR: R$ {abner_qz['VALOR'].values[0]:,.2f}")
else:
    print("   ABNER não encontrado na QUINZENAS 2ª QZ MAIO 2026")

# Verificar se há outra aba com fórmulas
print("\n6. Verificando outras abas:")
for sheet in excel_file.sheet_names:
    print(f"   - {sheet}")

print("\n7. Conclusão:")
print("   A fórmula =SOMASE('BASE PREST'!J:J;[@CPF];'BASE PREST'!AA:AA) soma TODAS as despesas por CPF")
print("   Mas a QUINZENAS tem valores diferentes, então deve haver outro filtro")
print("   Possibilidades:")
print("   - A QUINZENAS usa DATA de fechamento (11/05 ou 25/05) para filtrar")
print("   - A QUINZENAS usa outra fonte de dados (não BASE PREST)")
print("   - A QUINZENAS tem fórmula diferente que filtra por período")

print("=" * 80)
