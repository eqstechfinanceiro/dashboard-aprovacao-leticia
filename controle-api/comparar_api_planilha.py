#!/usr/bin/env python3
"""
Comparação entre dados da API v3/pay/statement/excel-all e planilha CONTROLE Excel
Objetivo: Criar framework perfeito de mapeamento API x PLANILHA
"""

import pandas as pd
from pathlib import Path
from difflib import SequenceMatcher

# Arquivos
API_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/api_statement_1qz.xlsx")
CTRL_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")

def normalizar_nome(nome):
    """Normaliza nome para comparação"""
    if pd.isna(nome):
        return ""
    nome = str(nome).upper().strip()
    # Remover acentos comuns
    nome = nome.replace('Á', 'A').replace('É', 'E').replace('Í', 'I').replace('Ó', 'O').replace('Ú', 'U')
    nome = nome.replace('Ã', 'A').replace('Õ', 'O').replace('Ç', 'C')
    return nome

def similaridade(a, b):
    """Calcula similaridade entre duas strings (0 a 1)"""
    return SequenceMatcher(None, a, b).ratio()

def encontrar_melhor_match(nome_api, nomes_controle):
    """Encontra o melhor match fuzzy para um nome da API"""
    nome_api_norm = normalizar_nome(nome_api)
    
    melhor_score = 0
    melhor_nome = None
    
    for nome_ctrl in nomes_controle:
        score = similaridade(nome_api_norm, normalizar_nome(nome_ctrl))
        if score > melhor_score:
            melhor_score = score
            melhor_nome = nome_ctrl
    
    return melhor_nome, melhor_score

print("=" * 80)
print("COMPARAÇÃO: API v3/pay/statement/excel-all vs CONTROLE Excel")
print("Período: 2026-05-01 a 2026-05-15 (1ª QZ)")
print("=" * 80)

# Carregar dados da API
print("\n--- CARREGANDO DADOS DA API ---")
df_api = pd.read_excel(API_FILE, sheet_name="Extrato", header=0)
df_api['Valor'] = pd.to_numeric(df_api['Valor'], errors='coerce')

# Mapear tipos da API para tipos do CONTROLE
# Na API: Transferência (positivo) = CARGA, Transferência (negativo) = TRANSFERÊNCIA, Taxa = TARIFA
df_api['Tipo_Mapeado'] = df_api.apply(
    lambda row: 'CARGA' if row['Tipo'] == 'Transferência' and row['Valor'] > 0
    else 'TRANSFERÊNCIA' if row['Tipo'] == 'Transferência' and row['Valor'] < 0
    else 'TARIFA' if row['Tipo'] == 'Taxa'
    else row['Tipo'],
    axis=1
)

print(f"Total de transações na API: {len(df_api)}")
print(f"Usuários únicos na API: {df_api['Usuário'].nunique()}")

# Carregar dados do CONTROLE
print("\n--- CARREGANDO DADOS DO CONTROLE ---")
df_ctrl = pd.read_excel(CTRL_FILE, sheet_name="EXTRATO", header=7)
df_ctrl['Valor'] = pd.to_numeric(df_ctrl['Valor'], errors='coerce')

print(f"Total de transações no CONTROLE: {len(df_ctrl)}")
print(f"CPFs únicos no CONTROLE: {df_ctrl['CPF'].nunique()}")

# Obter lista de nomes únicos
nomes_api = df_api['Usuário'].dropna().unique().tolist()
nomes_ctrl = df_ctrl['Usuário'].dropna().unique().tolist()

print(f"\n--- ANÁLISE DE NOMES ---")
print(f"Nomes únicos na API: {len(nomes_api)}")
print(f"Nomes únicos no CONTROLE: {len(nomes_ctrl)}")

print(f"\n--- AMOSTRA DE NOMES NA API ---")
for nome in sorted(nomes_api)[:15]:
    print(f"  - {nome}")

print(f"\n--- AMOSTRA DE NOMES NO CONTROLE ---")
for nome in sorted(nomes_ctrl)[:15]:
    print(f"  - {nome}")

# Cruzamento por nome exato
print("\n--- CRUZAMENTO POR NOME EXATO ---")
match_exato = set(nomes_api) & set(nomes_ctrl)
print(f"Matches exatos: {len(match_exato)} de {len(nomes_api)} na API")

# Tentar fuzzy matching para os não-matches
print("\n--- FUZZY MATCHING PARA NOMES NÃO ENCONTRADOS ---")
nao_encontrados = [n for n in nomes_api if n not in nomes_ctrl]
print(f"Tentando match para {len(nao_encontrados)} nomes...")

for nome_api in nao_encontrados[:10]:  # Primeiros 10
    melhor_match, score = encontrar_melhor_match(nome_api, nomes_ctrl)
    if score > 0.7:
        print(f"  {nome_api} -> {melhor_match} (score: {score:.2f})")
    else:
        print(f"  {nome_api} -> Nenhum match bom (melhor: {melhor_match}, score: {score:.2f})")

