#!/usr/bin/env python3
"""
Mapeamento de nomes + Comparação de códigos de transação
API x Planilha CONTROLE
"""

import pandas as pd
from pathlib import Path
from difflib import SequenceMatcher
from collections import defaultdict

API_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/api_statement_1qz.xlsx")
CTRL_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")

def normalizar(nome):
    if pd.isna(nome):
        return ""
    nome = str(nome).upper().strip()
    # Normalizar acentos
    nome = nome.replace('Á', 'A').replace('É', 'E').replace('Í', 'I').replace('Ó', 'O').replace('Ú', 'U')
    nome = nome.replace('Ã', 'A').replace('Õ', 'O').replace('Ç', 'C')
    nome = nome.replace('Ê', 'E').replace('Ô', 'O').replace('Â', 'A')
    return nome

def similaridade(a, b):
    return SequenceMatcher(None, normalizar(a), normalizar(b)).ratio()

print("=" * 80)
print("MAPEAMENTO DE NOMES + COMPARACAO DE CODIGOS DE TRANSACAO")
print("=" * 80)

# Carregar dados
print("\n--- Carregando dados ---")
df_api = pd.read_excel(API_FILE, sheet_name="Extrato")
df_ctrl = pd.read_excel(CTRL_FILE, sheet_name="EXTRATO", header=7)

# Normalizar valores
df_api['Valor'] = pd.to_numeric(df_api['Valor'], errors='coerce')
df_ctrl['Valor'] = pd.to_numeric(df_ctrl['Valor'], errors='coerce')
df_api['Código de Transação'] = df_api['Código de Transação'].astype(str).str.strip()
df_ctrl['Código de Transação'] = df_ctrl['Código de Transação'].astype(str).str.strip()

# Normalizar nomes
df_api['Usuario_Norm'] = df_api['Usuário'].apply(normalizar)
df_ctrl['Usuario_Norm'] = df_ctrl['Usuário'].apply(normalizar)

print(f"\nAPI: {len(df_api)} transações, {df_api['Usuário'].nunique()} usuarios")
print(f"CTRL: {len(df_ctrl)} transações, {df_ctrl['Usuário'].nunique()} usuarios")

# ============================================
# PARTE 1: MAPEAMENTO DE NOMES
# ============================================
print("\n" + "=" * 80)
print("PARTE 1: MAPEAMENTO DE NOMES")
print("=" * 80)

# Criar dicionario de mapeamento
usuarios_api = df_api['Usuário'].unique().tolist()
usuarios_ctrl = df_ctrl['Usuário'].unique().tolist()

mapeamento = {}  # nome_api -> nome_ctrl
nao_mapeados = []

for nome_api in usuarios_api:
    # Tentar match exato
    if nome_api in usuarios_ctrl:
        mapeamento[nome_api] = nome_api
    else:
        # Tentar fuzzy matching
        melhor_score = 0
        melhor_nome = None
        nome_api_norm = normalizar(nome_api)
        
        for nome_ctrl in usuarios_ctrl:
            score = similaridade(nome_api_norm, normalizar(nome_ctrl))
            if score > melhor_score and score >= 0.8:
                melhor_score = score
                melhor_nome = nome_ctrl
        
        if melhor_nome:
            mapeamento[nome_api] = melhor_nome
            print(f"FUZZY: '{nome_api}' -> '{melhor_nome}' (score: {melhor_score:.2f})")
        else:
            nao_mapeados.append(nome_api)

print(f"\n✓ Mapeados: {len(mapeamento)} de {len(usuarios_api)} ({100*len(mapeamento)/len(usuarios_api):.1f}%)")
print(f"✗ Não mapeados: {len(nao_mapeados)}")

if nao_mapeados:
    print("\nUsuários da API não encontrados no CONTROLE:")
    for nome in nao_mapeados:
        print(f"  - {nome}")

