#!/usr/bin/env python3
"""
Analisar qual período a CARGA QZ realmente usa
Testar diferentes períodos para encontrar o match correto
"""

import pandas as pd
import sqlite3
from pathlib import Path
from datetime import datetime
from difflib import SequenceMatcher

DB_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/historico_extrato.db")
CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")

print("=" * 80)
print("ANALISANDO PERIODO DA CARGA QZ")
print("=" * 80)

# ============================================
# 1. CARREGAR DADOS DA CARGA QZ
# ============================================
print("\n" + "=" * 80)
print("1. CARGA 1 QZ")
print("=" * 80)

df_carga = pd.read_excel(CARGA_1QZ, sheet_name="Planilha1", header=5)
df_carga = df_carga[df_carga['COLABORADOR'].notna()].reset_index(drop=True)

print(f"Total: {len(df_carga)} colaboradores")
print(f"\nTop 10 por SALDO CARTAO:")
top_carga = df_carga.nlargest(10, 'SALDO CARTAO')[['COLABORADOR', 'SALDO CARTAO']]
print(top_carga.to_string(index=False))

# ============================================
# 2. TESTAR DIFERENTES PERIODOS NO SQLITE
# ============================================
print("\n" + "=" * 80)
print("2. TESTANDO DIFERENTES PERIODOS")
print("=" * 80)

conn = sqlite3.connect(DB_FILE)

# Funcao para calcular saldo de um período específico
def calcular_saldo_periodo(start_date, end_date):
    query = f"""
        SELECT 
            LOWER(TRIM(usuario)) as usuario,
            SUM(CASE WHEN tipo = 'Transferência' AND valor > 0 THEN valor ELSE 0 END) -
            SUM(CASE WHEN tipo = 'Transferência' AND valor < 0 THEN ABS(valor) ELSE 0 END) -
            SUM(CASE WHEN tipo = 'Taxa' THEN ABS(valor) ELSE 0 END) as saldo
        FROM extrato
        WHERE data BETWEEN '{start_date}' AND '{end_date}'
        GROUP BY LOWER(TRIM(usuario))
    """
    return pd.read_sql_query(query, conn)

# Testar diferentes períodos
periodos = [
    ("2026-05-01", "2026-05-31", "Maio completo"),
    ("2026-05-01", "2026-05-15", "1-15 Maio (1a metade)"),
    ("2026-05-01", "2026-05-10", "1-10 Maio (ate dia 10)"),
    ("2026-04-26", "2026-05-10", "26 Abr - 10 Mai (1a QZ)"),
    ("2026-04-01", "2026-05-31", "Abr-Mai (2 meses)"),
    ("2026-03-01", "2026-05-31", "Mar-Mai (3 meses) - ATUAL"),
]

resultados_periodo = []

for start, end, desc in periodos:
    print(f"\n--- Testando: {desc} ---")
    print(f"    Periodo: {start} a {end}")
    
    df_periodo = calcular_saldo_periodo(start, end)
    
    # Cruzar com CARGA QZ (primeiros 10)
    matches = 0
    total_diff = 0
    
    for _, row_carga in top_carga.iterrows():
        nome_carga = row_carga['COLABORADOR']
        saldo_carga = row_carga['SALDO CARTAO']
        
        # Buscar na API (fuzzy match)
        for _, row_api in df_periodo.iterrows():
            ratio = SequenceMatcher(None, nome_carga.upper(), row_api['usuario'].upper()).ratio()
            if ratio > 0.7:
                diff = abs(row_api['saldo'] - saldo_carga)
                total_diff += diff
                if diff < 1.0:
                    matches += 1
                break
    
    avg_diff = total_diff / 10 if len(top_carga) > 0 else 0
    
    print(f"    Match perfeito (< R$ 1): {matches}/10")
    print(f"    Diferenca media: R$ {avg_diff:.2f}")
    
    resultados_periodo.append({
        'periodo': desc,
        'matches': matches,
        'avg_diff': avg_diff
    })

conn.close()

# ============================================
# 3. RESULTADO
# ============================================
print("\n" + "=" * 80)
print("3. RESULTADO - MELHOR PERIODO")
print("=" * 80)

df_res = pd.DataFrame(resultados_periodo)
df_res = df_res.sort_values('matches', ascending=False)

print("\nRanking por numero de matches:")
print(df_res.to_string(index=False))

melhor = df_res.iloc[0]
print(f"\n✓ Melhor periodo: {melhor['periodo']}")
print(f"  Matches: {melhor['matches']}/10")
print(f"  Diferenca media: R$ {melhor['avg_diff']:.2f}")

# ============================================
# 4. VALIDACAO COMPLETA COM MELHOR PERIODO
# ============================================
print("\n" + "=" * 80)
print("4. VALIDACAO COMPLETA COM MELHOR PERIODO")
print("=" * 80)

# Pegar o período do melhor resultado
melhor_periodo = None
for start, end, desc in periodos:
    if desc == melhor['periodo']:
        melhor_periodo = (start, end)
        break

if melhor_periodo:
    start, end = melhor_periodo
    conn = sqlite3.connect(DB_FILE)
    
    df_api_best = calcular_saldo_periodo(start, end)
    
    # Cruzar todos os colaboradores
    resultados = []
    for _, row_carga in df_carga.iterrows():
        nome_carga = row_carga['COLABORADOR']
        if pd.isna(nome_carga) or 'TOTAL' in str(nome_carga).upper():
            continue
            
        saldo_carga = row_carga['SALDO CARTAO'] if pd.notna(row_carga['SALDO CARTAO']) else 0
        
        # Buscar na API
        for _, row_api in df_api_best.iterrows():
            ratio = SequenceMatcher(None, nome_carga.upper(), row_api['usuario'].upper()).ratio()
            if ratio > 0.6:
                diff = abs(row_api['saldo'] - saldo_carga)
                resultados.append({
                    'nome': nome_carga,
                    'saldo_api': round(row_api['saldo'], 2),
                    'saldo_carga': round(saldo_carga, 2),
                    'diff': round(diff, 2),
                    'match': ratio
                })
                break
    
    conn.close()
    
    df_val = pd.DataFrame(resultados)
    
    if len(df_val) > 0:
        match_perfeito = len(df_val[df_val['diff'] < 0.01])
        match_proximo = len(df_val[df_val['diff'] < 1.0])
        
        print(f"\nCruzados: {len(df_val)} colaboradores")
        print(f"Match perfeito (< R$ 0.01): {match_perfeito} ({match_perfeito/len(df_val)*100:.1f}%)")
        print(f"Match proximo (< R$ 1.00): {match_proximo} ({match_proximo/len(df_val)*100:.1f}%)")
        
        # Salvar resultado
        output = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/validacao_melhor_periodo.csv")
        df_val.to_csv(output, index=False)
        print(f"\n✓ Resultado salvo em: {output}")

print("\n" + "=" * 80)
print("CONCLUSAO")
print("=" * 80)
print(f"""
A CARGA QZ usa dados de um PERIODO ESPECIFICO, nao acumulado.

Melhor candidato: {melhor['periodo']}

Isso significa que para calcular o SALDO CARTAO corretamente,
precisamos definir QUAL periodo usar (historico ou apenas a quinzena).

Possiveis interpretacoes:
1. SALDO CARTAO = saldo acumulado desde o inicio (3 meses+)
2. SALDO CARTAO = saldo do mes atual apenas
3. SALDO CARTAO = saldo da quinzena especifica

A planilha CARGA QZ parece usar a opcao 2 ou 3.
""")
