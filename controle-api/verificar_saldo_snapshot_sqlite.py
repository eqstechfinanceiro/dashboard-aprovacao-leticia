#!/usr/bin/env python3
"""
Verificar se há linhas snapshot (sem codigo de transacao) no SQLite
E comparar com CARGA QZ
"""

import pandas as pd
import sqlite3
from pathlib import Path

DB_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/historico_extrato.db")
CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")
CTRL_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")

print("=" * 80)
print("VERIFICANDO LINHAS SNAPSHOT NO SQLITE")
print("=" * 80)

# ============================================
# 1. VERIFICAR SE HA DESCRICOES ESPECIAIS NO SQLITE
# ============================================
conn = sqlite3.connect(DB_FILE)

print("\n1. Analisando descricoes unicas no banco:")
query_desc = """
    SELECT descricao, COUNT(*) as count, AVG(valor) as avg_valor
    FROM extrato 
    GROUP BY descricao
    ORDER BY count DESC
    LIMIT 20
"""
df_desc = pd.read_sql_query(query_desc, conn)
print(df_desc.to_string(index=False))

# ============================================
# 2. VERIFICAR TRANSACOES DE FILIPE MENEZES KLING
# ============================================
print("\n" + "=" * 80)
print("2. TRANSACOES DE FILIPE MENEZES KLING NO SQLITE")
print("=" * 80)

query_filipe = """
    SELECT data, usuario, tipo, valor, descricao
    FROM extrato 
    WHERE usuario LIKE '%filipe%kling%'
    AND data BETWEEN '2026-04-01' AND '2026-05-15'
    ORDER BY data
"""
df_filipe_sqlite = pd.read_sql_query(query_filipe, conn)
print(f"\nTotal transacoes: {len(df_filipe_sqlite)}")
print(df_filipe_sqlite.to_string(index=False))

# Calcular saldo acumulado
print("\n\nEvolucao do saldo:")
saldo = 0
for _, row in df_filipe_sqlite.iterrows():
    saldo += row['valor']
    data_str = str(row['data'])[:10] if pd.notna(row['data']) else 'N/A'
    tipo_val = str(row['tipo']) if pd.notna(row['tipo']) else 'NaN'
    tipo_str = tipo_val[:20].ljust(20)
    print(f"  {data_str} | {tipo_str} | {row['valor']:8.2f} | Saldo: {saldo:8.2f}")

conn.close()

# ============================================
# 3. VERIFICAR NO EXTRATO DA PLANILHA DE CONTROLE
# ============================================
print("\n" + "=" * 80)
print("3. EXTRATO DA PLANILHA DE CONTROLE - FILIPE")
print("=" * 80)

df_extrato_ctrl = pd.read_excel(CTRL_FILE, sheet_name="EXTRATO", header=7)
df_extrato_ctrl['Valor'] = pd.to_numeric(df_extrato_ctrl['Valor'], errors='coerce')
df_extrato_ctrl['Data'] = pd.to_datetime(df_extrato_ctrl['Data'], unit='D', origin='1899-12-30', errors='coerce')
df_extrato_ctrl['CPF_Limpo'] = df_extrato_ctrl['CPF'].astype(str).str.replace(r'\D', '', regex=True)

# Buscar Filipe
filipe_ctrl = df_extrato_ctrl[df_extrato_ctrl['Usuário'].str.contains('FILIPE', case=False, na=False)]
print(f"\nTotal transacoes: {len(filipe_ctrl)}")

# Verificar se ha linhas com codigo de transacao vazio
filipe_sem_cod = filipe_ctrl[filipe_ctrl['Código de Transação'].isna() | (filipe_ctrl['Código de Transação'] == '')]
print(f"\nLinhas SEM codigo de transacao: {len(filipe_sem_cod)}")

if len(filipe_sem_cod) > 0:
    print("\nDetalhes das linhas sem codigo:")
    print(filipe_sem_cod[['Data', 'Código de Transação', 'Tipo', 'Valor', 'Descrição']].to_string())

# Mostrar todas as transacoes ordenadas
print("\n\nTodas as transacoes de Filipe (primeiras 30):")
print(filipe_ctrl[['Data', 'Código de Transação', 'Tipo', 'Valor', 'Descrição']].head(30).to_string())

# ============================================
# 4. COMPARAR COM CARGA 1 QZ
# ============================================
print("\n" + "=" * 80)
print("4. CARGA 1 QZ - DADOS DE FILIPE")
print("=" * 80)

df_carga = pd.read_excel(CARGA_1QZ, sheet_name="Planilha1", header=5)
df_carga = df_carga[df_carga['COLABORADOR'].notna()]
filipe_carga = df_carga[df_carga['COLABORADOR'].str.contains('FILIPE', case=False, na=False)]

if len(filipe_carga) > 0:
    print("\nDados na CARGA 1 QZ:")
    print(filipe_carga[['COLABORADOR', 'CPF', 'SALDO CARTAO', '1ª QZ', 'CARGA PARCIAL']].to_string())
    
    saldo_cartao_carga = filipe_carga.iloc[0]['SALDO CARTAO']
    print(f"\n>>> SALDO CARTAO na CARGA QZ: R$ {saldo_cartao_carga:.2f}")

# ============================================
# CONCLUSAO
# ============================================
print("\n" + "=" * 80)
print("ANALISE")
print("=" * 80)

print("""
Verificar:
1. Se ha linhas sem 'Código de Transação' no extrato da planilha
2. Se essas linhas representam o saldo snapshot
3. Se o valor dessas linhas na data de fechamento bate com SALDO CARTAO na CARGA QZ
""")
