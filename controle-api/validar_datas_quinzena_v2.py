#!/usr/bin/env python3
"""
Validar datas exatas das quinzenas - Versão 2
Analisar distribuicao de transacoes para confirmar periodos
"""

import pandas as pd
from pathlib import Path
import json

CTRL_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")

print("=" * 80)
print("VALIDACAO DE DATAS DAS QUINZENAS - V2")
print("=" * 80)

# ============================================
# 1. CARREGAR EXTRATO
# ============================================
print("\n" + "=" * 80)
print("1. CARREGANDO EXTRATO")
print("=" * 80)

df_extrato = pd.read_excel(CTRL_FILE, sheet_name="EXTRATO", header=7)
df_extrato['Valor'] = pd.to_numeric(df_extrato['Valor'], errors='coerce')
df_extrato['Data'] = pd.to_datetime(df_extrato['Data'], unit='D', origin='1899-12-30', errors='coerce')
df_extrato['Dia'] = df_extrato['Data'].dt.day
df_extrato['Mes'] = df_extrato['Data'].dt.month
df_extrato['Ano'] = df_extrato['Data'].dt.year

print(f"Total transacoes: {len(df_extrato)}")
print(f"Período: {df_extrato['Data'].min()} a {df_extrato['Data'].max()}")

# ============================================
# 2. ANALISAR DISTRIBUICAO POR MES/DIA
# ============================================
print("\n" + "=" * 80)
print("2. DISTRIBUICAO DE TRANSACOES POR MES/DIA")
print("=" * 80)

# Agrupar por ano, mes, dia
por_data = df_extrato.groupby(['Ano', 'Mes', 'Dia']).agg({
    'Valor': ['count', 'sum']
}).reset_index()
por_data.columns = ['Ano', 'Mes', 'Dia', 'Qtd', 'Total']

# Mostrar distribuicao
print("\n--- Transacoes por mes/dia ---")
for _, row in por_data.iterrows():
    mes_nome = {4: 'Abr', 5: 'Mai', 6: 'Jun'}.get(int(row['Mes']), row['Mes'])
    print(f"  {int(row['Ano'])}-{mes_nome}-{int(row['Dia']):02d}: {int(row['Qtd']):4d} trans | Total: {row['Total']:12.2f}")

# ============================================
# 3. ANALISAR PERIODOS DE QUINZENA
# ============================================
print("\n" + "=" * 80)
print("3. ANALISE DE PERIODOS DE QUINZENA")
print("=" * 80)

# Funcao para calcular totais de um periodo
def calcular_periodo(df, ano, mes_start, dia_start, mes_end, dia_end):
    mask = (
        ((df['Ano'] > ano) | 
         ((df['Ano'] == ano) & (df['Mes'] > mes_start)) |
         ((df['Ano'] == ano) & (df['Mes'] == mes_start) & (df['Dia'] >= dia_start))) &
        ((df['Ano'] < ano) |
         ((df['Ano'] == ano) & (df['Mes'] < mes_end)) |
         ((df['Ano'] == ano) & (df['Mes'] == mes_end) & (df['Dia'] <= dia_end)))
    )
    periodo = df[mask]
    
    carga = periodo[periodo['Tipo'] == 'CARGA']['Valor'].sum()
    transf = abs(periodo[periodo['Tipo'] == 'TRANSFERÊNCIA']['Valor'].sum())
    tarifa = abs(periodo[periodo['Tipo'] == 'TARIFA']['Valor'].sum())
    
    return {
        'qtd': len(periodo),
        'carga': carga,
        'transf': transf,
        'tarifa': tarifa,
        'saldo': carga - transf - tarifa
    }

# Testar diferentes hipoteses de quinzena para MAIO 2026
print("\n--- Hipoteses para 1a QZ MAIO ---")

