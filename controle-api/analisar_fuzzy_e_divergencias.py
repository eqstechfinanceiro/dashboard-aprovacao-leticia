#!/usr/bin/env python3
"""
Analise completa:
1. Matching fuzzy para os 34 nomes nao encontrados
2. Investigacao das 31 divergencias de valor
"""

import pandas as pd
import sqlite3
from pathlib import Path
from difflib import SequenceMatcher

DB_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/historico_extrato.db")
CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")

print("=" * 80)
print("ANALISE FUZZY E DIVERGENCIAS")
print("=" * 80)

# Carregar CARGA 1 QZ
df_carga = pd.read_excel(CARGA_1QZ, sheet_name="Planilha1", header=5)
df_carga = df_carga[df_carga['COLABORADOR'].notna()].reset_index(drop=True)
df_carga['CPF_Limpo'] = df_carga['CPF'].astype(str).str.replace(r'\D', '', regex=True).str.zfill(11)

conn = sqlite3.connect(DB_FILE)

# Buscar todos os usuarios unicos do banco
query_users = "SELECT DISTINCT usuario FROM extrato WHERE usuario IS NOT NULL"
df_users = pd.read_sql_query(query_users, conn)
usuarios_banco = df_users['usuario'].tolist()

print(f"\nTotal colaboradores na CARGA: {len(df_carga)}")
print(f"Total usuarios no banco: {len(usuarios_banco)}")

# Funcao para fuzzy match
def fuzzy_match(nome_carga, usuarios_banco, threshold=0.7):
    nome_carga_clean = nome_carga.strip().upper()
    best_match = None
    best_ratio = 0
    
    for usuario in usuarios_banco:
        ratio = SequenceMatcher(None, nome_carga_clean, usuario.upper()).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = usuario
    
    if best_ratio >= threshold:
        return best_match, best_ratio
    return None, best_ratio

# ============================================
# PARTE 1: FUZZY MATCH PARA NOMES NAO ENCONTRADOS
# ============================================
print("\n" + "=" * 80)
print("PARTE 1: FUZZY MATCHING")
print("=" * 80)

# Lista dos 34 nomes que nao encontramos anteriormente
nao_encontrados = [
    'ALESSANDRO RODRIGO PASTRELLI',
    'PAOLA CAROLINI BARBOSA',
    'LUCAS PEREIRA GONCALVES',
    'HIGOR LUIZ CERQUEIRA',
    'THIAGO LEANDRO DOS SANTOS',
    'LUCAS RODRIGUES DE MOURA GALVAO',
    'MICHEL VINHORTE DE SOUZA',
    'JOSE WILKESON OLIVEIRA SILVA',
    'FRANCIELLY FELIX CAVALCANTE DE ANDRADE',
    'BEN HUR MENDES OLIVEIRA',
    'LEANDRO FIGUEREDO BELCHIOR',
    'MAURICIO CARDOSO DE SOUZA',
    'FERNANDO MIGUEL CONRADO',
    'FABIO APARECIDO DE SOUSA PEREIRA',
    'RAFAEL CARNIEL DA SILVA',
    'JAEDSON RICARDO DE OLIVEIRA',
    'MARLON RICARDO MACHADO',
    'JULIO CESAR MACHADO FERREIRA',
    'RAFAEL AUGUSTO SCHIAVON',
    'MARCELO CARVALHO DA SILVA',
    'PEDRO DO NASCIMENTO FARO',
    'MATEUS DE CARVALHO BERTOL',
    'WALTER DE CAMPOS NUNES NETO',
    'DIVAN ALVES DE AMORIM',
    'ANTONIO LEANDRO BARBOSA',
    'MICHAEL RODRIGUES SANTOS',
    'THIEGO LEANDRO ALVES DE OLIVEIRA',
    'LUCAS DE PAULA SILVA',
    'JEAN CARLOS DE LIMA',
    'VICTOR MIGUEL PALARO',
    'DEISE SOARES DE CAMPOS',
    'ANDRE PINHEIRO BALOTIN',
    'BRUNO EDUARDO DE SOUZA',
    'GUILHERME SANTOS DE OLIVEIRA'
]

print(f"\nTentando fuzzy match para {len(nao_encontrados)} nomes...")

resultados_fuzzy = []

for nome in nao_encontrados:
    match, ratio = fuzzy_match(nome, usuarios_banco, threshold=0.6)
    
    row_carga = df_carga[df_carga['COLABORADOR'] == nome]
    if len(row_carga) > 0:
        saldo_carga = row_carga.iloc[0]['SALDO CARTAO']
        
        if match:
            # Buscar snapshots
            query = """
                SELECT data, valor
                FROM extrato 
                WHERE usuario = ?
                AND (tipo IS NULL OR tipo = '')
                ORDER BY data DESC
            """
            df_snapshots = pd.read_sql_query(query, conn, params=(match,))
            
            if len(df_snapshots) > 0:
                df_snapshots['diff'] = abs(df_snapshots['valor'] - saldo_carga)
                melhor = df_snapshots.loc[df_snapshots['diff'].idxmin()]
                
                resultados_fuzzy.append({
                    'nome_carga': nome,
                    'nome_banco': match,
                    'similaridade': ratio,
                    'saldo_carga': saldo_carga,
                    'saldo_calc': melhor['valor'],
                    'data_snapshot': melhor['data'][:10] if melhor['data'] else 'N/A',
                    'diferenca': melhor['diff'],
                    'match_perfeito': melhor['diff'] < 0.01
                })
            else:
                resultados_fuzzy.append({
                    'nome_carga': nome,
                    'nome_banco': match,
                    'similaridade': ratio,
                    'saldo_carga': saldo_carga,
                    'saldo_calc': None,
                    'data_snapshot': None,
                    'diferenca': None,
                    'match_perfeito': False
                })
        else:
            resultados_fuzzy.append({
                'nome_carga': nome,
                'nome_banco': None,
                'similaridade': ratio,
                'saldo_carga': saldo_carga,
                'saldo_calc': None,
                'data_snapshot': None,
                'diferenca': None,
                'match_perfeito': False
            })

