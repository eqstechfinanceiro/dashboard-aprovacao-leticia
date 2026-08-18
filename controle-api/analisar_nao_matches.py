#!/usr/bin/env python3
"""
Analisar os casos que NAO deram match para identificar o problema
"""

import pandas as pd
import sqlite3
from pathlib import Path
from difflib import SequenceMatcher

DB_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/historico_extrato.db")
CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")

print("=" * 80)
print("ANALISANDO CASOS SEM MATCH (5.4%)")
print("=" * 80)

# Carregar CARGA 1 QZ
df_carga = pd.read_excel(CARGA_1QZ, sheet_name="Planilha1", header=5)
df_carga = df_carga[df_carga['COLABORADOR'].notna()].reset_index(drop=True)

conn = sqlite3.connect(DB_FILE)

# Buscar todos os usuarios do banco
query_users = "SELECT DISTINCT usuario FROM extrato WHERE usuario IS NOT NULL"
df_users = pd.read_sql_query(query_users, conn)
usuarios_banco = df_users['usuario'].tolist()

# Funcao para melhor match
def find_best_match(nome_carga, usuarios_banco):
    nome_carga_clean = nome_carga.strip().upper()
    best_match = None
    best_ratio = 0
    
    for usuario in usuarios_banco:
        ratio = SequenceMatcher(None, nome_carga_clean, usuario.upper()).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = usuario
    
    return best_match, best_ratio

# Analisar todos os colaboradores com saldo > 0
amostra = df_carga[df_carga['SALDO CARTAO'] > 0]

nao_matches = []

print(f"\nTotal para analisar: {len(amostra)} colaboradores\n")

for idx, row in amostra.iterrows():
    nome = row['COLABORADOR']
    saldo_carga = row['SALDO CARTAO']
    
    # Encontrar match no banco
    match, ratio = find_best_match(nome, usuarios_banco)
    
    if not match or ratio < 0.7:
        nao_matches.append({
            'nome': nome,
            'saldo_carga': saldo_carga,
            'motivo': f'Match baixo ({ratio:.2f})',
            'usuario_banco': match if match else 'N/A',
            'detalhes': None
        })
        continue
    
    # Buscar todos os snapshots deste usuario
    query = """
        SELECT data, valor, descricao
        FROM extrato 
        WHERE usuario = ?
        AND (tipo IS NULL OR tipo = '')
        ORDER BY data
    """
    df_snaps = pd.read_sql_query(query, conn, params=(match,))
    
    # Verificar se ha match
    encontrou_match = False
    for _, snap in df_snaps.iterrows():
        if abs(snap['valor'] - saldo_carga) < 0.01:
            encontrou_match = True
            break
    
    if not encontrou_match:
        # Analisar o motivo
        if len(df_snaps) == 0:
            motivo = 'Sem snapshots no banco'
            detalhes = None
        else:
            # Ver os snapshots mais proximos
            df_snaps['diff'] = abs(df_snaps['valor'] - saldo_carga)
            mais_proximo = df_snaps.loc[df_snaps['diff'].idxmin()]
            
            motivo = 'Valor nao bate'
            detalhes = {
                'snap_mais_proximo_valor': mais_proximo['valor'],
                'snap_mais_proximo_data': mais_proximo['data'][:10] if mais_proximo['data'] else 'N/A',
                'diferenca': mais_proximo['diff'],
                'total_snaps': len(df_snaps)
            }
        
        nao_matches.append({
            'nome': nome,
            'saldo_carga': saldo_carga,
            'motivo': motivo,
            'usuario_banco': match,
            'detalhes': detalhes
        })

conn.close()

# Analisar resultados
print(f"Total de NAO matches: {len(nao_matches)} ({len(nao_matches)/len(amostra)*100:.1f}%)\n")

# Agrupar por motivo
from collections import Counter
motivos = [nm['motivo'] for nm in nao_matches]
contagem_motivos = Counter(motivos)

print("=" * 80)
print("DISTRIBUICAO DOS MOTIVOS")
print("=" * 80)
for motivo, count in contagem_motivos.most_common():
    print(f"\n{motivo}: {count} casos")
    
    # Mostrar exemplos
    exemplos = [nm for nm in nao_matches if nm['motivo'] == motivo][:5]
    for ex in exemplos:
        print(f"  - {ex['nome'][:40]:40} | Saldo CARGA: R$ {ex['saldo_carga']:8.2f}")
        if ex['detalhes']:
            print(f"    Snapshot mais proximo: R$ {ex['detalhes']['snap_mais_proximo_valor']:.2f} em {ex['detalhes']['snap_mais_proximo_data']}")
            print(f"    Diferenca: R$ {ex['detalhes']['diferenca']:.2f}")

print("\n" + "=" * 80)
print("ANALISE DETALHADA DOS CASOS 'Valor nao bate'")
print("=" * 80)

nao_bate = [nm for nm in nao_matches if nm['motivo'] == 'Valor nao bate']
print(f"\nTotal: {len(nao_bate)} casos\n")

for caso in nao_bate[:10]:
    print(f"Colaborador: {caso['nome']}")
    print(f"  SALDO CARGA QZ: R$ {caso['saldo_carga']:.2f}")
    print(f"  Snapshot mais proximo: R$ {caso['detalhes']['snap_mais_proximo_valor']:.2f} ({caso['detalhes']['snap_mais_proximo_data']})")
    print(f"  Diferenca: R$ {caso['detalhes']['diferenca']:.2f}")
    print(f"  Total de snapshots: {caso['detalhes']['total_snaps']}")
    print()