# Comparar valores por usuário
print("\n" + "=" * 80)
print("COMPARAÇÃO DE VALORES POR USUÁRIO")
print("=" * 80)

# Agregar por usuário na API
agg_api = df_api.groupby('Usuário').agg({
    'Valor': 'sum',
    'Tipo_Mapeado': lambda x: x.value_counts().to_dict()
}).reset_index()
agg_api.columns = ['Usuário', 'Total_API', 'Tipos_API']

# Agregar por usuário no CONTROLE
agg_ctrl = df_ctrl.groupby('Usuário').agg({
    'Valor': 'sum',
    'Tipo': lambda x: x.value_counts().to_dict()
}).reset_index()
agg_ctrl.columns = ['Usuário', 'Total_CTRL', 'Tipos_CTRL']

# Cruzar
comparacao = pd.merge(agg_api, agg_ctrl, on='Usuário', how='outer')
comparacao['Diferença'] = comparacao['Total_API'] - comparacao['Total_CTRL']
def classificar_match(nome):
    if nome in match_exato:
        return 'EXATO'
    elif any(similaridade(nome, c) > 0.8 for c in nomes_ctrl):
        return 'FUZZY'
    else:
        return 'SEM MATCH'

comparacao['Match'] = comparacao['Usuário'].apply(classificar_match)

print("\n--- PRIMEIROS 20 USUÁRIOS ---")
print(comparacao.head(20)[['Usuário', 'Match', 'Total_API', 'Total_CTRL', 'Diferença']].to_string())

# Analisar casos com match mas valores diferentes
print("\n--- CASOS COM MATCH MAS VALORES DIFERENTES ---")
match_diff = comparacao[
    (comparacao['Match'].str.contains('EXATO|FUZZY')) & 
    (abs(comparacao['Diferença']) > 0.01)
]
if len(match_diff) > 0:
    print(match_diff[['Usuário', 'Total_API', 'Total_CTRL', 'Diferença', 'Tipos_API', 'Tipos_CTRL']].head(10).to_string())
else:
    print("Todos os matches têm valores consistentes!")

# Framework de mapeamento
print("\n" + "=" * 80)
print("FRAMEWORK DE MAPEAMENTO API x PLANILHA")
print("=" * 80)
print("""
## MAPEAMENTO DE CAMPOS

| Campo Planilha | Campo API | Regra de Transformação |
|----------------|-----------|------------------------|
| Usuário | Usuário | Normalizar + Fuzzy Match |
| CPF | N/A | Não disponível na API v3/pay - usar v2/team-members |
| TIPO=CARGA | Tipo=Transferência + Valor>0 | Mapear positivos como CARGA |
| TIPO=TRANSFERÊNCIA | Tipo=Transferência + Valor<0 | Mapear negativos como TRANSFERÊNCIA |
| TIPO=TARIFA | Tipo=Taxa | Mapear diretamente |
| Valor | Valor | Mesmo valor numérico |
| Data | Data | Mesmo formato |
| Grupo | Grupo | Mesmo valor |
| Centro de Custo | Centro de Custo | Novo na API (não existia no CONTROLE) |

## MAPEAMENTO DE NOMES (Exemplos Encontrados)
""")

# Mostrar exemplos de mapeamento de nomes
mapeamentos = []
for nome_api in nomes_api[:20]:
    if nome_api in nomes_ctrl:
        mapeamentos.append((nome_api, nome_api, "EXATO", 1.0))
    else:
        melhor, score = encontrar_melhor_match(nome_api, nomes_ctrl)
        if score > 0.7:
            mapeamentos.append((nome_api, melhor, "FUZZY", score))

for api, ctrl, tipo, score in mapeamentos[:15]:
    print(f"  API: '{api}' -> CTRL: '{ctrl}' [{tipo}, score={score:.2f}]")

print("""
## LIMITAÇÕES IDENTIFICADAS

1. **CPF não disponível** no endpoint v3/pay/statement/excel-all
   - Solução: Cruzar com /v2/team-members para obter CPF por nome

2. **Abreviações de nomes** na API
   - Ex: "JORGE A. V. D. SILVA" vs "JORGE ANTONIO VARGAS DA SILVA"
   - Solução: Usar fuzzy matching (SequenceMatcher > 0.8)

3. **Período máximo** não testado ainda
   - Sugestão: Testar ranges de 1, 2, 3 meses

4. **Tipos diferentes** de transações
   - API tem mais tipos (Compra, Saque, Pix) que não existem no CONTROLE
   - Esses são despesas, não movimentações financeiras

## PRÓXIMOS PASSOS RECOMENDADOS

1. Implementar cruzamento com /v2/team-members para obter CPF
2. Testar período máximo (3 meses?)
3. Validar fuzzy matching com mais casos
4. Implementar cache de mapeamento nome->CPF
5. Criar algoritmo de reconciliação automática
""")

print("\n" + "=" * 80)
print("Análise concluída!")
print("=" * 80)
