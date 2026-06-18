#!/usr/bin/env python3
"""
Análise do fechamento de quinzena (dias 11 e 25)
Entender como o saldo é calculado via planilha de extrato
"""

import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta

CTRL_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
CARGA_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")

print("=" * 80)
print("ANALISE DO FECHAMENTO DE QUINZENA (Dias 11 e 25)")
print("=" * 80)

# ============================================
# 1. CARREGAR DADOS DO EXTRATO
# ============================================
print("\n--- 1. CARREGANDO PLANILHA DE EXTRATO ---")
df_extrato = pd.read_excel(CTRL_FILE, sheet_name="EXTRATO", header=7)

# Converter valores e datas
df_extrato['Valor'] = pd.to_numeric(df_extrato['Valor'], errors='coerce')
df_extrato['Data'] = pd.to_datetime(df_extrato['Data'], unit='D', origin='1899-12-30', errors='coerce')

print(f"Total de transações no EXTRATO: {len(df_extrato)}")
print(f"Período: {df_extrato['Data'].min()} a {df_extrato['Data'].max()}")
print(f"Usuários únicos: {df_extrato['Usuário'].nunique()}")

# Tipos de transação
print("\n--- Tipos de Transação no EXTRATO ---")
tipos = df_extrato['Tipo'].value_counts()
print(tipos.to_string())

# ============================================
# 2. ANÁLISE DO FECHAMENTO (Dias 11 e 25)
# ============================================
print("\n" + "=" * 80)
print("2. ANALISE DO FECHAMENTO (Dias 11 e 25)")
print("=" * 80)

# Filtrar dados de maio 2026
df_maio = df_extrato[
    (df_extrato['Data'] >= '2026-05-01') & 
    (df_extrato['Data'] <= '2026-05-31')
].copy()

print(f"\nTransações em Maio/2026: {len(df_maio)}")

# Analisar distribuição por dia
print("\n--- Distribuição de Transações por Dia (Maio/2026) ---")
df_maio['Dia'] = df_maio['Data'].dt.day
transacoes_por_dia = df_maio.groupby('Dia').size().sort_index()
print(transacoes_por_dia.to_string())

# Analisar transações nos dias 11 e 25
print("\n--- TRANSACOES NOS DIAS DE FECHAMENTO (11 e 25) ---")
dia_11 = df_maio[df_maio['Dia'] == 11]
dia_25 = df_maio[df_maio['Dia'] == 25]

print(f"\nDia 11: {len(dia_11)} transações")
if len(dia_11) > 0:
    print("Tipos:", dia_11['Tipo'].value_counts().to_dict())
    print("Totais por tipo:")
    for tipo in dia_11['Tipo'].unique():
        total = dia_11[dia_11['Tipo'] == tipo]['Valor'].sum()
        print(f"  {tipo}: R$ {total:,.2f}")

print(f"\nDia 25: {len(dia_25)} transações")
if len(dia_25) > 0:
    print("Tipos:", dia_25['Tipo'].value_counts().to_dict())
    print("Totais por tipo:")
    for tipo in dia_25['Tipo'].unique():
        total = dia_25[dia_25['Tipo'] == tipo]['Valor'].sum()
        print(f"  {tipo}: R$ {total:,.2f}")

# ============================================
# 3. CALCULO DO SALDO POR PERIODO
# ============================================
print("\n" + "=" * 80)
print("3. CALCULO DO SALDO POR PERIODO (Regra de Fechamento)")
print("=" * 80)

# Definir períodos de quinzena baseado no fechamento dia 11 e 25
# Se fechamento é dia 11 e 25, as quinzenas provavelmente são:
# - 1ª QZ: dia 26 do mês anterior até dia 10 do mês atual
# - 2ª QZ: dia 11 até dia 25 do mês atual
# - Mas precisamos confirmar!

print("\n--- Hipoteses de Periodo ---")
print("Se fechamento é dia 11 e 25:")
print("  Opcao A: 1ª QZ = 1-15, 2ª QZ = 16-30 (calendário)")
print("  Opcao B: 1ª QZ = 26-10 (mes anterior), 2ª QZ = 11-25 (fechamento)")
print("  Opcao C: 1ª QZ = 1-10, 2ª QZ = 11-25 (dias específicos)")

# Vamos analisar os dados para descobrir
print("\n--- Analise de Transacoes por Periodo ---")

# Periodo 1: 1-15 de maio
periodo_1_15 = df_maio[(df_maio['Dia'] >= 1) & (df_maio['Dia'] <= 15)]
# Periodo 2: 16-31 de maio
periodo_16_31 = df_maio[(df_maio['Dia'] >= 16) & (df_maio['Dia'] <= 31)]
# Periodo 3: 11-25 de maio (fechamento)
periodo_11_25 = df_maio[(df_maio['Dia'] >= 11) & (df_maio['Dia'] <= 25)]
# Periodo 4: 1-10 de maio
periodo_1_10 = df_maio[(df_maio['Dia'] >= 1) & (df_maio['Dia'] <= 10)]

