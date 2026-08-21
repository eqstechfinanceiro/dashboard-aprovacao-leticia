#!/usr/bin/env python3
import pandas as pd
from pathlib import Path

DATA_DIR = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data")

file = DATA_DIR / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"
df = pd.read_excel(file, sheet_name="EXTRATO", header=7)

print("=" * 80)
print("ANALISE DETALHADA DO EXTRATO")
print("=" * 80)

print(f"\nTotal de transacoes: {len(df)}")
print(f"Colunas: {list(df.columns)}")

# Verificar tipos de transação
print("\n--- TIPOS DE TRANSACAO ---")
print(df['Tipo'].value_counts())

# Verificar CPFs únicos
print(f"\n--- CPFS UNICOS: {df['CPF'].nunique()}")

# Buscar JORGE ANTONIO
print("\n--- BUSCANDO JORGE ANTONIO ---")
# CPF 01063690080
jorge_cpf = '01063690080'
jorge_ext = df[df['CPF'] == jorge_cpf]

if len(jorge_ext) == 0:
    # Tentar com formato diferente
    jorge_ext = df[df['CPF'].astype(str).str.contains('1063690080', na=False)]

if len(jorge_ext) == 0:
    # Buscar por nome
    jorge_ext = df[df['Usuário'].astype(str).str.contains('JORGE', na=False, case=False)]

print(f"Encontrado {len(jorge_ext)} transacoes para JORGE ANTONIO")

if len(jorge_ext) > 0:
    print("\n--- TODAS AS TRANSACOES ---")
    print(jorge_ext[['Data', 'Hora', 'Tipo', 'Descrição', 'Valor', 'CPF', 'Usuário']].to_string())
    
    print("\n--- TOTAIS POR TIPO ---")
    totais = jorge_ext.groupby('Tipo')['Valor'].agg(['count', 'sum'])
    print(totais)
    
    # Calcular saldo acumulado
    print("\n--- CALCULO DE SALDO ---")
    carga = jorge_ext[jorge_ext['Tipo'] == 'CARGA']['Valor'].sum()
    transferencia = jorge_ext[jorge_ext['Tipo'] == 'TRANSFERÊNCIA']['Valor'].sum()
    tarifa = jorge_ext[jorge_ext['Tipo'] == 'TARIFA']['Valor'].sum()
    
    print(f"CARGA:           R$ {carga:,.2f}")
    print(f"TRANSFERENCIA:   R$ {transferencia:,.2f}")
    print(f"TARIFA:          R$ {tarifa:,.2f}")
    print(f"SALDO (C+T+Tr):  R$ {(carga + transferencia + tarifa):,.2f}")

# Comparar com valores esperados do briefing
print("\n" + "=" * 80)
print("COMPARACAO COM VALORES ESPERADOS (Briefing)")
print("=" * 80)

print("""
Valores esperados para JORGE ANTONIO (MAIO 2026):
- CARGA:           R$ 6.288,62
- TRANSFERENCIA:   R$ -550,00
- TARIFA:          R$ -77,00
- SALDO CARTAO:    R$ 64,00
- PRESTAÇÃO CONTAS: R$ 5.463,92

Nota: Os valores do extrato podem ser acumulados ate determinada data
ou referentes ao mes especifico.
""")

# Analisar distribuicao por grupo
print("\n--- DISTRIBUICAO POR GRUPO ---")
print(df.groupby('Grupo')['Valor'].agg(['count', 'sum']).sort_values('sum', ascending=False).head(10))
