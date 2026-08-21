#!/usr/bin/env python3
"""
Investigacao detalhada das divergencias para entender impacto na carga dinamica
"""

import pandas as pd
import sqlite3
from pathlib import Path
from difflib import SequenceMatcher

DB_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/historico_extrato.db")
CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")

print("=" * 80)
print("INVESTIGACAO DETALHADA DAS DIVERGENCIAS")
print("=" * 80)

# Carregar CARGA 1 QZ
df_carga = pd.read_excel(CARGA_1QZ, sheet_name="Planilha1", header=5)
df_carga = df_carga[df_carga['COLABORADOR'].notna()].reset_index(drop=True)
df_carga['CPF_Limpo'] = df_carga['CPF'].astype(str).str.replace(r'\D', '', regex=True).str.zfill(11)

conn = sqlite3.connect(DB_FILE)

# Buscar todos os usuarios
query_users = "SELECT DISTINCT usuario FROM extrato WHERE usuario IS NOT NULL"
df_users = pd.read_sql_query(query_users, conn)
usuarios_banco = df_users['usuario'].tolist()

def find_match(nome_carga, usuarios_banco):
    # Match exato primeiro
    for usuario in usuarios_banco:
        if usuario.upper() == nome_carga.strip().upper():
            return usuario, 1.0
    # Fuzzy
    best_ratio = 0
    best_match = None
    for usuario in usuarios_banco:
        ratio = SequenceMatcher(None, nome_carga.upper(), usuario.upper()).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = usuario
    if best_ratio >= 0.8:
        return best_match, best_ratio
    return None, 0

# Funcao para analisar um colaborador especifico
def analisar_colaborador(nome, saldo_carga, usuario_match, categoria):
    print(f"\n{'='*80}")
    print(f"ANALISANDO: {nome}")
    print(f"Categoria: {categoria}")
    print(f"SALDO CARGA QZ: R$ {saldo_carga:.2f}")
    print(f"Usuario no banco: {usuario_match}")
    print(f"{'='*80}")
    
    # Buscar todos os snapshots
    query_snaps = """
        SELECT data, valor
        FROM extrato 
        WHERE usuario = ?
        AND (tipo IS NULL OR tipo = '')
        ORDER BY data
    """
    df_snaps = pd.read_sql_query(query_snaps, conn, params=(usuario_match,))
    
    # Buscar todas as transacoes entre 25/04 e 15/05
    query_trans = """
        SELECT data, tipo, valor, descricao
        FROM extrato 
        WHERE usuario = ?
        AND data BETWEEN '2026-04-25' AND '2026-05-15'
        ORDER BY data
    """
    df_trans = pd.read_sql_query(query_trans, conn, params=(usuario_match,))
    
    # Encontrar snapshot mais proximo
    if len(df_snaps) > 0:
        df_snaps['diff'] = abs(df_snaps['valor'] - saldo_carga)
        idx_mais_proximo = df_snaps['diff'].idxmin()
        snap_mais_proximo = df_snaps.loc[idx_mais_proximo]
        
        print(f"\nTotal snapshots: {len(df_snaps)}")
        print(f"Snapshot mais proximo: R$ {snap_mais_proximo['valor']:.2f} em {snap_mais_proximo['data'][:10]}")
        print(f"Diferenca: R$ {snap_mais_proximo['diff']:.2f}")
        
        # Verificar se tem snapshots MAIS RECENTES que o mais proximo
        snaps_mais_recentes = df_snaps[df_snaps['data'] > snap_mais_proximo['data']]
        if len(snaps_mais_recentes) > 0:
            print(f"\n⚠️  ATENCAO: Existem {len(snaps_mais_recentes)} snapshots MAIS RECENTES:")
            for _, snap in snaps_mais_recentes.iterrows():
                print(f"    {snap['data'][:10]} | R$ {snap['valor']:.2f}")
        
        # Verificar transacoes posteriores ao snapshot mais proximo
        trans_posteriores = df_trans[df_trans['data'] > snap_mais_proximo['data']]
        if len(trans_posteriores) > 0:
            print(f"\nTransacoes POSTERIORES ao snapshot mais proximo:")
            
            # Calcular saldo teorico
            saldo_teorico = snap_mais_proximo['valor']
            cargas = 0
            transferencias = 0
            tarifas = 0
            
            for _, trans in trans_posteriores.iterrows():
                tipo = str(trans['tipo']) if pd.notna(trans['tipo']) else 'SNAPSHOT'
                if tipo == 'CARGA':
                    cargas += trans['valor']
                elif tipo == 'TRANSFERÊNCIA':
                    transferencias += trans['valor']
                elif tipo == 'TARIFA':
                    tarifas += trans['valor']
                print(f"    {trans['data'][:10]} | {tipo:15} | R$ {trans['valor']:8.2f}")
            
            print(f"\nCalculo teorico apos o snapshot:")
            print(f"  Snapshot:        R$ {snap_mais_proximo['valor']:.2f}")
            print(f"  + CARGAS:        R$ {cargas:.2f}")
            print(f"  + TRANSFERENCIAS: R$ {transferencias:.2f}")
            print(f"  + TARIFAS:       R$ {tarifas:.2f}")
            saldo_final = snap_mais_proximo['valor'] + cargas + transferencias + tarifas
            print(f"  = Saldo teorico: R$ {saldo_final:.2f}")
            print(f"\n  SALDO CARGA QZ:  R$ {saldo_carga:.2f}")
            print(f"  Diferenca:       R$ {abs(saldo_final - saldo_carga):.2f}")
            
            if abs(saldo_final - saldo_carga) < 0.01:
                print(f"\n  ✓✓✓ O SALDO CARGA QZ corresponde ao saldo calculado apos transacoes posteriores!")
    else:
        print("Nenhum snapshot encontrado!")

