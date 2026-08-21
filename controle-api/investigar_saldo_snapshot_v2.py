#!/usr/bin/env python3
"""
Investigar SALDO CARTAO com base na hipotese do usuário:
1. Analisar campos com tipo NULL
2. Calcular saldo acumulado dia a dia
3. Encontrar o snapshot correto antes do fechamento
"""

import pandas as pd
import sqlite3
from pathlib import Path
from datetime import datetime

DB_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/historico_extrato.db")
CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")
CTRL_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")

print("=" * 80)
print("INVESTIGACAO SALDO CARTAO - ANALISE PROFUNDA")
print("=" * 80)

# ============================================
# 1. ANALISAR ESTRUTURA DO EXTRATO NO BANCO
# ============================================
print("\n" + "=" * 80)
print("1. ANALISANDO ESTRUTURA DO EXTRATO NO BANCO SQLITE")
print("=" * 80)

conn = sqlite3.connect(DB_FILE)

# Verificar todas as transacoes
query_all = """
    SELECT tipo, COUNT(*) as count, 
           SUM(CASE WHEN valor > 0 THEN valor ELSE 0 END) as positivos,
           SUM(CASE WHEN valor < 0 THEN valor ELSE 0 END) as negativos
    FROM extrato 
    GROUP BY tipo
"""
df_tipos = pd.read_sql_query(query_all, conn)
print("\nDistribuicao por tipo:")
print(df_tipos.to_string(index=False))

# Verificar campos NULL ou vazios
query_null = """
    SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN tipo IS NULL OR tipo = '' THEN 1 ELSE 0 END) as tipo_null,
        SUM(CASE WHEN usuario IS NULL OR usuario = '' THEN 1 ELSE 0 END) as usuario_null,
        SUM(CASE WHEN descricao IS NULL OR descricao = '' THEN 1 ELSE 0 END) as desc_null
    FROM extrato
"""
df_null = pd.read_sql_query(query_null, conn)
print("\nCampos NULL ou vazios:")
print(df_null.to_string(index=False))

# Analisar transacoes com tipo NULL
query_tipo_null = """
    SELECT *
    FROM extrato 
    WHERE tipo IS NULL OR tipo = ''
    LIMIT 10
"""
df_tipo_null = pd.read_sql_query(query_tipo_null, conn)
if len(df_tipo_null) > 0:
    print("\nExemplos de transacoes com tipo NULL:")
    print(df_tipo_null.to_string())
else:
    print("\nNenhuma transacao com tipo NULL encontrada.")

conn.close()

# ============================================
# 2. CARREGAR EXTRATO DA PLANILHA DE CONTROLE
# ============================================
print("\n" + "=" * 80)
print("2. ANALISANDO EXTRATO DA PLANILHA DE CONTROLE")
print("=" * 80)

df_extrato_ctrl = pd.read_excel(CTRL_FILE, sheet_name="EXTRATO", header=7)

print(f"\nColunas: {list(df_extrato_ctrl.columns)}")
print(f"\nTotal transacoes: {len(df_extrato_ctrl)}")

# Verificar tipos unicos
print("\nTipos de transacao:")
print(df_extrato_ctrl['Tipo'].value_counts(dropna=False).to_string())

# Verificar valores nulos
print("\nValores NULL por coluna:")
for col in df_extrato_ctrl.columns:
    null_count = df_extrato_ctrl[col].isna().sum()
    if null_count > 0:
        print(f"  {col}: {null_count} NULL")

# Verificar se ha algum padrao especial nas transacoes
print("\nPrimeiras 20 transacoes com detalhes:")
print(df_extrato_ctrl[['Data', 'Usuário', 'Tipo', 'Valor', 'Descrição']].head(20).to_string())

# ============================================
# 3. CALCULAR SALDO ACUMULADO DIA A DIA
# ============================================
print("\n" + "=" * 80)
print("3. CALCULANDO SALDO ACUMULADO DIA A DIA")
print("=" * 80)

# Preparar dados
df_extrato_ctrl['Valor'] = pd.to_numeric(df_extrato_ctrl['Valor'], errors='coerce')
df_extrato_ctrl['Data'] = pd.to_datetime(df_extrato_ctrl['Data'], unit='D', origin='1899-12-30', errors='coerce')
df_extrato_ctrl['CPF_Limpo'] = df_extrato_ctrl['CPF'].astype(str).str.replace(r'\D', '', regex=True)

# Carregar CARGA 1 QZ
df_carga = pd.read_excel(CARGA_1QZ, sheet_name="Planilha1", header=5)
df_carga = df_carga[df_carga['COLABORADOR'].notna()].reset_index(drop=True)
df_carga['CPF_Limpo'] = df_carga['CPF'].astype(str).str.replace(r'\D', '', regex=True).str.zfill(11)

# Funcao para calcular saldo acumulado por dia
def calcular_saldo_diario(cpf, ate_data=None):
    trans = df_extrato_ctrl[df_extrato_ctrl['CPF_Limpo'] == cpf].sort_values('Data')
    
    if ate_data:
        trans = trans[trans['Data'] <= ate_data]
    
    if len(trans) == 0:
        return None, None
    
    # Agrupar por dia
    trans['Data_Dia'] = trans['Data'].dt.date
    
    saldo_por_dia = []
    saldo_acumulado = 0
    
    for data_dia, grupo in trans.groupby('Data_Dia'):
        carga = grupo[grupo['Tipo'] == 'CARGA']['Valor'].sum()
        transf = grupo[grupo['Tipo'] == 'TRANSFERÊNCIA']['Valor'].sum()  # Ja vem negativo
        tarifa = grupo[grupo['Tipo'] == 'TARIFA']['Valor'].sum()  # Ja vem negativo
        
        saldo_dia = carga + transf + tarifa  # Soma porque transf e tarifa ja sao negativos
        saldo_acumulado += saldo_dia
        
        saldo_por_dia.append({
            'data': data_dia,
            'carga': carga,
            'transf': transf,
            'tarifa': tarifa,
            'saldo_dia': saldo_dia,
            'saldo_acum': saldo_acumulado
        })
    
    return pd.DataFrame(saldo_por_dia), saldo_acumulado

