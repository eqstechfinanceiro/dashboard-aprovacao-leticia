#!/usr/bin/env python3
"""
Analisar SALDO CARTAO como SNAPSHOT no dia do fechamento
Verificar se o saldo acumulado ate o dia 11 (1a QZ) ou dia 25 (2a QZ) bate com a CARGA QZ
"""

import pandas as pd
from pathlib import Path
from difflib import SequenceMatcher

CTRL_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")

print("=" * 80)
print("ANALISE DE SALDO SNAPSHOT NO DIA DE FECHAMENTO")
print("=" * 80)

# ============================================
# 1. CARREGAR EXTRATO
# ============================================
print("\n" + "=" * 80)
print("1. CARREGANDO EXTRATO")
print("=" * 80)

df_extrato = pd.read_excel(CTRL_FILE, sheet_name="EXTRATO", header=7)
df_extrato['Valor'] = pd.to_numeric(df_extrato['Valor'], errors='coerce')
df_extrato['Data'] = pd.to_datetime(df_extrato['Data'], unit='D', origin='1899-12-30', errors='coerce')
df_extrato['Dia'] = df_extrato['Data'].dt.day
df_extrato['Mes'] = df_extrato['Data'].dt.month
df_extrato['Ano'] = df_extrato['Data'].dt.year
df_extrato['CPF_Limpo'] = df_extrato['CPF'].astype(str).str.replace(r'\D', '', regex=True)

print(f"Total transacoes: {len(df_extrato)}")
print(f"Período: {df_extrato['Data'].min()} a {df_extrato['Data'].max()}")

# ============================================
# 2. CALCULAR SALDO ACUMULADO ATE O DIA 11 DE MAIO (1a QZ)
# ============================================
print("\n" + "=" * 80)
print("2. SALDO ACUMULADO ATE O DIA 11 DE MAIO (Fechamento 1a QZ)")
print("=" * 80)

# Filtrar transacoes ate o dia 11 de maio (inclusive)
df_ate_11mai = df_extrato[
    (df_extrato['Data'] <= '2026-05-11')
].copy()

print(f"Transacoes ate 11/05: {len(df_ate_11mai)}")

# Calcular saldo por CPF ate dia 11
saldo_por_cpf_11mai = df_ate_11mai.groupby('CPF_Limpo').apply(
    lambda x: (
        x[x['Tipo'] == 'CARGA']['Valor'].sum() -
        abs(x[x['Tipo'] == 'TRANSFERÊNCIA']['Valor'].sum()) -
        abs(x[x['Tipo'] == 'TARIFA']['Valor'].sum())
    )
).reset_index()
saldo_por_cpf_11mai.columns = ['CPF', 'saldo_ate_11mai']

print(f"\nTop 10 saldos ate 11/05:")
top_11mai = saldo_por_cpf_11mai.nlargest(10, 'saldo_ate_11mai')
print(top_11mai.to_string(index=False))

# ============================================
# 3. CARREGAR CARGA 1 QZ
# ============================================
print("\n" + "=" * 80)
print("3. CARGA 1 QZ")
print("=" * 80)

df_carga = pd.read_excel(CARGA_1QZ, sheet_name="Planilha1", header=5)
df_carga = df_carga[df_carga['COLABORADOR'].notna()].reset_index(drop=True)
df_carga['CPF_Limpo'] = df_carga['CPF'].astype(str).str.replace(r'\D', '', regex=True).str.zfill(11)

print(f"Total colaboradores: {len(df_carga)}")
print(f"\nTop 10 SALDO CARTAO na CARGA 1 QZ:")
top_carga = df_carga.nlargest(10, 'SALDO CARTAO')[['COLABORADOR', 'CPF_Limpo', 'SALDO CARTAO']]
print(top_carga.to_string(index=False))

# ============================================
# 4. CRUZAR SALDO ATE DIA 11 COM CARGA QZ
# ============================================
print("\n" + "=" * 80)
print("4. CRUZANDO SALDO ATE DIA 11 COM CARGA 1 QZ")
print("=" * 80)

resultados = []
nao_encontrados = []

