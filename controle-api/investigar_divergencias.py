#!/usr/bin/env python3
"""
Investigar padroes nas divergencias de SALDO CARTAO
"""

import pandas as pd
import sqlite3
from pathlib import Path
from difflib import SequenceMatcher

DB_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/historico_extrato.db")
CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")

print("=" * 80)
print("INVESTIGANDO DIVERGENCIAS DE SALDO CARTAO")
print("=" * 80)

# Carregar CARGA 1 QZ
df_carga = pd.read_excel(CARGA_1QZ, sheet_name="Planilha1", header=5)
df_carga = df_carga[df_carga['COLABORADOR'].notna()].reset_index(drop=True)

conn = sqlite3.connect(DB_FILE)

# Lista dos 13 casos com problema
casos_problema = [
    'RODRIGO BOLDO',
    'VICTOR MIGUEL PALARO',
    'CAIOS VINICIUS NUNES BROERING',
    'UELITON SANTANA SANTOS',
    'MARLON ARAUJO',
    'RAFAEL CARNIEL DA SILVA',
    'LUCAS DE PAULA SILVA',
    'THIEGO LEANDRO ALVES DE OLIVEIRA',
    'WILLIAM NORONHA TEIXEIRA',
    'LUCIANO JOSE DA CUNHA',
    'FERNANDO FREITAG DE OLIVEIRA',
    'KAIQUE KLEITON ROCHA ALVES',
    'RAFAEL GUIMARAES PACHECO'
]

print(f"\nAnalisando {len(casos_problema)} casos com divergencia...\n")

# Buscar todos os usuarios do banco
query_users = "SELECT DISTINCT usuario FROM extrato WHERE usuario IS NOT NULL"
df_users = pd.read_sql_query(query_users, conn)
usuarios_banco = df_users['usuario'].tolist()

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

for nome_problema in casos_problema:
    # Encontrar na carga
    row_carga = df_carga[df_carga['COLABORADOR'].str.contains(nome_problema.split()[0], case=False, na=False)]
    if len(row_carga) == 0:
        continue
    
    row = row_carga.iloc[0]
    saldo_carga = row['SALDO CARTAO']
    
    # Encontrar match no banco
    match, ratio = find_best_match(row['COLABORADOR'], usuarios_banco)
    
    if not match:
        continue
    
    print(f"\n{'='*80}")
    print(f"COLABORADOR: {row['COLABORADOR']}")
    print(f"SALDO CARGA QZ: R$ {saldo_carga:.2f}")
    print(f"Usuario banco: {match}")
    print(f"{'='*80}")
    
    # Buscar TODOS os snapshots
    query_snaps = """
        SELECT data, valor
        FROM extrato 
        WHERE usuario = ?
        AND (tipo IS NULL OR tipo = '')
        ORDER BY data
    """
    df_snaps = pd.read_sql_query(query_snaps, conn, params=(match,))
    
    # Buscar TODAS as transacoes em maio
    query_trans = """
        SELECT data, tipo, valor, descricao
        FROM extrato 
        WHERE usuario = ?
        AND data BETWEEN '2026-04-25' AND '2026-05-15'
        ORDER BY data
    """
    df_trans = pd.read_sql_query(query_trans, conn, params=(match,))
    
    # Analisar snapshots
    print(f"\n--- SNAPSHOTS ENCONTRADOS ({len(df_snaps)} total) ---")
    
    # Encontrar o mais proximo
    df_snaps['diff'] = abs(df_snaps['valor'] - saldo_carga)
    mais_proximos = df_snaps.nsmallest(3, 'diff')
    
    print("\n3 snapshots mais proximos do saldo CARGA:")
    for _, snap in mais_proximos.iterrows():
        data_str = snap['data'][:10] if snap['data'] else 'N/A'
        marker = " <-- MAIS PROXIMO" if snap['diff'] == mais_proximos.iloc[0]['diff'] else ""
        print(f"  {data_str} | R$ {snap['valor']:8.2f} | Diff: R$ {snap['diff']:.2f}{marker}")
    
    # Analisar transacoes proximas a data do snapshot mais proximo
    snap_mais_proximo = mais_proximos.iloc[0]
    data_snap = snap_mais_proximo['data'][:10] if snap_mais_proximo['data'] else None
    
    if data_snap:
        print(f"\n--- TRANSACOES EM {data_snap} ---")
        trans_no_dia = df_trans[df_trans['data'].str.startswith(data_snap, na=False)]
        
        if len(trans_no_dia) > 0:
            for _, trans in trans_no_dia.iterrows():
                tipo_str = str(trans['tipo']) if pd.notna(trans['tipo']) else 'SNAPSHOT'
                print(f"  {tipo_str:15} | R$ {trans['valor']:8.2f} | {str(trans['descricao'])[:40]}")
        else:
            print("  (Nenhuma transacao especifica neste horario)")
        
        # Verificar se houve alguma transacao DEPOIS deste snapshot no mesmo dia
        print(f"\n--- TRANSACOES POSTERIORES EM {data_snap} ---")
        # Buscar transacoes naquele dia com timestamp depois
        query_same_day = """
            SELECT data, tipo, valor, descricao
            FROM extrato 
            WHERE usuario = ?
            AND data LIKE ?
            AND (tipo IS NOT NULL AND tipo != '')
            ORDER BY data
        """
        df_same_day = pd.read_sql_query(query_same_day, conn, params=(match, f"{data_snap}%"))
        
        if len(df_same_day) > 0:
            for _, trans in df_same_day.iterrows():
                print(f"  {trans['data'][:19]} | {trans['tipo'][:15]:15} | R$ {trans['valor']:8.2f}")
        else:
            print("  (Nenhuma transacao apos o snapshot neste dia)")
    
    # Calcular saldo teorico
    print(f"\n--- ANALISE DA DIVERGENCIA ---")
    print(f"Saldo CARGA QZ:        R$ {saldo_carga:.2f}")
    print(f"Snapshot mais proximo: R$ {snap_mais_proximo['valor']:.2f}")
    print(f"Diferenca:             R$ {saldo_carga - snap_mais_proximo['valor']:.2f}")
    
    # Verificar se a diferenca corresponde a alguma transacao especifica
    diferenca = saldo_carga - snap_mais_proximo['valor']
    
    # Buscar transacao com valor igual a diferenca
    trans_diff = df_trans[abs(df_trans['valor'] - diferenca) < 0.01]
    if len(trans_diff) > 0:
        print(f"\n✓✓✓ ENCONTRADA transacao com valor = diferenca:")
        for _, t in trans_diff.iterrows():
            print(f"    {t['data'][:10]} | {str(t['tipo'])[:15]:15} | R$ {t['valor']:.2f}")
    
    # Verificar arredondamento
    print(f"\nPossiveis causas:")
    print(f"  - Arredondamento: {round(snap_mais_proximo['valor'], 0)} vs {round(saldo_carga, 0)}")
    print(f"  - Truncamento: {int(snap_mais_proximo['valor'])} vs {int(saldo_carga)}")
    print(f"  - Diferenca percentual: {abs(diferenca/saldo_carga*100):.2f}%" if saldo_carga != 0 else "  - N/A")

conn.close()

print(f"\n{'='*80}")
print("CONCLUSAO DA INVESTIGACAO")
print(f"{'='*80}")