# ============================================
# 4. TESTAR COM COLABORADORES DA CARGA QZ
# ============================================
print("\n" + "=" * 80)
print("4. TESTANDO COM COLABORADORES DA CARGA QZ")
print("=" * 80)

# Pegar amostra de colaboradores com saldo > 0
amostra = df_carga[df_carga['SALDO CARTAO'] > 0].head(15)

resultados = []

for _, row_carga in amostra.iterrows():
    nome = row_carga['COLABORADOR']
    cpf = row_carga['CPF_Limpo']
    saldo_carga = row_carga['SALDO CARTAO']
    
    df_saldo, saldo_final = calcular_saldo_diario(cpf)
    
    if df_saldo is None or len(df_saldo) == 0:
        continue
    
    # Verificar se algum saldo_acumulado bate com saldo_carga
    match_idx = None
    for idx, row in df_saldo.iterrows():
        if abs(row['saldo_acum'] - saldo_carga) < 0.01:
            match_idx = idx
            break
    
    resultados.append({
        'nome': nome[:35],
        'cpf': cpf,
        'saldo_carga': saldo_carga,
        'saldo_final_calc': round(saldo_final, 2) if saldo_final else None,
        'num_trans': len(df_saldo),
        'match': match_idx is not None,
        'data_match': df_saldo.iloc[match_idx]['data'] if match_idx is not None else None
    })
    
    # Mostrar detalhado para os primeiros
    if len(resultados) <= 5:
        print(f"\n{'='*60}")
        print(f"Colaborador: {nome}")
        print(f"CPF: {cpf}")
        print(f"SALDO CARGA QZ: R$ {saldo_carga:.2f}")
        print(f"\nEvolucao do saldo:")
        print(df_saldo[['data', 'carga', 'transf', 'tarifa', 'saldo_acum']].to_string(index=False))
        
        if match_idx is not None:
            print(f"\n✓✓✓ MATCH no dia {df_saldo.iloc[match_idx]['data']}! ✓✓✓")

df_res = pd.DataFrame(resultados)
if len(df_res) > 0:
    print(f"\n{'='*80}")
    print("RESUMO DOS TESTES")
    print(f"{'='*80}")
    print(df_res[['nome', 'saldo_carga', 'saldo_final_calc', 'match', 'data_match']].to_string(index=False))
    
    matches = len(df_res[df_res['match'] == True])
    print(f"\n\nTotal: {len(df_res)} colaboradores testados")
    print(f"Matches: {matches} ({matches/len(df_res)*100:.1f}%)")

# ============================================
# 5. TESTAR HIPOTESE DE DATA ESPECIFICA
# ============================================
print("\n" + "=" * 80)
print("5. TESTANDO DATA ESPECIFICA: ATE DIA 10/05 (ANTES DO FECHAMENTO)")
print("=" * 80)

resultados_10mai = []

for _, row_carga in amostra.iterrows():
    nome = row_carga['COLABORADOR']
    cpf = row_carga['CPF_Limpo']
    saldo_carga = row_carga['SALDO CARTAO']
    
    df_saldo, saldo_final = calcular_saldo_diario(cpf, ate_data='2026-05-10')
    
    if df_saldo is not None and len(df_saldo) > 0:
        saldo_10mai = df_saldo.iloc[-1]['saldo_acum'] if len(df_saldo) > 0 else 0
        diff = abs(saldo_10mai - saldo_carga)
        
        resultados_10mai.append({
            'nome': nome[:30],
            'saldo_carga': saldo_carga,
            'saldo_10mai': round(saldo_10mai, 2),
            'diff': round(diff, 2),
            'match': diff < 0.01
        })

df_res_10 = pd.DataFrame(resultados_10mai)
if len(df_res_10) > 0:
    print(f"\nResultados (saldo ate 10/05):")
    print(df_res_10.to_string(index=False))
    
    matches_10 = len(df_res_10[df_res_10['match']])
    print(f"\nMatches ate dia 10/05: {matches_10}/{len(df_res_10)} ({matches_10/len(df_res_10)*100:.1f}%)")

# ============================================
# CONCLUSAO
# ============================================
print("\n" + "=" * 80)
print("CONCLUSAO")
print("=" * 80)

if len(df_res) > 0:
    total_match = len(df_res[df_res['match']])
    print(f"""
RESULTADOS:
- Colaboradores analisados: {len(df_res)}
- Matches em algum dia especifico: {total_match} ({total_match/len(df_res)*100:.1f}%)
- Matches ate dia 10/05: {matches_10 if len(df_res_10) > 0 else 0} ({matches_10/len(df_res_10)*100:.1f if len(df_res_10) > 0 else 0}%)

Se houver matches, o SALDO CARTAO e o saldo acumulado ate uma data especifica.
Se nao houver, pode ser:
1. Saldo de uma data que nao esta no extrato
2. Valor informado manualmente
3. Saldo de um sistema diferente
""")