# ============================================
# CATEGORIA 1: Saldo CARGA = 0, snapshot > 0
# ============================================
print("\n" + "=" * 80)
print("CATEGORIA 1: SALDO CARGA = 0, MAS SNAPSHOT TEM VALOR")
print("=" * 80)

cat1_nomes = [
    'DEISE SOARES DE CAMPOS',
    'ANDRE PINHEIRO BALOTIN',
    'LEANDRO FIGUEREDO BELCHIOR',
    'BRUNO EDUARDO DE SOUZA',
    'FABIO APARECIDO DE SOUSA PEREIRA'
]

for nome in cat1_nomes:
    row = df_carga[df_carga['COLABORADOR'] == nome]
    if len(row) > 0:
        saldo = row.iloc[0]['SALDO CARTAO']
        match, ratio = find_match(nome, usuarios_banco)
        if match:
            analisar_colaborador(nome, saldo, match, "CATEGORIA 1 (Saldo=0)")

# ============================================
# CATEGORIA 2: Diferencas grandes
# ============================================
print("\n\n" + "=" * 80)
print("CATEGORIA 2: DIFERENCAS GRANDES (> R$ 10)")
print("=" * 80)

cat2_nomes = [
    'WALTER DE CAMPOS NUNES NETO',
    'DIVAN ALVES DE AMORIM',
    'LUCAS DE PAULA SILVA',
    'VICTOR MIGUEL PALARO',
    'LUCIANO JOSE DA CUNHA'
]

for nome in cat2_nomes:
    row = df_carga[df_carga['COLABORADOR'] == nome]
    if len(row) > 0:
        saldo = row.iloc[0]['SALDO CARTAO']
        match, ratio = find_match(nome, usuarios_banco)
        if match:
            analisar_colaborador(nome, saldo, match, "CATEGORIA 2 (Dif. grande)")

conn.close()

print("\n" + "=" * 80)
print("CONCLUSAO DA INVESTIGACAO")
print("=" * 80)
