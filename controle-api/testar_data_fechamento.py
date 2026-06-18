#!/usr/bin/env python3
"""
Testar se o SALDO CARTAO e o ultimo snapshot antes do fechamento (10/05 ou 11/05)
"""

import pandas as pd
import sqlite3
from pathlib import Path
from difflib import SequenceMatcher

DB_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/historico_extrato.db")
CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")

print("=" * 80)
print("TESTE: SALDO CARTAO = ULTIMO SNAPSHOT ANTES DO FECHAMENTO")
print("=" * 80)

df_carga = pd.read_excel(CARGA_1QZ, sheet_name="Planilha1", header=5)
df_carga = df_carga[df_carga['COLABORADOR'].notna()].reset_index(drop=True)

conn = sqlite3.connect(DB_FILE)

# Buscar todos os usuarios
query_users = "SELECT DISTINCT usuario FROM extrato WHERE usuario IS NOT NULL"
df_users = pd.read_sql_query(query_users, conn)
usuarios_banco = df_users['usuario'].tolist()

def find_match(nome, usuarios_banco):
    for usuario in usuarios_banco:
        if usuario.upper() == nome.upper():
            return usuario
    for usuario in usuarios_banco:
        ratio = SequenceMatcher(None, nome.upper(), usuario.upper()).ratio()
        if ratio >= 0.9:
            return usuario
    return None

# Testar com os casos problematicos
casos = [
    'VICTOR MIGUEL PALARO',
    'LUCIANO JOSE DA CUNHA',
    'LUCAS DE PAULA SILVA',
    'DEISE SOARES DE CAMPOS',
    'WALTER DE CAMPOS NUNES NETO',
    'DIVAN ALVES DE AMORIM'
]

for nome in casos:
    row = df_carga[df_carga['COLABORADOR'] == nome]
    if len(row) == 0:
        continue
    
    saldo_carga = row.iloc[0]['SALDO CARTAO']
    match = find_match(nome, usuarios_banco)
    
    if not match:
        continue
    
    print(f"\n{nome}")
    print(f"  SALDO CARGA QZ: R$ {saldo_carga:.2f}")
    print(f"  Usuario banco: {match}")
    
    # Buscar snapshots ate 10/05
    query = """
        SELECT data, valor
        FROM extrato 
        WHERE usuario = ?
        AND (tipo IS NULL OR tipo = '')
        AND data <= '2026-05-10'
        ORDER BY data DESC
        LIMIT 1
    """
    df_snap = pd.read_sql_query(query, conn, params=(match,))
    
    if len(df_snap) > 0:
        snap = df_snap.iloc[0]
        diff = abs(snap['valor'] - saldo_carga)
        print(f"  Ultimo snapshot antes de 10/05:")
        data_str = snap['data'][:10] if snap['data'] else 'N/A'
        print(f"    Data: {data_str}")
        print(f"    Valor: R$ {snap['valor']:.2f}")
        print(f"    Diferenca: R$ {diff:.2f}")
        if diff < 0.01:
            print("    ✓✓✓ MATCH PERFEITO!")
    else:
        print("  Nenhum snapshot antes de 10/05")
    
    # Buscar snapshots ate 11/05
    query2 = """
        SELECT data, valor
        FROM extrato 
        WHERE usuario = ?
        AND (tipo IS NULL OR tipo = '')
        AND data <= '2026-05-11'
        ORDER BY data DESC
        LIMIT 1
    """
    df_snap2 = pd.read_sql_query(query2, conn, params=(match,))
    
    if len(df_snap2) > 0:
        snap2 = df_snap2.iloc[0]
        diff2 = abs(snap2['valor'] - saldo_carga)
        print(f"  Ultimo snapshot antes de 11/05:")
        data_str2 = snap2['data'][:10] if snap2['data'] else 'N/A'
        print(f"    Data: {data_str2}")
        print(f"    Valor: R$ {snap2['valor']:.2f}")
        print(f"    Diferenca: R$ {diff2:.2f}")
        if diff2 < 0.01:
            print("    ✓✓✓ MATCH PERFEITO!")

conn.close()
