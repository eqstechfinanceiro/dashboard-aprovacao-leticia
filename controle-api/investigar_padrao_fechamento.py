#!/usr/bin/env python3
"""
Investigar padrao de fechamento das quinzenas analisando datas dos SALDO CARTAO
"""

import pandas as pd
import sqlite3
from pathlib import Path
from collections import Counter

DB_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/historico_extrato.db")
CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")

print("=" * 80)
print("INVESTIGANDO PADRAO DE FECHAMENTO DAS QUINZENAS")
print("=" * 80)

# Carregar CARGA 1 QZ (maio - 1a quinzena)
df_carga = pd.read_excel(CARGA_1QZ, sheet_name="Planilha1", header=5)
df_carga = df_carga[df_carga['COLABORADOR'].notna()].reset_index(drop=True)

conn = sqlite3.connect(DB_FILE)

# Analisar TODOS os colaboradores com saldo > 0
amostra = df_carga[df_carga['SALDO CARTAO'] > 0]

print(f"\nAnalisando {len(amostra)} colaboradores...")

resultados = []
datas_matches = []

for _, row in amostra.iterrows():
    nome = row['COLABORADOR']
    saldo_carga = row['SALDO CARTAO']
    
    # Buscar snapshots deste usuario
    query = """
        SELECT data, valor
        FROM extrato 
        WHERE usuario LIKE ?
        AND (tipo IS NULL OR tipo = '')
        ORDER BY data
    """
    df_snaps = pd.read_sql_query(query, conn, params=(f'%{nome.split()[0]}%',))
    
    if len(df_snaps) == 0:
        continue
    
    # Verificar match
    for _, snap in df_snaps.iterrows():
        if abs(snap['valor'] - saldo_carga) < 0.01:
            data_str = snap['data'][:10] if snap['data'] else 'N/A'
            dia = int(data_str.split('-')[2])
            mes = int(data_str.split('-')[1])
            
            resultados.append({
                'nome': nome[:25],
                'saldo': saldo_carga,
                'data': data_str,
                'dia': dia,
                'mes': mes
            })
            datas_matches.append(dia)
            break

conn.close()

print(f"\n✓ Total de matches encontrados: {len(resultados)}")

# Analisar distribuicao por dia do mes
print("\n" + "=" * 80)
print("DISTRIBUICAO DOS DIAS DOS MATCHES")
print("=" * 80)

contador_dias = Counter(datas_matches)
for dia in sorted(contador_dias.keys()):
    barra = "█" * contador_dias[dia]
    print(f"Dia {dia:2d}: {contador_dias[dia]:3d} ocorrencias {barra}")

# Verificar se ha concentracao em dias especificos
print("\n" + "=" * 80)
print("ANALISE DE PADRAO")
print("=" * 80)

# Dias mais comuns
top_dias = contador_dias.most_common(10)
print("\nDias mais frequentes:")
for dia, count in top_dias:
    pct = count / len(datas_matches) * 100
    print(f"  Dia {dia}: {count} vezes ({pct:.1f}%)")

# Verificar padrao de quinzena (dias 10-11 ou 25-26)
dias_10_11 = sum([contador_dias.get(d, 0) for d in [10, 11]])
dias_25_26 = sum([contador_dias.get(d, 0) for d in [25, 26]])

print(f"\nPadrao de quinzena assumido (dias 11 e 25):")
print(f"  Dias 10-11: {dias_10_11} ocorrencias ({dias_10_11/len(datas_matches)*100:.1f}%)")
print(f"  Dias 25-26: {dias_25_26} ocorrencias ({dias_25_26/len(datas_matches)*100:.1f}%)")

# Verificar se ha concentracao no final de abril (fechamento da quinzena anterior)
dias_fev_abril = [d for d in datas_matches if d in [25, 26, 27, 28, 29, 30]]
print(f"\nDias 25-30 (final de periodo): {len(dias_fev_abril)} ({len(dias_fev_abril)/len(datas_matches)*100:.1f}%)")

# Verificar inicio de maio
dias_inicio_maio = [d for d in datas_matches if d in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]
print(f"Dias 1-10 (inicio de maio): {len(dias_inicio_maio)} ({len(dias_inicio_maio)/len(datas_matches)*100:.1f}%)")

# Mostrar exemplos por dia
print("\n" + "=" * 80)
print("EXEMPLOS POR DIA MAIS FREQUENTE")
print("=" * 80)

df_res = pd.DataFrame(resultados)
for dia, count in top_dias[:5]:
    exemplos = df_res[df_res['dia'] == dia].head(3)
    print(f"\nDia {dia} ({count} ocorrencias):")
    for _, ex in exemplos.iterrows():
        print(f"  - {ex['nome'][:30]:30} | Saldo: R$ {ex['saldo']:8.2f} | Data: {ex['data']}")
