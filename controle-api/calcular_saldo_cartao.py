#!/usr/bin/env python3
"""
Calcular SALDO CARTAO automaticamente a partir dos snapshots do banco SQLite
O saldo é o valor do snapshot (tipo NaN) na data de referência
"""

import pandas as pd
import sqlite3
from pathlib import Path
from difflib import SequenceMatcher

DB_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/historico_extrato.db")
CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")

print("=" * 80)
print("CALCULO AUTOMATICO DO SALDO CARTAO")
print("=" * 80)

# Carregar CARGA 1 QZ
df_carga = pd.read_excel(CARGA_1QZ, sheet_name="Planilha1", header=5)
df_carga = df_carga[df_carga['COLABORADOR'].notna()].reset_index(drop=True)
df_carga['CPF_Limpo'] = df_carga['CPF'].astype(str).str.replace(r'\D', '', regex=True).str.zfill(11)

print(f"\nTotal colaboradores na CARGA 1 QZ: {len(df_carga)}")

# Conectar ao banco
conn = sqlite3.connect(DB_FILE)

# Buscar todos os usuarios unicos do banco
query_users = """
    SELECT DISTINCT usuario 
    FROM extrato 
    WHERE usuario IS NOT NULL AND usuario != ''
"""
df_users = pd.read_sql_query(query_users, conn)
usuarios_banco = df_users['usuario'].tolist()

print(f"Usuarios unicos no banco: {len(usuarios_banco)}")

# Funcao para encontrar melhor match de nome
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

# Calcular saldo cartao para cada colaborador
resultados = []
nao_encontrados = []

print("\n" + "=" * 80)
print("CALCULANDO SALDO CARTAO...")
print("=" * 80)

for idx, row_carga in df_carga.iterrows():
    nome = row_carga['COLABORADOR']
    cpf = row_carga['CPF_Limpo']
    saldo_carga = row_carga['SALDO CARTAO'] if pd.notna(row_carga['SALDO CARTAO']) else 0
    
    # Encontrar usuario no banco
    match, ratio = find_best_match(nome, usuarios_banco)
    
    if match and ratio >= 0.7:
        # Buscar todos os snapshots (tipo NaN) deste usuario
        query = """
            SELECT data, valor
            FROM extrato 
            WHERE usuario = ?
            AND (tipo IS NULL OR tipo = '')
            ORDER BY data DESC
        """
        df_snapshots = pd.read_sql_query(query, conn, params=(match,))
        
        if len(df_snapshots) > 0:
            # Pegar o snapshot mais recente (data mais recente)
            snapshot_mais_recente = df_snapshots.iloc[0]
            saldo_calc = snapshot_mais_recente['valor']
            data_snapshot = snapshot_mais_recente['data'][:10] if snapshot_mais_recente['data'] else 'N/A'
            
            diff = abs(saldo_calc - saldo_carga)
            
            resultados.append({
                'nome_carga': nome,
                'nome_banco': match,
                'match_ratio': ratio,
                'saldo_carga': saldo_carga,
                'saldo_calc': saldo_calc,
                'data_snapshot': data_snapshot,
                'diferenca': diff,
                'match_perfeito': diff < 0.01
            })
        else:
            nao_encontrados.append({'nome': nome, 'motivo': 'Sem snapshots'})
    else:
        nao_encontrados.append({'nome': nome, 'motivo': f'Match baixo ({ratio:.2f})'})

conn.close()

# Analisar resultados
df_res = pd.DataFrame(resultados)

if len(df_res) > 0:
    print(f"\nTotal cruzados: {len(df_res)}")
    
    matches = len(df_res[df_res['match_perfeito']])
    matches_5pct = len(df_res[df_res['diferenca'] / df_res['saldo_carga'].abs().clip(lower=0.01) < 0.05])
    
    print(f"Match perfeito (< R$ 0.01): {matches} ({matches/len(df_res)*100:.1f}%)")
    print(f"Match < 5%: {matches_5pct} ({matches_5pct/len(df_res)*100:.1f}%)")
    
    # Mostrar alguns exemplos
    print("\n" + "=" * 80)
    print("EXEMPLOS DE MATCHES PERFEITOS:")
    print("=" * 80)
    matches_perfeitos = df_res[df_res['match_perfeito']].head(10)
    if len(matches_perfeitos) > 0:
        print(matches_perfeitos[['nome_carga', 'saldo_carga', 'saldo_calc', 'data_snapshot']].to_string(index=False))
    
    # Mostrar divergencias
    print("\n" + "=" * 80)
    print("EXEMPLOS DE DIVERGENCIAS:")
    print("=" * 80)
    divergencias = df_res[~df_res['match_perfeito']].head(10)
    if len(divergencias) > 0:
        print(divergencias[['nome_carga', 'saldo_carga', 'saldo_calc', 'diferenca']].to_string(index=False))
    
    # Salvar resultado
    output = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/saldo_cartao_calculado.csv")
    df_res.to_csv(output, index=False)
    print(f"\n✓ Resultado salvo em: {output}")

if len(nao_encontrados) > 0:
    print(f"\nNao encontrados: {len(nao_encontrados)}")
    for ne in nao_encontrados[:5]:
        print(f"  - {ne['nome']}: {ne['motivo']}")

print("\n" + "=" * 80)
print("CONCLUSAO")
print("=" * 80)
print(f"""
RESULTADO:
- Colaboradores processados: {len(df_carga)}
- Cruzados com banco: {len(df_res)}
- Match perfeito: {matches if len(df_res) > 0 else 0} ({matches/len(df_res)*100:.1f if len(df_res) > 0 else 0}%)

Se a taxa de match for alta (>80%), podemos automatizar o SALDO CARTAO!
""")
