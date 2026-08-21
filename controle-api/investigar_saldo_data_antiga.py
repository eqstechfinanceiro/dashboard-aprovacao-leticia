#!/usr/bin/env python3
"""
Investigar se SALDO CARTAO e de uma data muito anterior
"""

import pandas as pd
from pathlib import Path
from datetime import datetime

CTRL_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")

print("=" * 80)
print("INVESTIGANDO SALDO CARTAO - DATAS ANTIGAS")
print("=" * 80)

# Carregar dados
df_extrato = pd.read_excel(CTRL_FILE, sheet_name="EXTRATO", header=7)
df_extrato['Valor'] = pd.to_numeric(df_extrato['Valor'], errors='coerce')
df_extrato['Data'] = pd.to_datetime(df_extrato['Data'], unit='D', origin='1899-12-30', errors='coerce')
df_extrato['CPF_Limpo'] = df_extrato['CPF'].astype(str).str.replace(r'\D', '', regex=True)

df_carga = pd.read_excel(CARGA_1QZ, sheet_name="Planilha1", header=5)
df_carga = df_carga[df_carga['COLABORADOR'].notna()].reset_index(drop=True)
df_carga['CPF_Limpo'] = df_carga['CPF'].astype(str).str.replace(r'\D', '', regex=True).str.zfill(11)

# Verificar range de datas no extrato
print(f"\nRange de datas no extrato:")
print(f"  Inicio: {df_extrato['Data'].min()}")
print(f"  Fim: {df_extrato['Data'].max()}")

# Pegar colaboradores com saldo pequeno na CARGA QZ (pode indicar saldo "zerado" ou recente)
amostra = df_carga[df_carga['SALDO CARTAO'] > 0].head(20)

print(f"\n{'='*80}")
print("ANALISE DETALHADA - PRIMEIRA TRANSACAO DE CADA COLABORADOR")
print(f"{'='*80}")

for _, row_carga in amostra.iterrows():
    nome = row_carga['COLABORADOR']
    cpf = row_carga['CPF_Limpo']
    saldo_carga = row_carga['SALDO CARTAO']
    
    # Buscar todas as transacoes ordenadas por data
    trans = df_extrato[df_extrato['CPF_Limpo'] == cpf].sort_values('Data')
    
    if len(trans) == 0:
        print(f"\n{nome[:40]}: NENHUMA transacao encontrada!")
        continue
    
    # Pegar primeira e ultima transacao
    primeira = trans.iloc[0]
    ultima = trans.iloc[-1]
    
    # Calcular saldo ate a PRIMEIRA transacao (deve ser 0 ou proximo)
    saldo_ate_primeira = trans[trans['Data'] <= primeira['Data']]['Valor'].sum()
    
    # Data da primeira transacao
    data_primeira = primeira['Data']
    
    print(f"\n{nome[:40]}:")
    print(f"  SALDO CARGA QZ: R$ {saldo_carga:.2f}")
    print(f"  Primeira transacao: {data_primeira.strftime('%Y-%m-%d')}")
    print(f"  Tipo primeira: {primeira['Tipo']}")
    print(f"  Valor primeira: R$ {primeira['Valor']:.2f}")
    print(f"  Saldo apos primeira: R$ {saldo_ate_primeira:.2f}")
    
    # Verificar se o saldo da carga bate com alguma transacao inicial
    if abs(saldo_ate_primeira - saldo_carga) < 1:
        print(f"  ✓✓✓ MATCH com saldo apos PRIMEIRA transacao!")

# ============================================
# Testar hipotese: saldo e o valor da PRIMEIRA CARGA
# ============================================
print(f"\n{'='*80}")
print("TESTE: SALDO CARTAO = VALOR DA PRIMEIRA CARGA")
print(f"{'='*80}")

resultados = []

for _, row_carga in amostra.iterrows():
    nome = row_carga['COLABORADOR']
    cpf = row_carga['CPF_Limpo']
    saldo_carga = row_carga['SALDO CARTAO']
    
    trans = df_extrato[df_extrato['CPF_Limpo'] == cpf].sort_values('Data')
    
    if len(trans) == 0:
        continue
    
    # Pegar a primeira CARGA
    cargas = trans[trans['Tipo'] == 'CARGA']
    
    if len(cargas) > 0:
        primeira_carga = cargas.iloc[0]
        valor_primeira_carga = primeira_carga['Valor']
        data_primeira_carga = primeira_carga['Data']
        
        diff = abs(valor_primeira_carga - saldo_carga)
        
        resultados.append({
            'nome': nome[:35],
            'saldo_carga': saldo_carga,
            'primeira_carga': valor_primeira_carga,
            'diff': diff,
            'data_primeira_carga': data_primeira_carga.strftime('%Y-%m-%d'),
            'match': diff < 0.01
        })

df_res = pd.DataFrame(resultados)
if len(df_res) > 0:
    print("\nResultados:")
    print(df_res.to_string(index=False))
    
    matches = len(df_res[df_res['match']])
    print(f"\n\nMatches (SALDO CARTAO = primeira CARGA): {matches}/{len(df_res)} ({matches/len(df_res)*100:.1f}%)")

# ============================================
# Testar hipotese: saldo e o valor de alguma CARGA especifica
# ============================================
print(f"\n{'='*80}")
print("TESTE: SALDO CARTAO = ALGUMA CARGA ESPECIFICA")
print(f"{'='*80}")

resultados2 = []

for _, row_carga in amostra.iterrows():
    nome = row_carga['COLABORADOR']
    cpf = row_carga['CPF_Limpo']
    saldo_carga = row_carga['SALDO CARTAO']
    
    trans = df_extrato[df_extrato['CPF_Limpo'] == cpf]
    cargas = trans[trans['Tipo'] == 'CARGA']
    
    if len(cargas) == 0:
        continue
    
    # Verificar se o saldo bate com alguma carga
    match_encontrado = False
    for _, carga_row in cargas.iterrows():
        if abs(carga_row['Valor'] - saldo_carga) < 0.01:
            resultados2.append({
                'nome': nome[:30],
                'saldo_carga': saldo_carga,
                'carga_match': carga_row['Valor'],
                'data_carga': carga_row['Data'].strftime('%Y-%m-%d'),
                'match': True
            })
            match_encontrado = True
            break
    
    if not match_encontrado:
        resultados2.append({
            'nome': nome[:30],
            'saldo_carga': saldo_carga,
            'carga_match': None,
            'data_carga': None,
            'match': False
        })

df_res2 = pd.DataFrame(resultados2)
if len(df_res2) > 0:
    print("\nResultados:")
    print(df_res2.to_string(index=False))
    
    matches2 = len(df_res2[df_res2['match']])
    print(f"\n\nMatches (SALDO CARTAO = alguma CARGA): {matches2}/{len(df_res2)} ({matches2/len(df_res2)*100:.1f}%)")

print(f"\n{'='*80}")
print("CONCLUSAO")
print(f"{'='*80}")

if len(df_res) > 0 and len(df_res2) > 0:
    m1 = len(df_res[df_res['match']])
    m2 = len(df_res2[df_res2['match']])
    
    print(f"""
RESULTADOS:
- SALDO CARTAO = primeira CARGA: {m1}/{len(df_res)} matches ({m1/len(df_res)*100:.1f}%)
- SALDO CARTAO = alguma CARGA: {m2}/{len(df_res2)} matches ({m2/len(df_res2)*100:.1f}%)

Se houver matches, descobrimos a origem do SALDO CARTAO!
Se nao houver, o SALDO CARTAO e definido de outra forma.
""")