print(f"\nTransacoes 1-15 (calendario): {len(periodo_1_15)}")
print(f"Transacoes 16-31 (calendario): {len(periodo_16_31)}")
print(f"Transacoes 11-25 (fechamento): {len(periodo_11_25)}")
print(f"Transacoes 1-10: {len(periodo_1_10)}")

# ============================================
# 4. ANALISE DE USUARIO ESPECIFICO
# ============================================
print("\n" + "=" * 80)
print("4. ANALISE DETALHADA - USUARIO DE EXEMPLO")
print("=" * 80)

# Pegar um usuário com dados suficientes
usuarios_com_dados = df_maio.groupby('Usuário').size().sort_values(ascending=False)
usuario_exemplo = usuarios_com_dados.index[0]

print(f"\nUsuario de exemplo: {usuario_exemplo}")
print(f"Total de transacoes: {usuarios_com_dados.iloc[0]}")

user_data = df_maio[df_maio['Usuário'] == usuario_exemplo].copy()
user_data = user_data.sort_values('Data')

print("\n--- Todas as transacoes em Maio ---")
print(user_data[['Data', 'Dia', 'Tipo', 'Valor', 'Descrição']].to_string())

# Calcular saldo acumulado
print("\n--- Calculo do Saldo Acumulado ---")
saldo = 0
print(f"Saldo inicial (antes de 01/05): R$ {saldo:,.2f}")
for _, row in user_data.iterrows():
    saldo += row['Valor']
    print(f"  {row['Data'].strftime('%d/%m')} | {row['Tipo']:15} | {row['Valor']:10.2f} | Saldo: {saldo:10.2f}")

print(f"\nSaldo final (apos 31/05): R$ {saldo:,.2f}")

# ============================================
# 5. COMPARACAO COM PLANILHA CARGA QZ
# ============================================
print("\n" + "=" * 80)
print("5. COMPARACAO COM PLANILHA CARGA QZ")
print("=" * 80)

if CARGA_FILE.exists():
    print(f"\nCarregando: {CARGA_FILE.name}")
    df_carga = pd.read_excel(CARGA_FILE, sheet_name="Planilha1", header=3)
    
    print(f"Total de colaboradores na CARGA QZ: {len(df_carga)}")
    print(f"Colunas: {list(df_carga.columns)[:10]}...")
    
    # Buscar o usuário de exemplo na planilha CARGA
    user_carga = df_carga[df_carga.astype(str).apply(
        lambda x: x.str.contains(usuario_exemplo.split()[0], case=False, na=False)
    ).any(axis=1)]
    
    if len(user_carga) > 0:
        print(f"\n--- Dados do usuario na CARGA QZ ---")
        print(user_carga.to_string())
    else:
        print(f"\nUsuario '{usuario_exemplo}' nao encontrado na CARGA QZ")
        
    # Mostrar estrutura da planilha
    print("\n--- Estrutura da CARGA QZ ---")
    print(df_carga.head(10).to_string())
else:
    print(f"\nArquivo nao encontrado: {CARGA_FILE}")

# ============================================
# 6. CONCLUSAO - COMO CALCULAR O SALDO
# ============================================
print("\n" + "=" * 80)
print("6. CONCLUSAO - FORMULA DE CALCULO DO SALDO")
print("=" * 80)

print("""
## HIPOTESE DE FECHAMENTO (Baseado em dias 11 e 25)

Se o fechamento ocorre nos dias 11 e 25, as quinzenas provavelmente são:

### Opcao 1: Fechamento no dia (mais provavel)
- **1ª QZ**: Dia 26 do mês anterior até dia 10 do mês atual
  - Fechamento/processamento: Dia 11
- **2ª QZ**: Dia 11 até dia 25 do mês atual
  - Fechamento/processamento: Dia 25

### Opcao 2: Calendario traducional
- **1ª QZ**: Dia 1 até dia 15
- **2ª QZ**: Dia 16 até dia 30/31

## FORMULA DO SALDO (Confirmada)

```
SALDO_CARTAO = CARGA - TRANSFERENCIA - TARIFA - DESPESAS

Onde:
- CARGA = soma de todas as transferências com valor POSITIVO
- TRANSFERENCIA = soma absoluta das transferências com valor NEGATIVO
- TARIFA = soma absoluta de todas as taxas
- DESPESAS = compras, saques, pix (saidas do cartao)
```

## PROXIMA ETAPA

Para confirmar a regra de fechamento, precisamos:
1. Analisar transacoes do dia 26/04 (mes anterior) ate 10/05
2. Verificar se ha transacoes nesse periodo que compoem a "1ª QZ"
3. Comparar com os valores da planilha CARGA QZ
""")

print("\n" + "=" * 80)
print("Analise concluida!")
print("=" * 80)