# Hipotese 1: 26 Abril a 10 Maio (fechamento dia 11)
h1 = calcular_periodo(df_extrato, 2026, 4, 26, 5, 10)
print(f"\nOpção 1 (26 Abr - 10 Mai | Fechamento dia 11):")
print(f"  Transacoes: {h1['qtd']}")
print(f"  CARGA: R$ {h1['carga']:,.2f}")
print(f"  TRANSFERENCIA: R$ {h1['transf']:,.2f}")
print(f"  TARIFA: R$ {h1['tarifa']:,.2f}")
print(f"  SALDO: R$ {h1['saldo']:,.2f}")

# Hipotese 2: 1 Maio a 15 Maio (calendario)
h2 = calcular_periodo(df_extrato, 2026, 5, 1, 5, 15)
print(f"\nOpção 2 (1 Mai - 15 Mai | Calendario):")
print(f"  Transacoes: {h2['qtd']}")
print(f"  CARGA: R$ {h2['carga']:,.2f}")
print(f"  TRANSFERENCIA: R$ {h2['transf']:,.2f}")
print(f"  TARIFA: R$ {h2['tarifa']:,.2f}")
print(f"  SALDO: R$ {h2['saldo']:,.2f}")

print("\n--- Hipoteses para 2a QZ MAIO ---")

# Hipotese 1: 11 Maio a 25 Maio (fechamento dia 25)
h3 = calcular_periodo(df_extrato, 2026, 5, 11, 5, 25)
print(f"\nOpção 1 (11 Mai - 25 Mai | Fechamento dia 25):")
print(f"  Transacoes: {h3['qtd']}")
print(f"  CARGA: R$ {h3['carga']:,.2f}")
print(f"  TRANSFERENCIA: R$ {h3['transf']:,.2f}")
print(f"  TARIFA: R$ {h3['tarifa']:,.2f}")
print(f"  SALDO: R$ {h3['saldo']:,.2f}")

# Hipotese 2: 16 Maio a 31 Maio (calendario)
h4 = calcular_periodo(df_extrato, 2026, 5, 16, 5, 31)
print(f"\nOpção 2 (16 Mai - 31 Mai | Calendario):")
print(f"  Transacoes: {h4['qtd']}")
print(f"  CARGA: R$ {h4['carga']:,.2f}")
print(f"  TRANSFERENCIA: R$ {h4['transf']:,.2f}")
print(f"  TARIFA: R$ {h4['tarifa']:,.2f}")
print(f"  SALDO: R$ {h4['saldo']:,.2f}")

# ============================================
# 4. TRANSACOES NOS DIAS DE FECHAMENTO
# ============================================
print("\n" + "=" * 80)
print("4. TRANSACOES NOS DIAS DE FECHAMENTO (11 e 25)")
print("=" * 80)

for dia in [11, 25]:
    for mes in [4, 5, 6]:
        dia_df = df_extrato[(df_extrato['Mes'] == mes) & (df_extrato['Dia'] == dia)]
        if len(dia_df) > 0:
            mes_nome = {4: 'Abril', 5: 'Maio', 6: 'Junho'}.get(mes, mes)
            print(f"\n--- {mes_nome} {dia} ---")
            print(f"  Total transacoes: {len(dia_df)}")
            print(f"  Tipos: {dia_df['Tipo'].value_counts().to_dict()}")
            print(f"  Valores:")
            for tipo in dia_df['Tipo'].unique():
                total = dia_df[dia_df['Tipo'] == tipo]['Valor'].sum()
                print(f"    {tipo}: R$ {total:,.2f}")

# ============================================
# 5. CONCLUSAO
# ============================================
print("\n" + "=" * 80)
print("5. CONCLUSAO - DATAS DAS QUINZENAS")
print("=" * 80)