for _, row_carga in df_carga.iterrows():
    nome = row_carga['COLABORADOR']
    cpf = row_carga['CPF_Limpo']
    saldo_carga = row_carga['SALDO CARTAO'] if pd.notna(row_carga['SALDO CARTAO']) else 0
    
    # Buscar no extrato por CPF
    saldo_row = saldo_por_cpf_11mai[saldo_por_cpf_11mai['CPF'] == cpf]
    
    if len(saldo_row) > 0:
        saldo_11mai = saldo_row.iloc[0]['saldo_ate_11mai']
        diff = abs(saldo_11mai - saldo_carga)
        
        resultados.append({
            'nome': nome,
            'cpf': cpf,
            'saldo_11mai': round(saldo_11mai, 2),
            'saldo_carga': round(saldo_carga, 2),
            'diferenca': round(diff, 2),
            'pct_diff': diff / max(abs(saldo_carga), 0.01) * 100 if saldo_carga != 0 else (100 if saldo_11mai != 0 else 0)
        })
    else:
        nao_encontrados.append({'nome': nome, 'cpf': cpf, 'saldo_carga': saldo_carga})

df_result = pd.DataFrame(resultados)

if len(df_result) > 0:
    match_perfeito = len(df_result[df_result['diferenca'] < 0.01])
    match_5pct = len(df_result[df_result['pct_diff'] < 5])
    match_10pct = len(df_result[df_result['pct_diff'] < 10])
    
    print(f"\nTotal cruzado: {len(df_result)} colaboradores")
    print(f"✓ Match perfeito (< R$ 0.01): {match_perfeito} ({match_perfeito/len(df_result)*100:.1f}%)")
    print(f"✓ Match < 5%: {match_5pct} ({match_5pct/len(df_result)*100:.1f}%)")
    print(f"✓ Match < 10%: {match_10pct} ({match_10pct/len(df_result)*100:.1f}%)")
    print(f"✗ Nao encontrados: {len(nao_encontrados)}")
    
    # Mostrar top 10
    print("\n--- Top 10 por SALDO (CARGA QZ) ---")
    top10 = df_result.nlargest(10, 'saldo_carga')[['nome', 'saldo_11mai', 'saldo_carga', 'diferenca']]
    print(top10.to_string(index=False))
    
    # Mostrar matches perfeitos
    if match_perfeito > 0:
        print(f"\n--- Matches Perfeitos ({match_perfeito} colaboradores) ---")
        matches = df_result[df_result['diferenca'] < 0.01].nlargest(10, 'saldo_carga')
        print(matches[['nome', 'saldo_11mai', 'saldo_carga']].to_string(index=False))
    
    # Mostrar maiores divergencias
    divergencias = df_result[df_result['pct_diff'] > 50]
    if len(divergencias) > 0:
        print(f"\n--- Maiores Divergencias (> 50%) - {len(divergencias)} colaboradores ---")
        print(divergencias[['nome', 'saldo_11mai', 'saldo_carga', 'diferenca', 'pct_diff']].head(10).to_string(index=False))

# ============================================
# 5. ANALISAR COLABORADOR ESPECIFICO
# ============================================
print("\n" + "=" * 80)
print("5. ANALISE DETALHADA - COLABORADOR EXEMPLO")
print("=" * 80)

# Pegar um colaborador com match ou com divergencia interessante
if len(df_result) > 0:
    # Tentar encontrar um com match proximo
    exemplo = None
    matches_proximos = df_result[(df_result['pct_diff'] < 10) & (df_result['saldo_carga'] > 100)]
    if len(matches_proximos) > 0:
        exemplo = matches_proximos.iloc[0]
    else:
        exemplo = df_result[df_result['saldo_carga'] > 1000].iloc[0] if len(df_result[df_result['saldo_carga'] > 1000]) > 0 else df_result.iloc[0]
    
    if exemplo is not None:
        cpf_ex = exemplo['cpf']
        nome_ex = exemplo['nome']
        
        print(f"\nColaborador: {nome_ex}")
        print(f"CPF: {cpf_ex}")
        print(f"Saldo CARGA QZ: R$ {exemplo['saldo_carga']:.2f}")
        print(f"Saldo calculado ate 11/05: R$ {exemplo['saldo_11mai']:.2f}")
        print(f"Diferenca: R$ {exemplo['diferenca']:.2f}")
        
        # Mostrar todas as transacoes ate o dia 11
        user_trans = df_ate_11mai[df_ate_11mai['CPF_Limpo'] == cpf_ex]
        print(f"\nTransacoes ate 11/05 ({len(user_trans)} total):")
        
        resumo = user_trans.groupby('Tipo')['Valor'].agg(['count', 'sum'])
        print(resumo.to_string())
        
        print("\nDetalhamento (primeiras 10):")
        detalhe = user_trans[['Data', 'Dia', 'Tipo', 'Valor', 'Descrição']].head(10)
        print(detalhe.to_string(index=False))