# Aplicar mapeamento na API
df_api['Usuario_Mapeado'] = df_api['Usuário'].map(mapeamento)
df_api_com_match = df_api[df_api['Usuario_Mapeado'].notna()]

print(f"\nTransações da API com match: {len(df_api_com_match)} de {len(df_api)}")

# ============================================
# PARTE 2: COMPARACAO DE CODIGOS DE TRANSACAO
# ============================================
print("\n" + "=" * 80)
print("PARTE 2: COMPARACAO DE CODIGOS DE TRANSACAO")
print("=" * 80)

# Agrupar por usuário + código de transação
print("\n--- Agrupando por usuario + código ---")

agg_api = df_api_com_match.groupby(['Usuario_Mapeado', 'Código de Transação']).agg({
    'Valor': 'sum',
    'Tipo': 'first',
    'Descrição': 'first',
    'Data': 'count'  # contar ocorrências
}).reset_index()
agg_api.columns = ['Usuario', 'Codigo', 'Valor_API', 'Tipo_API', 'Desc_API', 'Qtd_API']

agg_ctrl = df_ctrl.groupby(['Usuário', 'Código de Transação']).agg({
    'Valor': 'sum',
    'Tipo': 'first',
    'Descrição': 'first',
    'Data': 'count'
}).reset_index()
agg_ctrl.columns = ['Usuario', 'Codigo', 'Valor_CTRL', 'Tipo_CTRL', 'Desc_CTRL', 'Qtd_CTRL']

# Cruzar por usuario + codigo
comparacao = pd.merge(
    agg_api, agg_ctrl,
    on=['Usuario', 'Codigo'],
    how='outer',
    suffixes=('_API', '_CTRL')
)

# Classificar cada registro
def classificar_registro(row):
    if pd.notna(row['Valor_API']) and pd.notna(row['Valor_CTRL']):
        return 'EM_AMBOS'
    elif pd.notna(row['Valor_API']) and pd.isna(row['Valor_CTRL']):
        return 'SO_API'
    else:
        return 'SO_CTRL'

comparacao['Status'] = comparacao.apply(classificar_registro, axis=1)
comparacao['Diferenca_Valor'] = comparacao['Valor_API'].fillna(0) - comparacao['Valor_CTRL'].fillna(0)

# Estatisticas
print("\n--- Estatísticas de Cobertura ---")
status_counts = comparacao['Status'].value_counts()
print(status_counts.to_string())

print(f"\n- Apenas na API: {status_counts.get('SO_API', 0)} códigos")
print(f"- Apenas no CONTROLE: {status_counts.get('SO_CTRL', 0)} códigos")
print(f"- Em ambos: {status_counts.get('EM_AMBOS', 0)} códigos")

# Códigos em ambos com diferença de valor
print("\n--- Códigos em AMBOS com DIFERENÇA DE VALOR ---")
em_ambos = comparacao[comparacao['Status'] == 'EM_AMBOS'].copy()
em_ambos['Dif_Perc'] = abs(em_ambos['Diferenca_Valor']) / abs(em_ambos['Valor_CTRL'].replace(0, 1)) * 100

com_dif = em_ambos[abs(em_ambos['Diferenca_Valor']) > 0.01].sort_values('Dif_Perc', ascending=False)

if len(com_dif) > 0:
    print(f"\n{len(com_dif)} códigos com diferença de valor:")
    for _, row in com_dif.head(15).iterrows():
        print(f"\n  Usuario: {row['Usuario']}")
        print(f"  Código: {row['Codigo']}")
        print(f"  API: {row['Valor_API']:.2f} | CTRL: {row['Valor_CTRL']:.2f}")
        print(f"  Diferença: {row['Diferenca_Valor']:.2f} ({row['Dif_Perc']:.1f}%)")
        print(f"  Tipo API: {row['Tipo_API']} | Tipo CTRL: {row['Tipo_CTRL']}")
else:
    print("\nTodos os códigos em comum têm valores idênticos!")

