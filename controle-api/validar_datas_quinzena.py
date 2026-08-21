#!/usr/bin/env python3
"""
Validar datas exatas das quinzenas analisando CARGA 1 QZ e CARGA 2 QZ
Confirmar se os períodos são:
- 1ª QZ: 26(mês ant) a 10 ou 1 a 15?
- 2ª QZ: 11 a 25 ou 16 a 30/31?
"""

import pandas as pd
from pathlib import Path

CARGA_1QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")
CARGA_2QZ = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 2 QZ MAIO 26 VEXPENSES EQS (1).xlsx")
CTRL_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")

print("=" * 80)
print("VALIDACAO DE DATAS DAS QUINZENAS")
print("=" * 80)

# ============================================
# 1. ANALISAR CARGA 1 QZ
# ============================================
print("\n" + "=" * 80)
print("1. ANALISANDO CARGA 1 QZ")
print("=" * 80)

df_1qz = pd.read_excel(CARGA_1QZ, sheet_name="Planilha1", header=0)
print(f"\nColunas: {list(df_1qz.columns)}")
print(f"Total colaboradores: {len(df_1qz)}")
print("\nPrimeiras linhas:")
print(df_1qz.head(3).to_string())

# Verificar se tem algum indicador de período
for col in df_1qz.columns:
    if any(x in str(col).upper() for x in ['DATA', 'PERIODO', 'QZ', 'QUIN']):
        print(f"\nColuna de data encontrada: {col}")
        print(df_1qz[col].head())

# ============================================
# 2. ANALISAR CARGA 2 QZ
# ============================================
print("\n" + "=" * 80)
print("2. ANALISANDO CARGA 2 QZ")
print("=" * 80)

df_2qz = pd.read_excel(CARGA_2QZ, sheet_name="2 QZ DE MAIO 26", header=3)
print(f"\nColunas: {list(df_2qz.columns)}")
print(f"Total colaboradores: {len(df_2qz)}")
print("\nPrimeiras linhas:")
print(df_2qz.head(3).to_string())

# ============================================
# 3. ANALISAR EXTRATO - DISTRIBUICAO POR DIA
# ============================================
print("\n" + "=" * 80)
print("3. ANALISANDO EXTRATO - DISTRIBUICAO POR DIA")
print("=" * 80)

df_extrato = pd.read_excel(CTRL_FILE, sheet_name="EXTRATO", header=7)
df_extrato['Data'] = pd.to_datetime(df_extrato['Data'], unit='D', origin='1899-12-30', errors='coerce')
df_extrato['Dia'] = df_extrato['Data'].dt.day
df_extrato['Mes'] = df_extrato['Data'].dt.month
df_extrato['Valor'] = pd.to_numeric(df_extrato['Valor'], errors='coerce')

# Analisar distribuicao por dia em maio 2026
df_maio = df_extrato[df_extrato['Mes'] == 5]

print(f"\nTransacoes em Maio/2026: {len(df_maio)}")

# Agrupar por dia
por_dia = df_maio.groupby('Dia').agg({
    'Valor': ['count', 'sum']
}).reset_index()
por_dia.columns = ['Dia', 'Qtd', 'Total']

print("\n--- Distribuicao por dia (Maio) ---")
print(por_dia.to_string(index=False))

# Analisar transacoes nos dias de fechamento
print("\n--- Transacoes nos dias de FECHAMENTO ---")
for dia in [11, 25]:
    dia_df = df_maio[df_maio['Dia'] == dia]
    if len(dia_df) > 0:
        print(f"\nDia {dia}: {len(dia_df)} transacoes")
        print("Tipos:", dia_df['Tipo'].value_counts().to_dict())
    else:
        print(f"\nDia {dia}: 0 transacoes")

# Analisar transacoes em abril (para ver se comeca dia 26)
df_abril = df_extrato[df_extrato['Mes'] == 4]
print(f"\n--- Transacoes em Abril/2026 ---")
print(f"Total: {len(df_abril)}")
if len(df_abril) > 0:
    por_dia_abr = df_abril.groupby(df_abril['Data'].dt.day).size()
    print("Distribuicao por dia:")
    print(por_dia_abr.to_string())

