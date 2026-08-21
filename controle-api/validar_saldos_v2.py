#!/usr/bin/env python3
"""
Validar saldos calculados da API contra a planilha CARGA QZ - V2
Corrigido para estrutura correta da planilha
"""

import pandas as pd
import sqlite3
from pathlib import Path
from difflib import SequenceMatcher
import json

DB_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/historico_extrato.db")
CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")
MAPEAMENTO_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/mapeamento_nomes.json")

print("=" * 80)
print("VALIDACAO V2: SALDOS API vs CARGA QZ")
print("=" * 80)

# ============================================
# 1. CARREGAR DADOS DA API (SQLite)
# ============================================
print("\n" + "=" * 80)
print("1. CARREGANDO DADOS DA API (SQLite)")
print("=" * 80)

conn = sqlite3.connect(DB_FILE)

# Calcular saldos por usuario
query = """
    SELECT 
        LOWER(TRIM(usuario)) as usuario,
        SUM(CASE WHEN tipo = 'Transferência' AND valor > 0 THEN valor ELSE 0 END) as carga,
        SUM(CASE WHEN tipo = 'Transferência' AND valor < 0 THEN ABS(valor) ELSE 0 END) as transferencia,
        SUM(CASE WHEN tipo = 'Taxa' THEN ABS(valor) ELSE 0 END) as tarifa,
        COUNT(*) as total_transacoes
    FROM extrato
    GROUP BY LOWER(TRIM(usuario))
"""

df_api = pd.read_sql_query(query, conn)
df_api['saldo_api'] = df_api['carga'] - df_api['transferencia'] - df_api['tarifa']
df_api['usuario_api'] = df_api['usuario']

print(f"Total usuarios na API: {len(df_api)}")
print(f"\nTop 5 por saldo:")
print(df_api.nlargest(5, 'saldo_api')[['usuario', 'saldo_api']].to_string(index=False))

conn.close()

# ============================================
# 2. CARREGAR DADOS DA CARGA QZ (HEADER CORRETO)
# ============================================
print("\n" + "=" * 80)
print("2. CARREGANDO CARGA 1 QZ")
print("=" * 80)

# A planilha tem header na linha 5 (indice 5)
df_carga = pd.read_excel(CARGA_1QZ, sheet_name="Planilha1", header=5)

# Remover linhas vazias no inicio
df_carga = df_carga[df_carga['COLABORADOR'].notna()].reset_index(drop=True)

print(f"Total colaboradores: {len(df_carga)}")
print(f"\nColunas: {list(df_carga.columns)}")

# Mostrar primeiras linhas
print("\nPrimeiras 3 linhas:")
print(df_carga[['COLABORADOR', 'SALDO CARTAO', '1ª QZ']].head(3).to_string())

# ============================================
# 3. CARREGAR MAPEAMENTO DE NOMES
# ============================================
print("\n" + "=" * 80)
print("3. MAPEAMENTO DE NOMES")
print("=" * 80)

if MAPEAMENTO_FILE.exists():
    with open(MAPEAMENTO_FILE, 'r', encoding='utf-8') as f:
        mapeamento = json.load(f)
    print(f"✓ Mapeamento carregado: {len(mapeamento)} usuarios")
else:
    print("✗ Arquivo de mapeamento nao encontrado")
    mapeamento = {}

# ============================================
# 4. CRUZAR DADOS API x CARGA QZ
# ============================================
print("\n" + "=" * 80)
print("4. CRUZANDO API x CARGA QZ")
print("=" * 80)

# Funcao para encontrar melhor match
def find_match(nome_carga, api_names, mapeamento):
    nome_carga_clean = nome_carga.strip().upper()
    
    # Verificar mapeamento primeiro
    if nome_carga_clean in mapeamento:
        mapped = mapeamento[nome_carga_clean].upper()
        for api_name in api_names:
            if api_name.upper() == mapped:
                return api_name, 1.0
    
    # Fuzzy matching
    best_match = None
    best_ratio = 0
    
    for api_name in api_names:
        ratio = SequenceMatcher(None, nome_carga_clean, api_name.upper()).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = api_name
    
    return best_match, best_ratio

# Preparar lista de nomes da API
api_names = df_api['usuario'].tolist()

# Cruzar
resultados = []
nao_encontrados = []

for idx, row in df_carga.iterrows():
    nome_carga = row.get('COLABORADOR', '')
    if pd.isna(nome_carga) or nome_carga == '' or 'TOTAL' in str(nome_carga).upper():
        continue
    
    # Encontrar match
    match_api, ratio = find_match(nome_carga, api_names, mapeamento)
    
    if match_api and ratio >= 0.6:
        # Pegar saldo da API
        saldo_api_row = df_api[df_api['usuario'] == match_api]
        if len(saldo_api_row) > 0:
            saldo_api = saldo_api_row.iloc[0]['saldo_api']
            
            # Pegar saldo da CARGA QZ
            saldo_carga = row.get('SALDO CARTAO', 0)
            if pd.isna(saldo_carga):
                saldo_carga = 0
            
            resultados.append({
                'nome_carga': nome_carga,
                'nome_api': match_api,
                'match_ratio': ratio,
                'saldo_api': round(saldo_api, 2),
                'saldo_carga': round(saldo_carga, 2),
                'diferenca': round(saldo_api - saldo_carga, 2),
                'pct_diff': abs(saldo_api - saldo_carga) / max(abs(saldo_carga), 0.01) * 100 if saldo_carga != 0 else (100 if saldo_api != 0 else 0)
            })
    else:
        nao_encontrados.append(nome_carga)