df_fuzzy = pd.DataFrame(resultados_fuzzy)
if len(df_fuzzy) > 0:
    print(f"\nResultados do fuzzy match:")
    print(df_fuzzy.to_string(index=False))
    
    encontrados = len(df_fuzzy[df_fuzzy['nome_banco'].notna()])
    matches_perf = len(df_fuzzy[df_fuzzy['match_perfeito'] == True])
    
    print(f"\nEncontrados via fuzzy: {encontrados}/{len(df_fuzzy)}")
    print(f"Matches perfeitos: {matches_perf}/{encontrados}")

# ============================================
# PARTE 2: INVESTIGAR DIVERGENCIAS DE VALOR
# ============================================
print("\n" + "=" * 80)
print("PARTE 2: INVESTIGANDO DIVERGENCIAS DE VALOR")
print("=" * 80)

# Recalcular todos os matches para identificar divergencias
todos_resultados = []

for idx, row_carga in df_carga.iterrows():
    nome = row_carga['COLABORADOR']
    saldo_carga = row_carga['SALDO CARTAO'] if pd.notna(row_carga['SALDO CARTAO']) else 0
    
    # Tentar match exato primeiro
    match = None
    for usuario in usuarios_banco:
        if usuario.upper() == nome.strip().upper():
            match = usuario
            break
    
    # Se nao achar, tentar fuzzy
    if not match:
        match, ratio = fuzzy_match(nome, usuarios_banco, threshold=0.8)
    
    if match:
        query = """
            SELECT data, valor
            FROM extrato 
            WHERE usuario = ?
            AND (tipo IS NULL OR tipo = '')
            ORDER BY data DESC
        """
        df_snapshots = pd.read_sql_query(query, conn, params=(match,))
        
        if len(df_snapshots) > 0:
            df_snapshots['diff'] = abs(df_snapshots['valor'] - saldo_carga)
            melhor = df_snapshots.loc[df_snapshots['diff'].idxmin()]
            
            todos_resultados.append({
                'nome': nome,
                'saldo_carga': saldo_carga,
                'saldo_calc': melhor['valor'],
                'data_snapshot': melhor['data'][:10] if melhor['data'] else 'N/A',
                'diferenca': melhor['diff'],
                'match_perfeito': melhor['diff'] < 0.01
            })

conn.close()

df_todos = pd.DataFrame(todos_resultados)

if len(df_todos) > 0:
    # Divergencias
    divergencias = df_todos[~df_todos['match_perfeito']].sort_values('diferenca', ascending=False)
    
    print(f"\nTotal divergencias: {len(divergencias)}")
    
    # Categorizar divergencias
    print("\n" + "=" * 80)
    print("CATEGORIZACAO DAS DIVERGENCIAS")
    print("=" * 80)
    
    # Caso 1: Saldo CARGA = 0 mas snapshot tem valor
    caso1 = divergencias[divergencias['saldo_carga'] == 0]
    print(f"\n1. Saldo CARGA = 0, mas snapshot tem valor: {len(caso1)} casos")
    if len(caso1) > 0:
        print("   Exemplos:")
        for _, row in caso1.head(5).iterrows():
            print(f"     - {row['nome'][:35]:35} | Snapshot: R$ {row['saldo_calc']:8.2f} em {row['data_snapshot']}")
    
    # Caso 2: Saldo CARGA > 0 mas diferente do snapshot
    caso2 = divergencias[(divergencias['saldo_carga'] > 0) & (divergencias['diferenca'] > 1)]
    print(f"\n2. Saldo CARGA > 0, mas diferente do snapshot (> R$ 1): {len(caso2)} casos")
    if len(caso2) > 0:
        print("   Exemplos:")
        for _, row in caso2.head(5).iterrows():
            print(f"     - {row['nome'][:35]:35} | CARGA: R$ {row['saldo_carga']:8.2f} | Snap: R$ {row['saldo_calc']:8.2f} | Diff: R$ {row['diferenca']:.2f}")
    
    # Caso 3: Pequenas diferencas (arredondamento?)
    caso3 = divergencias[(divergencias['diferenca'] > 0.01) & (divergencias['diferenca'] <= 1)]
    print(f"\n3. Pequenas diferencas (R$ 0.01 a R$ 1.00): {len(caso3)} casos")
    if len(caso3) > 0:
        print("   Exemplos:")
        for _, row in caso3.head(5).iterrows():
            print(f"     - {row['nome'][:35]:35} | Diff: R$ {row['diferenca']:.2f}")

print("\n" + "=" * 80)
print("RESUMO FINAL")
print("=" * 80)

if len(df_todos) > 0:
    total = len(df_todos)
    matches = len(df_todos[df_todos['match_perfeito']])
    matches_1real = len(df_todos[df_todos['diferenca'] < 1.0])
    
    print(f"""
Total processado: {total}
Match perfeito (< R$ 0.01): {matches} ({matches/total*100:.1f}%)
Match < R$ 1.00: {matches_1real} ({matches_1real/total*100:.1f}%)
Divergencias: {total - matches} ({(total-matches)/total*100:.1f}%)
""")
