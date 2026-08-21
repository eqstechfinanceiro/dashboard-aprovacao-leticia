#!/usr/bin/env python3
"""
Testar se SALDO CARTAO é o saldo NO INICIO da quinzena (dia 26 do mes anterior)
"""

import pandas as pd
from pathlib import Path

CTRL_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")

print("=" * 80)
print("TESTANDO SALDO NO INICIO DA QUINZENA")
print("=" * 80)

# Carregar dados
df_extrato = pd.read_excel(CTRL_FILE, sheet_name="EXTRATO", header=7)
df_extrato['Valor'] = pd.to_numeric(df_extrato['Valor'], errors='coerce')
df_extrato['Data'] = pd.to_datetime(df_extrato['Data'], unit='D', origin='1899-12-30', errors='coerce')
df_extrato['CPF_Limpo'] = df_extrato['CPF'].astype(str).str.replace(r'\D', '', regex=True)

df_carga = pd.read_excel(CARGA_1QZ, sheet_name="Planilha1", header=5)
df_carga = df_carga[df_carga['COLABORADOR'].notna()].reset_index(drop=True)
df_carga['CPF_Limpo'] = df_carga['CPF'].astype(str).str.replace(r'\D', '', regex=True).str.zfill(11)

# ============================================
# Testar saldo ate diferentes datas de "inicio"
# ============================================

print("\n" + "=" * 80)
print("TESTANDO DIFERENTES DATAS DE REFERENCIA")
print("=" * 80)

# Datas para testar
datas_teste = [
    ("2026-04-25", "25/04 (fim do mes anterior)"),
    ("2026-04-26", "26/04 (inicio 1a QZ)"),
    ("2026-04-30", "30/04 (fim abril)"),
    ("2026-05-01", "01/05 (inicio maio)"),
]

for data_limite, desc in datas_teste:
    print(f"\n--- Testando: {desc} ---")
    
    # Calcular saldo ate essa data
    df_ate = df_extrato[df_extrato['Data'] <= data_limite]
    
    saldo_por_cpf = df_ate.groupby('CPF_Limpo').apply(
        lambda x: (
            x[x['Tipo'] == 'CARGA']['Valor'].sum() -
            abs(x[x['Tipo'] == 'TRANSFERÊNCIA']['Valor'].sum()) -
            abs(x[x['Tipo'] == 'TARIFA']['Valor'].sum())
        )
    ).reset_index()
    saldo_por_cpf.columns = ['CPF', 'saldo']
    
    # Cruzar com CARGA QZ (top 10)
    matches = 0
    total_diff = 0
    count = 0
    
    for _, row in df_carga.head(20).iterrows():
        cpf = row['CPF_Limpo']
        saldo_carga = row['SALDO CARTAO'] if pd.notna(row['SALDO CARTAO']) else 0
        
        saldo_row = saldo_por_cpf[saldo_por_cpf['CPF'] == cpf]
        if len(saldo_row) > 0:
            saldo_calc = saldo_row.iloc[0]['saldo']
            diff = abs(saldo_calc - saldo_carga)
            total_diff += diff
            count += 1
            if diff < 1.0:
                matches += 1
    
    avg_diff = total_diff / count if count > 0 else 0
    print(f"  Matches perfeitos: {matches}/20")
    print(f"  Diferenca media: R$ {avg_diff:.2f}")

# ============================================
# Analise especifica do exemplo
# ============================================
print("\n" + "=" * 80)
print("ANALISE ESPECIFICA: FILIPE MENEZES KLING")
print("=" * 80)

# Buscar no CARGA QZ
filipe_carga = df_carga[df_carga['COLABORADOR'].str.contains('FILIPE', case=False, na=False)]
if len(filipe_carga) > 0:
    print("\nDados na CARGA 1 QZ:")
    print(filipe_carga[['COLABORADOR', 'CPF_Limpo', 'SALDO CARTAO', '1ª QZ']].to_string())
    
    cpf_filipe = filipe_carga.iloc[0]['CPF_Limpo']
    saldo_carga_filipe = filipe_carga.iloc[0]['SALDO CARTAO']
    
    # Buscar transacoes no extrato
    trans_filipe = df_extrato[df_extrato['CPF_Limpo'] == cpf_filipe].sort_values('Data')
    
    print(f"\nTodas as transacoes no extrato ({len(trans_filipe)}):")
    print(trans_filipe[['Data', 'Tipo', 'Valor', 'Descrição']].to_string())
    
    # Calcular saldo acumulado dia a dia
    print(f"\nEvolucao do saldo:")
    saldo_acumulado = 0
    datas_unicas = trans_filipe['Data'].dt.date.unique()
    
    for data in sorted(datas_unicas):
        trans_dia = trans_filipe[trans_filipe['Data'].dt.date == data]
        carga = trans_dia[trans_dia['Tipo'] == 'CARGA']['Valor'].sum()
        transf = abs(trans_dia[trans_dia['Tipo'] == 'TRANSFERÊNCIA']['Valor'].sum())
        tarifa = abs(trans_dia[trans_dia['Tipo'] == 'TARIFA']['Valor'].sum())
        
        saldo_dia = carga - transf - tarifa
        saldo_acumulado += saldo_dia
        
        print(f"  {data}: CARGA={carga:.2f}, TRANSF={transf:.2f}, TARIFA={tarifa:.2f} -> Saldo dia: {saldo_dia:.2f}, Acumulado: {saldo_acumulado:.2f}")
        
        # Verificar se bate com o saldo da carga
        if abs(saldo_acumulado - saldo_carga_filipe) < 1:
            print(f"    *** BATE com CARGA QZ (R$ {saldo_carga_filipe}) ***")

print("\n" + "=" * 80)
print("CONCLUSAO")
print("=" * 80)
print("""
Se nenhuma data bate perfeitamente, possiveis explicacoes:

1. O SALDO CARTAO na CARGA QZ é de outra data especifica (ex: ultimo dia util antes da quinzena)
2. O saldo é extraído de um relatório diferente do VExpenses
3. O saldo é informado manualmente pelo time financeiro
4. O extrato que temos nao tem todas as transacoes

Recomendacao: Verificar com o time financeiro qual a fonte exata do SALDO CARTAO.
""")