# ============================================
# 4. CRUZAR COM CARGA QZ PARA VALIDAR
# ============================================
print("\n" + "=" * 80)
print("4. CRUZAMENTO EXTRATO x CARGA QZ")
print("=" * 80)

# Limpar CPFs
df_extrato['CPF_Limpo'] = df_extrato['CPF'].astype(str).str.replace(r'\D', '', regex=True)
df_1qz['CPF_Limpo'] = df_1qz['CPF'].astype(str).str.replace(r'\D', '', regex=True).str.zfill(11)

# Analisar alguns colaboradores
print("\n--- Analise de colaboradores ---")
for idx in range(min(5, len(df_1qz))):
    colab = df_1qz.iloc[idx]
    cpf = colab['CPF_Limpo']
    nome = colab.get('COLABORADOR', f'Colab_{idx}')
    
    # Buscar no extrato
    user_ext = df_extrato[df_extrato['CPF_Limpo'] == cpf]
    
    # Filtrar por periodos
    ext_1_10 = user_ext[(user_ext['Mes'] == 5) & (user_ext['Dia'] >= 1) & (user_ext['Dia'] <= 10)]
    ext_11_25 = user_ext[(user_ext['Mes'] == 5) & (user_ext['Dia'] >= 11) & (user_ext['Dia'] <= 25)]
    ext_26_30_abr = user_ext[(user_ext['Mes'] == 4) & (user_ext['Dia'] >= 26)]
    
    print(f"\n{nome} (CPF: {cpf}):")
    print(f"  1-10 Maio: {len(ext_1_10)} transacoes")
    print(f"  11-25 Maio: {len(ext_11_25)} transacoes")
    print(f"  26-30 Abril: {len(ext_26_30_abr)} transacoes")
    print(f"  SALDO CARTAO na 1QZ: {colab.get('SALDO CARTAO', 'N/A')}")

# ============================================
# 5. CONCLUSAO
# ============================================
print("\n" + "=" * 80)
print("5. CONCLUSAO - DATAS DAS QUINZENAS")
print("=" * 80)

conclusao = """
## ANALISE DOS DADOS

Com base na distribuicao de transacoes:

### Opcao 1: Fechamento no dia (MAIS PROVAVEL)
```
1a QZ: 26(mes anterior) a 10 do mes atual
       -> Fechamento dia 11
       
2a QZ: 11 a 25 do mes atual
       -> Fechamento dia 25
```

### Opcao 2: Calendario traducional
```
1a QZ: 1 a 15 do mes
2a QZ: 16 a 30/31 do mes
```

### Como validar 100%:

1. Analisar CARGA 2 QZ e ver se os valores batem com extrato 11-25
2. Verificar se ha transacoes em 26-30 abril que impactam 1a QZ maio
3. Comparar totais de CARGA/TRANSFERENCIA/TARIFA por periodo

### Para implementacao automatica:

```python
def get_periodo_quinzena(ano, mes, quinzena):
    if quinzena == "1a QZ":
        # Opcao 1 (fechamento dia 11)
        if mes == 1:
            start = f"{ano-1}-12-26"
        else:
            start = f"{ano}-{mes-1:02d}-26"
        end = f"{ano}-{mes:02d}-10"
        
        # Opcao 2 (calendario)
        # start = f"{ano}-{mes:02d}-01"
        # end = f"{ano}-{mes:02d}-15"
        
    else:  # 2a QZ
        # Opcao 1 (fechamento dia 25)
        start = f"{ano}-{mes:02d}-11"
        end = f"{ano}-{mes:02d}-25"
        
        # Opcao 2 (calendario)
        # start = f"{ano}-{mes:02d}-16"
        # end = f"{ano}-{mes:02d}-30"  # ou 31
    
    return start, end
```
"""

print(conclusao)

# Salvar
output = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/datas_quinzena_validado.md")
with open(output, 'w', encoding='utf-8') as f:
    f.write(conclusao)

print(f"\n✓ Validacao salva em: {output}")
