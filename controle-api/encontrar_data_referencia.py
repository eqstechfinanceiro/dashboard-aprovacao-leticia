#!/usr/bin/env python3
"""
Encontrar qual data de referencia o SALDO CARTAO usa
Testar diferentes hipoteses: ultimo dia do mes anterior, dia da ultima carga, etc.
"""

import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta

CTRL_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")

print("=" * 80)
print("ENCONTRANDO DATA DE REFERENCIA DO SALDO CARTAO")
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
# Analisar colaboradores um por um
# ============================================
print("\n" + "=" * 80)
print("ANALISE COLABORADOR POR COLABORADOR")
print("=" * 80)

resultados = []

# Pegar os primeiros 20 colaboradores com saldo > 0
amostra = df_carga[df_carga['SALDO CARTAO'] > 0].head(20)

for _, row_carga in amostra.iterrows():
    nome = row_carga['COLABORADOR']
    cpf = row_carga['CPF_Limpo']
    saldo_carga = row_carga['SALDO CARTAO']
    
    # Buscar transacoes
    trans = df_extrato[df_extrato['CPF_Limpo'] == cpf].sort_values('Data')
    
    if len(trans) == 0:
        continue
    
    # Calcular saldo acumulado ate cada transacao
    saldo_acum = 0
    match_dias = []
    
    for _, t in trans.iterrows():
        if t['Tipo'] == 'CARGA':
            saldo_acum += t['Valor']
        elif t['Tipo'] == 'TRANSFERÊNCIA':
            saldo_acum += t['Valor']  # Valor ja e negativo
        elif t['Tipo'] == 'TARIFA':
            saldo_acum += t['Valor']  # Valor ja e negativo
        
        # Verificar se bate com saldo da carga
        if abs(saldo_acum - saldo_carga) < 0.01:
            match_dias.append({
                'data': t['Data'].strftime('%Y-%m-%d'),
                'tipo': t['Tipo'],
                'valor': t['Valor'],
                'saldo_acum': saldo_acum
            })
    
    if match_dias:
        resultados.append({
            'nome': nome,
            'cpf': cpf,
            'saldo_carga': saldo_carga,
            'num_trans': len(trans),
            'matchs': len(match_dias),
            'primeiro_match': match_dias[0]['data'] if match_dias else None,
            'tipo_match': match_dias[0]['tipo'] if match_dias else None
        })

# Mostrar resultados
df_res = pd.DataFrame(resultados)
if len(df_res) > 0:
    print(f"\nColaboradores onde SALDO CARTAO bate com saldo acumulado em algum dia:")
    print(df_res[['nome', 'saldo_carga', 'num_trans', 'matchs', 'primeiro_match', 'tipo_match']].to_string(index=False))
    
    # Analisar distribuicao das datas de match
    print(f"\n\nDistribuicao das datas de match:")
    datas_match = df_res['primeiro_match'].value_counts()
    print(datas_match.to_string())
    
    # Analisar tipos de transacao que dao match
    print(f"\n\nTipos de transacao que dao match:")
    tipos_match = df_res['tipo_match'].value_counts()
    print(tipos_match.to_string())

# ============================================
# Testar hipoteses de datas fixas
# ============================================
print("\n" + "=" * 80)
print("TESTANDO DATAS FIXAS COMO REFERENCIA")
print("=" * 80)

# Hipoteses de datas de referencia
hipoteses = [
    ("2026-04-30", "Ultimo dia de Abril"),
    ("2026-05-01", "Primeiro dia de Maio"),
    ("2026-04-25", "Dia 25 de Abril (fechamento 2a QZ anterior)"),
    ("2026-04-26", "Dia 26 de Abril (inicio 1a QZ)"),
    ("2026-04-15", "Dia 15 de Abril (meio do mes)"),
]

for data_ref, desc in hipoteses:
    print(f"\n--- Testando: {desc} ({data_ref}) ---")
    
    matches = 0
    total_testados = 0
    
    for _, row_carga in amostra.iterrows():
        cpf = row_carga['CPF_Limpo']
        saldo_carga = row_carga['SALDO CARTAO']
        
        # Calcular saldo ate a data de referencia
        trans_ate = df_extrato[
            (df_extrato['CPF_Limpo'] == cpf) & 
            (df_extrato['Data'] <= data_ref)
        ]
        
        carga = trans_ate[trans_ate['Tipo'] == 'CARGA']['Valor'].sum()
        transf = abs(trans_ate[trans_ate['Tipo'] == 'TRANSFERÊNCIA']['Valor'].sum())
        tarifa = abs(trans_ate[trans_ate['Tipo'] == 'TARIFA']['Valor'].sum())
        saldo_calc = carga - transf - tarifa
        
        total_testados += 1
        if abs(saldo_calc - saldo_carga) < 0.01:
            matches += 1
    
    print(f"  Matches: {matches}/{total_testados} ({matches/total_testados*100:.1f}%)")

print("\n" + "=" * 80)
print("CONCLUSAO")
print("=" * 80)
print("""
Se houver concentracao de matches em uma data especifica, 
essa e a data de referencia usada para o SALDO CARTAO.

Se nao houver padrao claro, o SALDO CARTAO pode ser:
1. O saldo apos a ULTIMA CARGA antes da quinzena
2. O saldo em uma data arbitraria definida pelo financeiro
3. Um valor manual/externo nao derivado do extrato
""")