# ============================================
# 6. TESTAR TAMBEM COM DATA ATE DIA 10 (ANTES DO FECHAMENTO)
# ============================================
print("\n" + "=" * 80)
print("6. TESTANDO SALDO ATE DIA 10 DE MAIO (ANTES DO FECHAMENTO)")
print("=" * 80)

df_ate_10mai = df_extrato[df_extrato['Data'] <= '2026-05-10'].copy()

saldo_por_cpf_10mai = df_ate_10mai.groupby('CPF_Limpo').apply(
    lambda x: (
        x[x['Tipo'] == 'CARGA']['Valor'].sum() -
        abs(x[x['Tipo'] == 'TRANSFERÊNCIA']['Valor'].sum()) -
        abs(x[x['Tipo'] == 'TARIFA']['Valor'].sum())
    )
).reset_index()
saldo_por_cpf_10mai.columns = ['CPF', 'saldo_ate_10mai']

# Cruzar
resultados_10 = []
for _, row_carga in df_carga.iterrows():
    cpf = row_carga['CPF_Limpo']
    saldo_carga = row_carga['SALDO CARTAO'] if pd.notna(row_carga['SALDO CARTAO']) else 0
    
    saldo_row = saldo_por_cpf_10mai[saldo_por_cpf_10mai['CPF'] == cpf]
    if len(saldo_row) > 0:
        saldo_10mai = saldo_row.iloc[0]['saldo_ate_10mai']
        diff = abs(saldo_10mai - saldo_carga)
        resultados_10.append({'saldo_10mai': saldo_10mai, 'saldo_carga': saldo_carga, 'diff': diff})

df_result_10 = pd.DataFrame(resultados_10)
if len(df_result_10) > 0:
    match_10 = len(df_result_10[df_result_10['diff'] < 0.01])
    match_10_val = match_10/len(df_result_10)*100 if len(df_result_10) > 0 else 0
    print(f"\nCruzados: {len(df_result_10)}")
    print(f"Match perfeito ate DIA 10: {match_10} ({match_10_val:.1f}%)")
    print(f"Match perfeito ate DIA 11: {match_perfeito} ({match_perfeito/len(df_result)*100:.1f}%)")

print("\n" + "=" * 80)
print("CONCLUSAO")
print("=" * 80)

if len(df_result) > 0:
    print(f"""
## RESULTADO

Período testado: Até dia 11 de maio (inclusive)
- Total cruzado: {len(df_result)} colaboradores
- Match perfeito: {match_perfeito} ({match_perfeito/len(df_result)*100:.1f}%)
- Match < 10%: {match_10pct} ({match_10pct/len(df_result)*100:.1f}%)

Se o saldo for ate dia 10 (excluindo o dia 11):
- Match perfeito: {match_10 if len(df_result_10) > 0 else 0} ({match_10/len(df_result_10)*100:.1f if len(df_result_10) > 0 else 0}%)

## ANALISE

O SALDO CARTAO na CARGA QZ {'BATE' if match_perfeito/len(df_result) > 0.8 else 'NAO BATE completamente'} com o saldo acumulado 
ate o dia de fechamento.

Possiveis causas de divergencia:
1. O saldo pode ser ate o dia 10 (nao inclusive o 11)
2. O saldo pode incluir transacoes do dia 11 apenas ate um horario especifico
3. O saldo pode ser de outro momento (fim do dia anterior, inicio do dia 11, etc.)
4. O extrato pode nao ter todas as transacoes ate o momento do snapshot
""")