# Códigos apenas na API
print("\n--- Códigos APENAS na API (não no CONTROLE) ---")
so_api = comparacao[comparacao['Status'] == 'SO_API']
if len(so_api) > 0:
    print(f"\n{len(so_api)} códigos encontrados apenas na API:")
    for _, row in so_api.head(20).iterrows():
        print(f"  {row['Usuario']} | {row['Codigo']} | {row['Valor_API']:.2f} | {row['Tipo_API']}")
else:
    print("\nTodos os códigos da API estão no CONTROLE")

# Códigos apenas no CONTROLE (período diferente)
print("\n--- Códigos APENAS no CONTROLE (não na API) ---")
so_ctrl = comparacao[comparacao['Status'] == 'SO_CTRL']
if len(so_ctrl) > 0:
    print(f"\n{len(so_ctrl)} códigos encontrados apenas no CONTROLE (provavelmente 2ª QZ ou período diferente)")
    print(f"  (mostrando primeiros 10)")
    for _, row in so_ctrl.head(10).iterrows():
        print(f"  {row['Usuario']} | {row['Codigo']} | {row['Valor_CTRL']:.2f} | {row['Tipo_CTRL']}")
else:
    print("\nTodos os códigos do CONTROLE estão na API")

# ============================================
# PARTE 3: RESUMO POR USUARIO
# ============================================
print("\n" + "=" * 80)
print("PARTE 3: RESUMO POR USUARIO (Códigos cobertos)")
print("=" * 80)

usuarios_com_dados = comparacao['Usuario'].dropna().unique()

print(f"\nAnalisando {len(usuarios_com_dados)} usuarios com dados em ambas fontes...")

for usuario in sorted(usuarios_com_dados)[:10]:  # Primeiros 10
    user_data = comparacao[comparacao['Usuario'] == usuario]
    total_codigos = len(user_data)
    em_ambos = len(user_data[user_data['Status'] == 'EM_AMBOS'])
    so_api = len(user_data[user_data['Status'] == 'SO_API'])
    so_ctrl = len(user_data[user_data['Status'] == 'SO_CTRL'])
    
    print(f"\n  {usuario}:")
    print(f"    Total códigos: {total_codigos} | Em ambos: {em_ambos} | Só API: {so_api} | Só CTRL: {so_ctrl}")

# Salvar CSV detalhado
output_file = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/comparacao_codigos.csv")
comparacao.to_csv(output_file, index=False, encoding='utf-8-sig')
print(f"\n✓ CSV salvo: {output_file}")

# ============================================
# CONCLUSAO
# ============================================
print("\n" + "=" * 80)
print("CONCLUSAO - FRAMEWORK DE CORRELACAO")
print("=" * 80)

cobertura = status_counts.get('EM_AMBOS', 0) / len(comparacao) * 100
print(f"""
## RESULTADO DA COMPARACAO

- Total de combinações usuario+código: {len(comparacao)}
- Cobertura em ambas fontes: {cobertura:.1f}%
- Códigos exclusivos da API: {status_counts.get('SO_API', 0)}
- Códigos exclusivos do CONTROLE: {status_counts.get('SO_CTRL', 0)} (provavelmente 2ª QZ)

## PROXIMA ETAPA: COMO TRATAR/CALCULAR

1. PARA CADA USUARIO:
   - Mapear nome API -> CTRL (via dicionario criado)
   - Agrupar transações por código

2. PARA CALCULAR CARGA/TRANSFERENCIA/TARIFA:
   - CARGA = soma de Transferências com valor > 0
   - TRANSFERENCIA = soma de Transferências com valor < 0 (abs)
   - TARIFA = soma de Taxas

3. VALIDACAO:
   - Comparar totais com planilha CONTROLE para o mesmo período
   - Usar códigos de transação como chave de auditoria

4. IMPLEMENTACAO:
   - Cache do mapeamento de nomes
   - Processamento por chunks para períodos grandes
   - Validação cruzada diária
""")
