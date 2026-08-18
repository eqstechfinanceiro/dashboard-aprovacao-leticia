#!/usr/bin/env python3
"""
Comparar detalhadamente QUINZENAS vs BASE PREST para entender a fonte
"""
import pandas as pd
from pathlib import Path

BASE = Path(__file__).parent.parent
CONTROLE_FILE = BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"

print("=" * 80)
print("  COMPARAÇÃO DETALHADA: QUINZENAS vs BASE PREST")
print("=" * 80)

# Ler QUINZENAS
df_qz = pd.read_excel(CONTROLE_FILE, sheet_name='QUINZENAS', header=3)
filtro = (
    (df_qz['QUINZENA'].astype(str).str.contains('2ª', na=False, case=False)) &
    (df_qz['MÊS'].astype(str).str.contains('MAIO', na=False, case=False)) &
    (df_qz['ANO'] == 2026)
)
df_2qz = df_qz[filtro].copy()

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

# Comparar top 10 colaboradores da QUINZENAS
print("\nComparando top 10 colaboradores da QUINZENAS com BASE PREST:")
print(f"{'Colaborador':<35} {'QUINZENAS':>12} {'BASE PREST (MAIO)':>18} {'BASE PREST (TODAS)':>18}")
print("-" * 85)

for _, row in df_2qz.sort_values('VALOR', ascending=False).head(10).iterrows():
    nome = row['COLABORADOR']
    cpf = row['CPF']
    valor_qz = row['VALOR']
    
    # Buscar na BASE PREST por CPF
    df_cpf = df_base[df_base['CPF/CNPJ'] == cpf]
    valor_base_maio = df_cpf[(df_cpf['Data'].dt.month == 5) & (df_cpf['Data'].dt.year == 2026)]['Valor'].sum()
    valor_base_todas = df_cpf['Valor'].sum()
    
    print(f"{nome[:35]:<35} R$ {valor_qz:>10,.2f} R$ {valor_base_maio:>16,.2f} R$ {valor_base_todas:>16,.2f}")

# Verificar se há relação com Nome do relatório
print("\n\nVerificando se QUINZENAS usa Nome do relatório:")
print("   ABNER na QUINZENAS: R$ 9.840,00")
print("   ABNER na BASE PREST (MAIO 2026): R$ 1.802,69")
print("   ABNER na BASE PREST (todas): R$ 190.542,57")

# Verificar se há reports específicos de MAIO 2026
print("\n\nVerificando reports de ABNER em MAIO 2026:")
df_abner = df_base[df_base['CPF/CNPJ'] == 2027745203.0]
df_abner_maio = df_abner[(df_abner['Data'].dt.month == 5) & (df_abner['Data'].dt.year == 2026)]
print(f"   Reports em MAIO 2026: {len(df_abner_maio)} despesas")
print(f"   Total: R$ {df_abner_maio['Valor'].sum():,.2f}")
print("\n   Detalhe dos reports:")
for _, row in df_abner_maio.iterrows():
    print(f"     {row['Nome do relatório']:<30} {row['Data'].strftime('%d/%m/%Y')} R$ {row['Valor']:>8,.2f}")

print("\n" + "=" * 80)
print("CONCLUSÃO:")
print("O valor na QUINZENAS (R$ 9.840,00) não corresponde à BASE PREST filtrada por mês.")
print("Possíveis causas:")
print("1. QUINZENAS é alimentada manualmente (não automática)")
print("2. QUINZENAS usa outra fonte de dados (API VExpenses direta)")
print("3. QUINZENAS usa critério diferente (data de aprovação, não data da despesa)")
print("4. QUINZENAS soma despesas de reports criados no período, não despesas do período")
print("=" * 80)
