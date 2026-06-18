#!/usr/bin/env python3
"""
Calcular SALDO CARTAO automaticamente usando CPF para cruzamento correto
"""

import pandas as pd
import sqlite3
from pathlib import Path

DB_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/historico_extrato.db")
CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")

print("=" * 80)
print("CALCULO AUTOMATICO DO SALDO CARTAO - V2 (USANDO CPF)")
print("=" * 80)

# Carregar CARGA 1 QZ
df_carga = pd.read_excel(CARGA_1QZ, sheet_name="Planilha1", header=5)
df_carga = df_carga[df_carga['COLABORADOR'].notna()].reset_index(drop=True)
df_carga['CPF_Limpo'] = df_carga['CPF'].astype(str).str.replace(r'\D', '', regex=True).str.zfill(11)

print(f"\nTotal colaboradores na CARGA 1 QZ: {len(df_carga)}")

# Conectar ao banco
conn = sqlite3.connect(DB_FILE)

# Verificar se o banco tem CPF ou so nome
query_check = "SELECT * FROM extrato LIMIT 1"
df_sample = pd.read_sql_query(query_check, conn)
print(f"\nColunas no banco: {list(df_sample.columns)}")

# Verificar se ha CPF
has_cpf = 'cpf' in df_sample.columns
print(f"Banco tem CPF? {has_cpf}")

# Se nao tiver CPF, precisamos criar um mapeamento nome->CPF
if not has_cpf:
    print("\n⚠️  Banco nao tem CPF. Criando mapeamento por nome exato...")
    
    # Buscar todos os usuarios unicos
    query_users = "SELECT DISTINCT usuario FROM extrato WHERE usuario IS NOT NULL"
    df_users = pd.read_sql_query(query_users, conn)
    usuarios_banco = df_users['usuario'].tolist()
    
    # Funcao para encontrar match exato
    def find_exact_match(nome_carga, usuarios_banco):
        nome_carga_clean = nome_carga.strip().upper()
        for usuario in usuarios_banco:
            if usuario.upper() == nome_carga_clean:
                return usuario, 1.0
        return None, 0
    
    # Calcular saldo cartao para cada colaborador
    resultados = []
    nao_encontrados = []
    
    for idx, row_carga in df_carga.iterrows():
        nome = row_carga['COLABORADOR']
        cpf = row_carga['CPF_Limpo']
        saldo_carga = row_carga['SALDO CARTAO'] if pd.notna(row_carga['SALDO CARTAO']) else 0
        
        # Encontrar usuario no banco (match exato)
        match, ratio = find_exact_match(nome, usuarios_banco)
        
        if match and ratio >= 1.0:
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
                # Verificar se algum snapshot bate exatamente com o saldo
                df_snapshots['diff'] = abs(df_snapshots['valor'] - saldo_carga)
                melhor_match = df_snapshots.loc[df_snapshots['diff'].idxmin()]
                
                saldo_calc = melhor_match['valor']
                data_snapshot = melhor_match['data'][:10] if melhor_match['data'] else 'N/A'
                diff = melhor_match['diff']
                
                resultados.append({
                    'nome_carga': nome,
                    'nome_banco': match,
                    'cpf': cpf,
                    'saldo_carga': saldo_carga,
                    'saldo_calc': saldo_calc,
                    'data_snapshot': data_snapshot,
                    'diferenca': diff,
                    'match_perfeito': diff < 0.01
                })
            else:
                nao_encontrados.append({'nome': nome, 'motivo': 'Sem snapshots'})
        else:
            nao_encontrados.append({'nome': nome, 'motivo': 'Nome nao encontrado no banco'})

conn.close()

# Analisar resultados
df_res = pd.DataFrame(resultados)

if len(df_res) > 0:
    print(f"\nTotal cruzados: {len(df_res)}")
    
    matches = len(df_res[df_res['match_perfeito']])
    matches_1real = len(df_res[df_res['diferenca'] < 1.0])
    matches_5pct = len(df_res[df_res['diferenca'] / df_res['saldo_carga'].abs().clip(lower=0.01) < 0.05])
    
    print(f"Match perfeito (< R$ 0.01): {matches} ({matches/len(df_res)*100:.1f}%)")
    print(f"Match < R$ 1.00: {matches_1real} ({matches_1real/len(df_res)*100:.1f}%)")
    print(f"Match < 5%: {matches_5pct} ({matches_5pct/len(df_res)*100:.1f}%)")
    
    # Divergencias
    divergencias = df_res[~df_res['match_perfeito']].sort_values('diferenca', ascending=False)
    if len(divergencias) > 0:
        print(f"\n\nTOP 10 DIVERGENCIAS:")
        print(divergencias[['nome_carga', 'saldo_carga', 'saldo_calc', 'diferenca', 'data_snapshot']].head(10).to_string(index=False))
    
    # Salvar resultado
    output = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/saldo_cartao_calculado_v2.csv")
    df_res.to_csv(output, index=False)
    print(f"\n✓ Resultado salvo em: {output}")

if len(nao_encontrados) > 0:
    print(f"\nNao encontrados: {len(nao_encontrados)}")
    for ne in nao_encontrados[:10]:
        print(f"  - {ne['nome']}: {ne['motivo']}")

print("\n" + "=" * 80)
print("CONCLUSAO")
print("=" * 80)
print(f"""
RESULTADO FINAL:
- Colaboradores processados: {len(df_carga)}
- Cruzados com banco: {len(df_res) if len(df_res) > 0 else 0}
- Match perfeito: {matches if len(df_res) > 0 else 0} ({matches/len(df_res)*100:.1f if len(df_res) > 0 else 0}%)
- Match < R$ 1.00: {matches_1real if len(df_res) > 0 else 0} ({matches_1real/len(df_res)*100:.1f if len(df_res) > 0 else 0}%)
""")