df_result = pd.DataFrame(resultados)

print(f"\nTotal cruzado: {len(df_result)} colaboradores")
print(f"Nao encontrados: {len(nao_encontrados)}")

# ============================================
# 5. ANALISE DOS RESULTADOS
# ============================================
print("\n" + "=" * 80)
print("5. RESULTADO DA VALIDACAO")
print("=" * 80)

if len(df_result) > 0:
    # Match perfeito (diferenca < R$ 0.01)
    match_perfeito = df_result[abs(df_result['diferenca']) < 0.01]
    
    # Match proximo (diferenca < R$ 1.00)
    match_proximo = df_result[abs(df_result['diferenca']) < 1.00]
    
    # Divergencias significativas (> R$ 5.00)
    divergencias = df_result[abs(df_result['diferenca']) >= 5.00]
    
    print(f"\n✓ Match perfeito (< R$ 0.01): {len(match_perfeito)} ({len(match_perfeito)/len(df_result)*100:.1f}%)")
    print(f"✓ Match proximo (< R$ 1.00): {len(match_proximo)} ({len(match_proximo)/len(df_result)*100:.1f}%)")
    print(f"⚠ Divergencias (> R$ 5.00): {len(divergencias)} ({len(divergencias)/len(df_result)*100:.1f}%)")
    
    # Estatisticas
    print(f"\n--- Estatisticas ---")
    print(f"Diferenca media: R$ {df_result['diferenca'].mean():.2f}")
    print(f"Diferenca mediana: R$ {df_result['diferenca'].median():.2f}")
    print(f"Desvio padrao: R$ {df_result['diferenca'].std():.2f}")
    
    # Mostrar top 10 por saldo
    print("\n" + "=" * 80)
    print("TOP 10 POR SALDO (API vs CARGA)")
    print("=" * 80)
    
    top10 = df_result.nlargest(10, 'saldo_api')[['nome_carga', 'saldo_api', 'saldo_carga', 'diferenca']]
    print(top10.to_string(index=False))
    
    # Mostrar divergencias
    if len(divergencias) > 0:
        print("\n" + "=" * 80)
        print(f"DIVERGENCIAS SIGNIFICATIVAS ({len(divergencias)} colaboradores)")
        print("=" * 80)
        print(divergencias[['nome_carga', 'saldo_api', 'saldo_carga', 'diferenca']].to_string(index=False))
    
    # Mostrar matches perfeitos
    if len(match_perfeito) > 0:
        print("\n" + "=" * 80)
        print(f"MATCHES PERFEITOS - Top 10 ({len(match_perfeito)} total)")
        print("=" * 80)
        print(match_perfeito.nlargest(10, 'saldo_api')[['nome_carga', 'saldo_api', 'saldo_carga']].to_string(index=False))
        
else:
    print("\n✗ Nenhum cruzamento realizado")

# ============================================
# 6. CONCLUSAO
# ============================================
print("\n" + "=" * 80)
print("6. CONCLUSAO")
print("=" * 80)

if len(df_result) > 0:
    taxa_match = len(match_perfeito) / len(df_result) * 100
    taxa_prox = len(match_proximo) / len(df_result) * 100
    
    if taxa_match >= 95:
        status = "✅ EXCELENTE - Formula validada com sucesso!"
    elif taxa_match >= 80:
        status = "✅ BOM - Formula validada com pequenas excecoes"
    elif taxa_prox >= 80:
        status = "⚠️  REGULAR - Formula correta, mas com variacoes"
    else:
        status = "❌ INSUFICIENTE - Investigar causas"
    
    print(f"\n{status}")
    print(f"\nFormula aplicada: SALDO = CARGA - TRANSFERENCIA - TARIFA")
    print(f"Periodo API: 2026-03-01 a 2026-05-31 (3 meses)")
    print(f"Total transacoes API: {df_api['total_transacoes'].sum()}")
    print(f"\nMatch perfeito (< R$ 0.01): {taxa_match:.1f}%")
    print(f"Match proximo (< R$ 1.00): {taxa_prox:.1f}%")

# Salvar resultado
output = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/validacao_final.csv")
df_result.to_csv(output, index=False)
print(f"\n✓ Resultado completo salvo em: {output}")

# Salvar resumo
resumo = {
    'total_api': len(df_api),
    'total_carga': len(df_carga),
    'cruzados': len(df_result),
    'match_perfeito': len(match_perfeito) if len(df_result) > 0 else 0,
    'pct_match': taxa_match if len(df_result) > 0 else 0,
    'nao_encontrados': len(nao_encontrados)
}

output_json = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/resumo_validacao.json")
with open(output_json, 'w', encoding='utf-8') as f:
    json.dump(resumo, f, indent=2)
print(f"✓ Resumo salvo em: {output_json}")
