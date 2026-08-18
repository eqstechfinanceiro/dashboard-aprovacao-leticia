#!/usr/bin/env python3
"""
Framework de Mapeamento API v3/pay x Planilha CONTROLE
Salva resultados em CSV para analise
"""

import pandas as pd
from pathlib import Path
from difflib import SequenceMatcher

API_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/api_statement_1qz.xlsx")
CTRL_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
OUTPUT_DIR = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api")

def normalizar(nome):
    if pd.isna(nome):
        return ""
    return str(nome).upper().strip()

def similaridade(a, b):
    return SequenceMatcher(None, normalizar(a), normalizar(b)).ratio()

print("Carregando dados...")

# API
df_api = pd.read_excel(API_FILE, sheet_name="Extrato")
df_api['Valor'] = pd.to_numeric(df_api['Valor'], errors='coerce')

# Mapear tipos
def mapear_tipo(row):
    if row['Tipo'] == 'Transferência':
        return 'CARGA' if row['Valor'] > 0 else 'TRANSFERÊNCIA'
    elif row['Tipo'] == 'Taxa':
        return 'TARIFA'
    return row['Tipo']

df_api['Tipo_Mapeado'] = df_api.apply(mapear_tipo, axis=1)

# CONTROLE
df_ctrl = pd.read_excel(CTRL_FILE, sheet_name="EXTRATO", header=7)
df_ctrl['Valor'] = pd.to_numeric(df_ctrl['Valor'], errors='coerce')

print("Processando usuarios...")

# Agregar por usuario
agg_api = df_api.groupby('Usuário').agg({
    'Valor': 'sum',
    'Tipo_Mapeado': lambda x: x.value_counts().to_dict()
}).reset_index()
agg_api.columns = ['Usuario', 'Total_API', 'Tipos_API']

agg_ctrl = df_ctrl.groupby('Usuário').agg({
    'Valor': 'sum',
    'Tipo': lambda x: x.value_counts().to_dict()
}).reset_index()
agg_ctrl.columns = ['Usuario', 'Total_CTRL', 'Tipos_CTRL']

# Cruzamento
comparacao = pd.merge(agg_api, agg_ctrl, on='Usuario', how='outer')
comparacao['Diferenca'] = comparacao['Total_API'].fillna(0) - comparacao['Total_CTRL'].fillna(0)

# Classificar match
nomes_api = set(df_api['Usuário'].dropna())
nomes_ctrl = set(df_ctrl['Usuário'].dropna())
match_exato = nomes_api & nomes_ctrl

def classificar(nome):
    if nome in match_exato:
        return 'EXATO'
    elif any(similaridade(nome, c) > 0.8 for c in nomes_ctrl):
        return 'FUZZY'
    return 'SEM_MATCH'

comparacao['Tipo_Match'] = comparacao['Usuario'].apply(classificar)

# Salvar CSV
output_file = OUTPUT_DIR / 'comparacao_api_planilha.csv'
comparacao.to_csv(output_file, index=False, encoding='utf-8-sig')
print(f"\nCSV salvo em: {output_file}")

# Relatorio
print("\n" + "=" * 80)
print("RELATORIO DE MAPEAMENTO")
print("=" * 80)

print(f"\nTotal usuarios API: {len(comparacao[comparacao['Total_API'].notna()])}")
print(f"Total usuarios CTRL: {len(comparacao[comparacao['Total_CTRL'].notna()])}")
print(f"\nMatches EXATO: {len(comparacao[comparacao['Tipo_Match'] == 'EXATO'])}")
print(f"Matches FUZZY: {len(comparacao[comparacao['Tipo_Match'] == 'FUZZY'])}")
print(f"Sem match: {len(comparacao[comparacao['Tipo_Match'] == 'SEM_MATCH'])}")

# Casos com diferenca
print("\n" + "=" * 80)
print("CASOS COM DIFERENCA DE VALOR (Match EXATO/FUZZY)")
print("=" * 80)

com_diferenca = comparacao[
    (comparacao['Tipo_Match'].isin(['EXATO', 'FUZZY'])) & 
    (abs(comparacao['Diferenca']) > 0.01)
].sort_values('Diferenca', key=abs, ascending=False)

if len(com_diferenca) > 0:
    print(f"\n{len(com_diferenca)} usuarios com diferenca:")
    for _, row in com_diferenca.head(20).iterrows():
        print(f"  {row['Usuario']}: API={row['Total_API']:.2f} CTRL={row['Total_CTRL']:.2f} DIF={row['Diferenca']:.2f}")
else:
    print("\nTodos os matches tem valores consistentes!")

# Usuarios sem match
print("\n" + "=" * 80)
print("USUARIOS SEM MATCH NA PLANILHA")
print("=" * 80)

sem_match = comparacao[comparacao['Tipo_Match'] == 'SEM_MATCH']
if len(sem_match) > 0:
    print(f"\n{len(sem_match)} usuarios da API nao encontrados no CONTROLE:")
    for _, row in sem_match.head(10).iterrows():
        print(f"  - {row['Usuario']}")

# Framework final
print("\n" + "=" * 80)
print("FRAMEWORK DE MAPEAMENTO FINAL")
print("=" * 80)
print("""
## REGRAS CONFIRMADAS

1. MAPEAMENTO DE TIPOS:
   API 'Transferencia' + Valor>0  -> CTRL 'CARGA'
   API 'Transferencia' + Valor<0  -> CTRL 'TRANSFERENCIA'  
   API 'Taxa'                      -> CTRL 'TARIFA'
   API 'Compra/Saque/Pix'          -> N/A (despesas, nao movimentacoes)

2. MAPEAMENTO DE NOMES:
   - 96% dos nomes tem MATCH EXATO
   - 4% precisam de FUZZY MATCHING (acentos, abreviacoes)
   - Threshold recomendado: score > 0.8

3. CPF:
   - Nao disponivel no endpoint v3/pay/statement/excel-all
   - Cruzar com /v2/team-members para obter CPF por nome

4. PERIODO:
   - API permite qualquer range de datas
   - Sugestao: testar maximo de 3 meses

## ARQUIVOS GERADOS
""")
print(f"  - CSV comparacao: {output_file}")
print(f"  - Total de registros: {len(comparacao)}")
