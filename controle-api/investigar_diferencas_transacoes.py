#!/usr/bin/env python3
"""
Investigar se as diferencas correspondem a transacoes especificas (saques, transferencias)
"""

import pandas as pd
import sqlite3
from pathlib import Path
from difflib import SequenceMatcher

DB_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/historico_extrato.db")
CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")

print("=" * 80)
print("INVESTIGANDO DIFERENCAS - TRANSACOES ESPECIFICAS")
print("=" * 80)

df_carga = pd.read_excel(CARGA_1QZ, sheet_name="Planilha1", header=5)
df_carga = df_carga[df_carga['COLABORADOR'].notna()].reset_index(drop=True)

conn = sqlite3.connect(DB_FILE)

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

# Casos com diferencas especificas
casos = [
    ('VICTOR MIGUEL PALARO', 124.12, 224.12, 100.00),
    ('LUCIANO JOSE DA CUNHA', 80.70, 102.00, 21.30),
    ('LUCAS DE PAULA SILVA', 72.90, 102.90, 30.00),
    ('WALTER DE CAMPOS NUNES NETO', 4441.84, 4640.84, 199.00),
    ('DIVAN ALVES DE AMORIM', 96.20, 153.20, 57.00),
]

for nome, saldo_carga, snap_10mai, diferenca in casos:
    match = find_match(nome, usuarios_banco)
    if not match:
        continue
    
    print(f"\n{'='*80}")
    print(f"COLABORADOR: {nome}")
    print(f"{'='*80}")
    print(f"SALDO CARGA QZ:     R$ {saldo_carga:.2f}")
    print(f"Snapshot em 10/05:  R$ {snap_10mai:.2f}")
    print(f"DIFERENCA:          R$ {diferenca:.2f}")
    print(f"\nBuscando transacao com valor = R$ {diferenca:.2f} ou R$ -{diferenca:.2f}...")
    
    # Buscar transacoes entre o snapshot e o fechamento
    query = """
        SELECT data, tipo, valor, descricao
        FROM extrato 
        WHERE usuario = ?
        AND data BETWEEN '2026-05-06' AND '2026-05-11'
        AND (tipo IS NOT NULL AND tipo != '')
        ORDER BY data
    """
    df_trans = pd.read_sql_query(query, conn, params=(match,))
    
    if len(df_trans) > 0:
        print(f"\nTransacoes encontradas no periodo:")
        for _, trans in df_trans.iterrows():
            marker = ""
            if abs(abs(trans['valor']) - diferenca) < 0.01:
                marker = " <-- MATCH!"
            print(f"  {trans['data'][:10]} {trans['data'][11:16]} | {str(trans['tipo'])[:15]:15} | R$ {trans['valor']:8.2f} | {str(trans['descricao'])[:30]}{marker}")
    else:
        print("Nenhuma transacao encontrada no periodo.")
    
    # Buscar especificamente por valor igual a diferenca
    query2 = """
        SELECT data, tipo, valor, descricao
        FROM extrato 
        WHERE usuario = ?
        AND ABS(valor) BETWEEN ? AND ?
        AND (tipo IS NOT NULL AND tipo != '')
        ORDER BY data
    """
    df_match_valor = pd.read_sql_query(query2, conn, params=(match, diferenca-0.5, diferenca+0.5))
    
    if len(df_match_valor) > 0:
        print(f"\n✓✓✓ ENCONTRADA transacao com valor proximo a diferenca (R$ {diferenca:.2f}):")
        for _, trans in df_match_valor.iterrows():
            print(f"  {trans['data'][:10]} | {str(trans['tipo'])[:15]:15} | R$ {trans['valor']:8.2f} | {str(trans['descricao'])[:30]}")
    
    # Verificar todos os saques/transferencias em maio
    query3 = """
        SELECT data, tipo, valor, descricao
        FROM extrato 
        WHERE usuario = ?
        AND data BETWEEN '2026-05-01' AND '2026-05-15'
        AND (tipo = 'Saque' OR tipo = 'Transferência' OR descricao LIKE '%saque%' OR descricao LIKE '%transfer%')
        ORDER BY data
    """
    df_saq_transf = pd.read_sql_query(query3, conn, params=(match,))
    
    if len(df_saq_transf) > 0:
        print(f"\nSaques e Transferências em maio (1a quinzena):")
        for _, trans in df_saq_transf.iterrows():
            print(f"  {trans['data'][:10]} | {str(trans['tipo'])[:15]:15} | R$ {trans['valor']:8.2f}")

conn.close()

print("\n" + "=" * 80)
print("CONCLUSAO")
print("=" * 80)
print("""
Se encontrarmos transacoes com valores iguais as diferencas,
isso explicaria o SALDO CARTAO na planilha.

Possiveis explicacoes:
1. Saque realizado antes do fechamento
2. Transferencia retirada do cartao
3. Ajuste manual retirando valor especifico
""")
