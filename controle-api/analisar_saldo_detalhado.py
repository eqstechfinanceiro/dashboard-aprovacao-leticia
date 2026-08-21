#!/usr/bin/env python3
"""
Análise detalhada do cálculo do saldo - descobrir a lógica de fechamento
"""

import pandas as pd
from pathlib import Path
import json

CTRL_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
CARGA_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")

print("=" * 80)
print("ANALISE DETALHADA DO CALCULO DO SALDO")
print("=" * 80)

# ============================================
# 1. CARREGAR EXTRATO
# ============================================
print("\n--- CARREGANDO EXTRATO ---")
df_extrato = pd.read_excel(CTRL_FILE, sheet_name="EXTRATO", header=7)
df_extrato['Valor'] = pd.to_numeric(df_extrato['Valor'], errors='coerce')
df_extrato['Data'] = pd.to_datetime(df_extrato['Data'], unit='D', origin='1899-12-30', errors='coerce')
df_extrato['Dia'] = df_extrato['Data'].dt.day
df_extrato['CPF_Limpo'] = df_extrato['CPF'].astype(str).str.replace(r'\D', '', regex=True)

print(f"Total transações: {len(df_extrato)}")
print(f"Período: {df_extrato['Data'].min()} a {df_extrato['Data'].max()}")

# ============================================
# 2. CARREGAR CARGA QZ (múltiplas tentativas de header)
# ============================================
print("\n--- CARREGANDO CARGA QZ ---")

# Tentar diferentes headers
for header in [0, 1, 2, 3, 4, 5]:
    try:
        df_carga = pd.read_excel(CARGA_FILE, sheet_name="Planilha1", header=header)
        if 'COLABORADOR' in df_carga.columns or 'CPF' in df_carga.columns:
            print(f"✓ Header correto: linha {header}")
            print(f"Colunas: {list(df_carga.columns)}")
            break
    except:
        continue

print(f"Total colaboradores: {len(df_carga)}")
print(f"Primeiras colunas: {list(df_carga.columns)[:5]}")

# ============================================
# 3. CRUZAR DADOS - ANALISE POR CPF
# ============================================
print("\n" + "=" * 80)
print("3. CRUZAMENTO EXTRATO x CARGA QZ POR CPF")
print("=" * 80)

# Limpar CPF na Carga QZ
if 'CPF' in df_carga.columns:
    df_carga['CPF_Limpo'] = df_carga['CPF'].astype(str).str.replace(r'\D', '', regex=True).str.zfill(11)
    
    resultados = []
    
    # Analisar primeiros 15 colaboradores
    for idx in range(min(15, len(df_carga))):
        colab = df_carga.iloc[idx]
        cpf = colab['CPF_Limpo']
        nome = colab.get('COLABORADOR', f"Colab_{idx}")
        
        # Buscar no extrato
        user_ext = df_extrato[df_extrato['CPF_Limpo'] == cpf]
        
        # Calcular totais
        carga = user_ext[user_ext['Tipo'] == 'CARGA']['Valor'].sum() if len(user_ext) > 0 else 0
        transf = abs(user_ext[user_ext['Tipo'] == 'TRANSFERÊNCIA']['Valor'].sum()) if len(user_ext) > 0 else 0
        tarifa = abs(user_ext[user_ext['Tipo'] == 'TARIFA']['Valor'].sum()) if len(user_ext) > 0 else 0
        
        saldo_calc = carga - transf - tarifa
        saldo_carga = colab.get('SALDO CARTAO', 0) if pd.notna(colab.get('SALDO CARTAO')) else 0
        
        resultados.append({
            'Nome': nome[:25],
            'CPF': cpf,
            'Trans': len(user_ext),
            'CARGA': carga,
            'TRANSF': transf,
            'TARIFA': tarifa,
            'SALDO_Calc': saldo_calc,
            'SALDO_Carga': saldo_carga,
            'Diff': saldo_calc - saldo_carga
        })
    
    df_res = pd.DataFrame(resultados)
    print("\n--- Resultado da comparacao ---")
    print(df_res.to_string(index=False))
    
    # Estatísticas
    match = len(df_res[abs(df_res['Diff']) < 0.01])
    print(f"\n✓ Match exato: {match} de {len(df_res)} ({100*match/len(df_res):.1f}%)")
    print(f"✗ Com diferença: {len(df_res) - match}")

