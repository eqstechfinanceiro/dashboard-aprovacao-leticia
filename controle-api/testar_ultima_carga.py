#!/usr/bin/env python3
"""
Testar se SALDO CARTAO é o saldo apos a ULTIMA CARGA antes da quinzena
"""

import pandas as pd
from pathlib import Path

CTRL_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")

print("=" * 80)
print("TESTANDO: SALDO APOS ULTIMA CARGA ANTES DA QUINZENA")
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
# Testar: saldo apos ultima carga antes de 26/04
# ============================================
print("\n" + "=" * 80)
print("TESTE 1: Saldo apos ultima CARGA antes de 26/04")
print("=" * 80)

data_limite = "2026-04-26"
resultados = []

amostra = df_carga[df_carga['SALDO CARTAO'] > 0].head(30)

for _, row_carga in amostra.iterrows():
    nome = row_carga['COLABORADOR']
    cpf = row_carga['CPF_Limpo']
    saldo_carga = row_carga['SALDO CARTAO']
    
    # Buscar todas as transacoes ate a data limite
    trans_ate = df_extrato[
        (df_extrato['CPF_Limpo'] == cpf) & 
        (df_extrato['Data'] < data_limite)
    ].sort_values('Data')
    
    if len(trans_ate) == 0:
        continue
    
    # Encontrar a ultima CARGA antes da data limite
    cargas_ate = trans_ate[trans_ate['Tipo'] == 'CARGA']
    
    if len(cargas_ate) == 0:
        continue
    
    ultima_carga = cargas_ate.iloc[-1]
    data_ultima_carga = ultima_carga['Data']
    
    # Calcular saldo acumulado ate a data da ultima carga (inclusive)
    trans_ate_ultima_carga = trans_ate[trans_ate['Data'] <= data_ultima_carga]
    
    carga = trans_ate_ultima_carga[trans_ate_ultima_carga['Tipo'] == 'CARGA']['Valor'].sum()
    transf = abs(trans_ate_ultima_carga[trans_ate_ultima_carga['Tipo'] == 'TRANSFERÊNCIA']['Valor'].sum())
    tarifa = abs(trans_ate_ultima_carga[trans_ate_ultima_carga['Tipo'] == 'TARIFA']['Valor'].sum())
    
    saldo_calc = carga - transf - tarifa
    diff = abs(saldo_calc - saldo_carga)
    
    resultados.append({
        'nome': nome[:30],
        'cpf': cpf,
        'saldo_carga': round(saldo_carga, 2),
        'saldo_calc': round(saldo_calc, 2),
        'diff': round(diff, 2),
        'data_ultima_carga': data_ultima_carga.strftime('%Y-%m-%d'),
        'match': diff < 0.01
    })

df_res = pd.DataFrame(resultados)
if len(df_res) > 0:
    matches = len(df_res[df_res['match']])
    print(f"\nTotal testados: {len(df_res)}")
    print(f"Matches perfeitos: {matches} ({matches/len(df_res)*100:.1f}%)")
    
    # Mostrar todos
    print(f"\nTodos os resultados:")
    print(df_res[['nome', 'saldo_carga', 'saldo_calc', 'diff', 'data_ultima_carga', 'match']].to_string(index=False))
    
    # Mostrar matches
    if matches > 0:
        print(f"\n\n✓ Matches perfeitos:")
        print(df_res[df_res['match']][['nome', 'saldo_carga', 'data_ultima_carga']].to_string(index=False))

# ============================================
# Testar: saldo ate dia 25/04 (incluindo)
# ============================================
print("\n" + "=" * 80)
print("TESTE 2: Saldo acumulado ate dia 25/04 (fechamento anterior)")
print("=" * 80)

data_limite2 = "2026-04-25"
resultados2 = []

for _, row_carga in amostra.iterrows():
    cpf = row_carga['CPF_Limpo']
    saldo_carga = row_carga['SALDO CARTAO']
    
    trans_ate = df_extrato[
        (df_extrato['CPF_Limpo'] == cpf) & 
        (df_extrato['Data'] <= data_limite2)
    ]
    
    if len(trans_ate) == 0:
        continue
    
    carga = trans_ate[trans_ate['Tipo'] == 'CARGA']['Valor'].sum()
    transf = abs(trans_ate[trans_ate['Tipo'] == 'TRANSFERÊNCIA']['Valor'].sum())
    tarifa = abs(trans_ate[trans_ate['Tipo'] == 'TARIFA']['Valor'].sum())
    
    saldo_calc = carga - transf - tarifa
    diff = abs(saldo_calc - saldo_carga)
    
    resultados2.append({
        'nome': row_carga['COLABORADOR'][:30],
        'saldo_carga': round(saldo_carga, 2),
        'saldo_calc': round(saldo_calc, 2),
        'diff': round(diff, 2),
        'match': diff < 0.01
    })

df_res2 = pd.DataFrame(resultados2)
if len(df_res2) > 0:
    matches2 = len(df_res2[df_res2['match']])
    print(f"\nTotal testados: {len(df_res2)}")
    print(f"Matches perfeitos: {matches2} ({matches2/len(df_res2)*100:.1f}%)")
    
    if matches2 > 0:
        print(f"\n✓ Matches perfeitos:")
        print(df_res2[df_res2['match']][['nome', 'saldo_carga', 'saldo_calc']].to_string(index=False))

print("\n" + "=" * 80)
print("CONCLUSAO")
print("=" * 80)

if len(df_res) > 0 and len(df_res2) > 0:
    m1 = len(df_res[df_res['match']])
    m2 = len(df_res2[df_res2['match']])
    
    print(f"""
RESULTADOS:
- Teste 1 (apos ultima carga antes de 26/04): {m1}/{len(df_res)} matches ({m1/len(df_res)*100:.1f}%)
- Teste 2 (ate dia 25/04): {m2}/{len(df_res2)} matches ({m2/len(df_res2)*100:.1f}%)

Se algum teste tiver >80% de matches, essa e a regra!
Caso contrario, o SALDO CARTAO provavelmente e manual/informado pelo financeiro.
""")
