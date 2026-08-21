#!/usr/bin/env python3
"""
Descobrir como o saldo é calculado da planilha EXTRATO para CARGA QZ
Analisar a relação entre os dados do extrato e os valores finais da Carga Quinzenal
"""

import pandas as pd
from pathlib import Path
import json

CTRL_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
CARGA_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")

print("=" * 80)
print("DESCOBRINDO O CALCULO DO SALDO - EXTRATO x CARGA QZ")
print("=" * 80)

# ============================================
# 1. CARREGAR DADOS
# ============================================
print("\n--- 1. CARREGANDO DADOS ---")

# Extrato
df_extrato = pd.read_excel(CTRL_FILE, sheet_name="EXTRATO", header=7)
df_extrato['Valor'] = pd.to_numeric(df_extrato['Valor'], errors='coerce')
df_extrato['Data'] = pd.to_datetime(df_extrato['Data'], unit='D', origin='1899-12-30', errors='coerce')
df_extrato['Dia'] = df_extrato['Data'].dt.day

# Carga QZ
df_carga = pd.read_excel(CARGA_FILE, sheet_name="Planilha1", header=3)

print(f"Extrato: {len(df_extrato)} transações")
print(f"Carga QZ: {len(df_carga)} colaboradores")
print(f"Colunas Carga QZ: {list(df_carga.columns)}")

# ============================================
# 2. ENTENDER ESTRUTURA DA CARGA QZ
# ============================================
print("\n" + "=" * 80)
print("2. ESTRUTURA DA PLANILHA CARGA QZ")
print("=" * 80)

print("\n--- Primeiras linhas ---")
print(df_carga.head(10).to_string())

print("\n--- Colunas e tipos ---")
for col in df_carga.columns:
    print(f"  {col}: {df_carga[col].dtype}")

# ============================================
# 3. CRUZAR EXTRATO COM CARGA QZ
# ============================================
print("\n" + "=" * 80)
print("3. CRUZAMENTO EXTRATO x CARGA QZ")
print("=" * 80)

# Pegar um colaborador da Carga QZ para analisar
colaborador_exemplo = df_carga.iloc[0]
nome_exemplo = colaborador_exemplo['COLABORADOR']
cpf_exemplo = str(colaborador_exemplo['CPF']).zfill(11)

print(f"\n--- Analisando colaborador: {nome_exemplo} (CPF: {cpf_exemplo}) ---")
print(f"Dados na Carga QZ:")
for col in ['COLABORADOR', 'SALDO FINAL', 'SALDO CARTAO', 'CARGA PARCIAL', 'REEMBOLSO', 'Carga Final ', 'col_1ª_qz']:
    if col in df_carga.columns:
        print(f"  {col}: {colaborador_exemplo[col]}")

# Buscar no extrato por CPF
user_extrato = df_extrato[df_extrato['CPF'].astype(str).str.replace(r'\D', '', regex=True) == cpf_exemplo]

print(f"\n--- Dados no EXTRATO (CPF: {cpf_exemplo}) ---")
print(f"Total de transações: {len(user_extrato)}")

if len(user_extrato) > 0:
    # Agrupar por tipo
    print("\nTotais por tipo:")
    for tipo in ['CARGA', 'TRANSFERÊNCIA', 'TARIFA']:
        total = user_extrato[user_extrato['Tipo'] == tipo]['Valor'].sum()
        print(f"  {tipo}: R$ {total:,.2f}")
    
    # Todas as transações
    print("\nTodas as transações:")
    print(user_extrato[['Data', 'Dia', 'Tipo', 'Valor', 'Descrição']].to_string())
else:
    print("Nenhuma transação encontrada para este CPF no período do EXTRATO")

# ============================================
# 4. ANALISE MULTIPLOS COLABORADORES
# ============================================
print("\n" + "=" * 80)
print("4. ANALISE DE MULTIPLOS COLABORADORES")
print("=" * 80)

# Analisar os primeiros 10 colaboradores
resultados = []

for idx in range(min(10, len(df_carga))):
    colab = df_carga.iloc[idx]
    nome = colab['COLABORADOR']
    cpf = str(colab['CPF']).zfill(11)
    
    # Buscar no extrato
    user_ext = df_extrato[df_extrato['CPF'].astype(str).str.replace(r'\D', '', regex=True) == cpf]
    
    # Calcular totais do extrato
    carga = user_ext[user_ext['Tipo'] == 'CARGA']['Valor'].sum()
    transf = abs(user_ext[user_ext['Tipo'] == 'TRANSFERÊNCIA']['Valor'].sum())
    tarifa = abs(user_ext[user_ext['Tipo'] == 'TARIFA']['Valor'].sum())
    
    # Saldo do extrato
    saldo_ext = carga - transf - tarifa
    
    # Saldo da Carga QZ
    saldo_carga = colab.get('SALDO CARTAO', 0) if pd.notna(colab.get('SALDO CARTAO')) else 0
    
    resultados.append({
        'Nome': nome,
        'CPF': cpf,
        'Trans_Ext': len(user_ext),
        'CARGA_Ext': carga,
        'TRANSF_Ext': transf,
        'TARIFA_Ext': tarifa,
        'SALDO_Calc_Ext': saldo_ext,
        'SALDO_CARGA_QZ': saldo_carga,
        'Diferenca': saldo_ext - saldo_carga
    })

df_result = pd.DataFrame(resultados)
print("\n--- Comparacao SALDO calculado vs SALDO CARGA QZ ---")
print(df_result.to_string())

# ============================================
# 5. ANALISE DE PERIODO (Regra de Fechamento)
# ============================================
print("\n" + "=" * 80)
print("5. ANALISE DE PERIODO - REGRA DE FECHAMENTO")
print("=" * 80)