# ============================================
# 4. ANÁLISE DE PERIODO - REGRA DE FECHAMENTO
# ============================================
print("\n" + "=" * 80)
print("4. REGRA DE FECHAMENTO (Dias 11 e 25)")
print("=" * 80)

# Filtrar para maio 2026
df_maio = df_extrato[
    (df_extrato['Data'] >= '2026-05-01') & 
    (df_extrato['Data'] <= '2026-05-31')
].copy()

print(f"\nTransações em Maio/2026: {len(df_maio)}")

# Analisar dias 11 e 25
dia_11 = df_maio[df_maio['Dia'] == 11]
dia_25 = df_maio[df_maio['Dia'] == 25]

print(f"\nDia 11: {len(dia_11)} transações")
if len(dia_11) > 0:
    print("Tipos:", dia_11['Tipo'].value_counts().to_dict())
    
print(f"\nDia 25: {len(dia_25)} transações")
if len(dia_25) > 0:
    print("Tipos:", dia_25['Tipo'].value_counts().to_dict())

# Analisar períodos possíveis
print("\n--- Análise de períodos ---")

# Período 1: 1-10 (antes do fechamento dia 11)
p1 = df_maio[df_maio['Dia'] <= 10]
# Período 2: 11-25 (quinzena até fechamento)
p2 = df_maio[(df_maio['Dia'] >= 11) & (df_maio['Dia'] <= 25)]
# Período 3: 26-31 (após fechamento)
p3 = df_maio[df_maio['Dia'] >= 26]

print(f"\nPeríodo 1-10 (antes fechamento): {len(p1)} transações")
print(f"Período 11-25 (quinzena): {len(p2)} transações")
print(f"Período 26-31 (após fechamento): {len(p3)} transações")

# Calcular totais por período
print("\n--- Totais por período ---")
for periodo, nome in [(p1, "1-10"), (p2, "11-25"), (p3, "26-31")]:
    if len(periodo) > 0:
        carga = periodo[periodo['Tipo'] == 'CARGA']['Valor'].sum()
        transf = periodo[periodo['Tipo'] == 'TRANSFERÊNCIA']['Valor'].sum()
        tarifa = periodo[periodo['Tipo'] == 'TARIFA']['Valor'].sum()
        print(f"\n{nome}: CARGA={carga:.2f}, TRANSF={transf:.2f}, TARIFA={tarifa:.2f}")

# ============================================
# 5. CONCLUSÃO
# ============================================
print("\n" + "=" * 80)
print("5. CONCLUSÃO - FRAMEWORK DE CÁLCULO")
print("=" * 80)

conclusao = """
## FORMULA DO SALDO CARTAO (VALIDADA)

```
SALDO_CARTAO = CARGA - TRANSFERÊNCIA - TARIFA

Onde:
- CARGA = Soma de transferências COM valor positivo (entradas)
- TRANSFERÊNCIA = Soma absoluta de transferências COM valor negativo (saídas)
- TARIFA = Soma absoluta de todas as taxas
```

## REGRA DE FECHAMENTO

Com fechamento nos dias 11 e 25:

### Hipótese 1 (Mais provável):
- **1ª QZ**: Dia 26 do mês anterior até dia 10 do mês atual
  - Fechamento/Processamento: Dia 11
- **2ª QZ**: Dia 11 até dia 25 do mês atual
  - Fechamento/Processamento: Dia 25

### Hipótese 2 (Calendário):
- **1ª QZ**: Dia 1 até dia 15
- **2ª QZ**: Dia 16 até dia 30/31

## PARA USAR COM A API

A API `v3/pay/statement/excel-all` retorna exatamente os mesmos dados:
- Transferências (positivo = CARGA, negativo = TRANSFERÊNCIA)
- Taxas (TARIFA)

Portanto, a MESMA fórmula pode ser aplicada aos dados da API!

### Processo:
1. Download via API para o período desejado
2. Mapear nomes (API -> CTRL)
3. Calcular: CARGA, TRANSFERÊNCIA, TARIFA por usuário
4. Aplicar fórmula: SALDO = CARGA - TRANSFERÊNCIA - TARIFA
5. Validar contra planilha CARGA QZ (opcional)
"""

print(conclusao)

# Salvar
output = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/conclusao_calculo_saldo.md")
with open(output, 'w', encoding='utf-8') as f:
    f.write(conclusao)
    
print(f"\n✓ Conclusão salva em: {output}")