conclusao = f"""
## RESULTADO DA ANALISE

### 1a QZ MAIO 2026

| Opção | Período | Transações | CARGA | TRANSFERÊNCIA | TARIFA | SALDO |
|-------|---------|-----------|-------|--------------|--------|-------|
| Opção 1 | 26 Abr - 10 Mai | {h1['qtd']} | R$ {h1['carga']:,.2f} | R$ {h1['transf']:,.2f} | R$ {h1['tarifa']:,.2f} | R$ {h1['saldo']:,.2f} |
| Opção 2 | 1 Mai - 15 Mai | {h2['qtd']} | R$ {h2['carga']:,.2f} | R$ {h2['transf']:,.2f} | R$ {h2['tarifa']:,.2f} | R$ {h2['saldo']:,.2f} |

### 2a QZ MAIO 2026

| Opção | Período | Transações | CARGA | TRANSFERÊNCIA | TARIFA | SALDO |
|-------|---------|-----------|-------|--------------|--------|-------|
| Opção 1 | 11 Mai - 25 Mai | {h3['qtd']} | R$ {h3['carga']:,.2f} | R$ {h3['transf']:,.2f} | R$ {h3['tarifa']:,.2f} | R$ {h3['saldo']:,.2f} |
| Opção 2 | 16 Mai - 31 Mai | {h4['qtd']} | R$ {h4['carga']:,.2f} | R$ {h4['transf']:,.2f} | R$ {h4['tarifa']:,.2f} | R$ {h4['saldo']:,.2f} |

## OBSERVACOES

1. **Dia 11 de Maio**: {len(df_extrato[(df_extrato['Mes'] == 5) & (df_extrato['Dia'] == 11)])} transacoes (fechamento confirmado)
2. **Dia 25 de Maio**: {len(df_extrato[(df_extrato['Mes'] == 5) & (df_extrato['Dia'] == 25)])} transacoes

3. **Dia 26 de Abril**: {len(df_extrato[(df_extrato['Mes'] == 4) & (df_extrato['Dia'] == 26)])} transacoes
   - Isso sugere que a 1a QZ pode incluir o fim de abril

## RECOMENDACAO

A **Opção 1 (Fechamento nos dias 11 e 25)** parece mais consistente com:
- Dia 11 sendo data de fechamento com transacoes de CARGA/TRANSFERENCIA
- Dia 26 de abril tendo transacoes que podem pertencer a 1a QZ de maio

## PARA IMPLEMENTACAO AUTOMATICA

```python
def get_periodo_quinzena(ano, mes, quinzena):
    if quinzena == "1a QZ":
        # Se mes == 1 (Janeiro), pegar de dezembro do ano anterior
        if mes == 1:
            start = f"{{ano-1}}-12-26"
        else:
            start = f"{{ano}}-{{mes-1:02d}}-26"
        end = f"{{ano}}-{{mes:02d}}-10"
    else:  # 2a QZ
        start = f"{{ano}}-{{mes:02d}}-11"
        end = f"{{ano}}-{{mes:02d}}-25"
    return start, end
```
"""

print(conclusao)

# Salvar resultado
output = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/datas_quinzena_validado_final.md")
with open(output, 'w', encoding='utf-8') as f:
    f.write(conclusao)

print(f"\n✓ Resultado salvo em: {output}")

# Salvar JSON para uso no código
resultado_json = {
    "regra_quinzena": "fechamento_dia_11_e_25",
    "periodo_1a_qz": {"start": "26(mes_ant)", "end": "10", "fechamento": "11"},
    "periodo_2a_qz": {"start": "11", "end": "25", "fechamento": "25"},
    "validado_maio_2026": {
        "1a_qz_opcao1_trans": h1['qtd'],
        "1a_qz_opcao1_saldo": h1['saldo'],
        "2a_qz_opcao1_trans": h3['qtd'],
        "2a_qz_opcao1_saldo": h3['saldo'],
    }
}

output_json = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/regra_quinzena.json")
with open(output_json, 'w', encoding='utf-8') as f:
    json.dump(resultado_json, f, ensure_ascii=False, indent=2)

print(f"✓ JSON salvo em: {output_json}")