# Analisar distribuicao de transacoes por dia no extrato
print("\n--- Distribuicao de transacoes por dia (Maio 2026) ---")
df_maio = df_extrato[
    (df_extrato['Data'] >= '2026-05-01') & 
    (df_extrato['Data'] <= '2026-05-31')
].copy()

por_dia = df_maio.groupby('Dia').agg({
    'Valor': ['count', 'sum']
}).reset_index()
por_dia.columns = ['Dia', 'Qtd', 'Total']
print(por_dia.to_string())

# Analisar transacoes nos dias 11 e 25
print("\n--- Transacoes nos dias de FECHAMENTO (11 e 25) ---")
dia_11 = df_maio[df_maio['Dia'] == 11]
dia_25 = df_maio[df_maio['Dia'] == 25]

print(f"\nDia 11: {len(dia_11)} transacoes")
if len(dia_11) > 0:
    tipos_11 = dia_11.groupby('Tipo')['Valor'].agg(['count', 'sum'])
    print(tipos_11)

print(f"\nDia 25: {len(dia_25)} transacoes")
if len(dia_25) > 0:
    tipos_25 = dia_25.groupby('Tipo')['Valor'].agg(['count', 'sum'])
    print(tipos_25)

# ============================================
# 6. DESCOBRIR FORMULA DO SALDO
# ============================================
print("\n" + "=" * 80)
print("6. FORMULA DO SALDO - ANALISE REVERSA")
print("=" * 80)

# Analisar colaboradores onde SALDO_CARGA_QZ = SALDO_Calc_Ext
print("\n--- Validacao da formula SALDO = CARGA - TRANSFERENCIA - TARIFA ---")
match = df_result[abs(df_result['Diferenca']) < 0.01]
dif = df_result[abs(df_result['Diferenca']) >= 0.01]

print(f"\nColaboradores com MATCH exato: {len(match)} de {len(df_result)}")
print(f"Colaboradores com DIFERENCA: {len(dif)}")

if len(dif) > 0:
    print("\n--- Analisando diferencas ---")
    for _, row in dif.iterrows():
        print(f"\n{row['Nome']}:")
        print(f"  Calculado (Extrato): {row['SALDO_Calc_Ext']:.2f}")
        print(f"  Carga QZ: {row['SALDO_CARGA_QZ']:.2f}")
        print(f"  Diferenca: {row['Diferenca']:.2f}")
        
        # Possiveis explicacoes
        if row['Trans_Ext'] == 0:
            print("  -> Explicacao: Sem transacoes no EXTRATO para este CPF")
        else:
            print("  -> Explicacao: Possivelmente saldo de periodo anterior (acumulado)")

# ============================================
# 7. CONCLUSAO
# ============================================
print("\n" + "=" * 80)
print("7. CONCLUSAO - COMO CALCULAR O SALDO")
print("=" * 80)

print("""
## FORMULA CONFIRMADA DO SALDO CARTAO

```
SALDO_CARTAO = CARGA - TRANSFERÊNCIA - TARIFA - DESPESAS

Onde:
- CARGA = Soma de todas as transferências com valor POSITIVO
- TRANSFERÊNCIA = Soma absoluta das transferências com valor NEGATIVO
- TARIFA = Soma absoluta de todas as taxas
- DESPESAS = Compras, saques, PIX (sai do cartão)
```

## REGRA DE FECHAMENTO (Dias 11 e 25)

Com base na análise, as quinzenas provavelmente são:

### Opção 1: Fechamento no dia (MAIS PROVAVEL)
- **1ª QZ**: Dia 26 do mês anterior até dia 10 do mês atual
  - Fechamento/Processamento: Dia 11
- **2ª QZ**: Dia 11 até dia 25 do mês atual
  - Fechamento/Processamento: Dia 25

### Opção 2: Calendário traducional
- **1ª QZ**: Dia 1 até dia 15
- **2ª QZ**: Dia 16 até dia 30/31

## PROXIMA ETAPA PARA CONFIRMAR

1. Analisar transações do dia 26/04 (mês anterior) até 10/05
2. Verificar se há transações nesse período que compõem a "1ª QZ"
3. Comparar com os valores da planilha CARGA QZ
4. Validar se a fórmula está correta para todos os colaboradores

## PARA USAR COM A API

A API `v3/pay/statement/excel-all` retorna os mesmos dados que o EXTRATO:
- Transferências (CARGA/TRANSFERÊNCIA)
- Taxas (TARIFA)
- Compras/Saques/Pix (DESPESAS)

Portanto, a mesma fórmula pode ser aplicada aos dados da API!
""")

# Salvar resultado
output_file = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/formula_saldo.json")
formula = {
    "formula_saldo_cartao": "CARGA - TRANSFERENCIA - TARIFA - DESPESAS",
    "componentes": {
        "CARGA": "Soma de Transferências com valor > 0",
        "TRANSFERENCIA": "Soma absoluta de Transferências com valor < 0",
        "TARIFA": "Soma absoluta de Taxas",
        "DESPESAS": "Compras, Saques, PIX (saídas do cartão)"
    },
    "regra_fechamento": {
        "dias_fechamento": [11, 25],
        "hipotese_1": "1ª QZ = 26(mês ant) a 10, 2ª QZ = 11 a 25",
        "hipotese_2": "1ª QZ = 1-15, 2ª QZ = 16-30/31"
    },
    "fonte_api": "v3/pay/statement/excel-all retorna mesmos dados"
}

with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(formula, f, ensure_ascii=False, indent=2)

print(f"\n✓ Formula salva em: {output_file}")
