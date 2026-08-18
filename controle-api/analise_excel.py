#!/usr/bin/env python3
"""
Análise dos arquivos Excel para entender:
1. Estrutura da planilha CARGA QZ
2. Estrutura da planilha CONTROLE (aba EXTRATO)
3. Como os dados de CARGA, TRANSFERENCIA, TARIFA, SALDO CARTAO são organizados
"""

import pandas as pd
import openpyxl
from pathlib import Path

DATA_DIR = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data")

def analisar_carga_qz():
    """Analisa a estrutura da planilha CARGA QZ"""
    print("=" * 80)
    print("ANÁLISE: CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")
    print("=" * 80)
    
    file = DATA_DIR / "CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx"
    
    # Verificar abas disponíveis
    xls = pd.ExcelFile(file)
    print(f"\nAbas disponíveis: {xls.sheet_names}")
    
    # Ler a aba Planilha1
    df = pd.read_excel(file, sheet_name="Planilha1", header=None)
    print(f"\nDimensões: {df.shape} (linhas x colunas)")
    
    # Mostrar as primeiras 10 linhas
    print("\n--- Primeiras 10 linhas (bruto) ---")
    for i in range(min(10, len(df))):
        print(f"Linha {i+1}: {df.iloc[i].tolist()}")
    
    # Identificar cabeçalho (geralmente linha 6)
    df_headers = pd.read_excel(file, sheet_name="Planilha1", header=5)
    print(f"\n--- Cabeçalhos (linha 6) ---")
    print(df_headers.columns.tolist())
    
    # Mostrar primeiras linhas de dados
    print(f"\n--- Primeiras 5 linhas de dados ---")
    print(df_headers.head())
    
    # Verificar colunas específicas de interesse
    colunas_interesse = ['COLABORADOR', 'CPF', 'SALDO REEMBOLSAR', 'SALDO FINAL', 
                         'SALDO CARTAO', 'CARGA PARCIAL', 'REEMBOLSO', 'Carga Final']
    
    print("\n--- Amostra de colaboradores com valores ---")
    for col in colunas_interesse:
        if col in df_headers.columns:
            print(f"\n{col}:")
            print(df_headers[col].head(10).to_string())
    
    return df_headers

def analisar_controle_extrato():
    """Analisa a aba EXTRATO do arquivo CONTROLE"""
    print("\n" + "=" * 80)
    print("ANÁLISE: CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx - Aba EXTRATO")
    print("=" * 80)
    
    file = DATA_DIR / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"
    
    # Verificar abas disponíveis
    xls = pd.ExcelFile(file)
    print(f"\nAbas disponíveis: {xls.sheet_names}")
    
    # Ler a aba EXTRATO
    # Baseado no import_to_sqlite.py, o header está na linha 8 (índice 7)
    df = pd.read_excel(file, sheet_name="EXTRATO", header=7)
    print(f"\nDimensões EXTRATO: {df.shape} (linhas x colunas)")
    print(f"Colunas: {df.columns.tolist()}")
    
    # Mostrar primeiras linhas
    print("\n--- Primeiras 10 linhas do EXTRATO ---")
    print(df.head(10))
    
    # Analisar tipos únicos de transação
    if 'TIPO' in df.columns or 'Tipo' in df.columns:
        tipo_col = 'TIPO' if 'TIPO' in df.columns else 'Tipo'
        print(f"\n--- Tipos de transação únicos ---")
        print(df[tipo_col].value_counts())
    
    # Analisar um CPF específico (JORGE ANTONIO - 01063690080)
    print("\n--- Dados para CPF 01063690080 (JORGE ANTONIO) ---")
    jorge = df[df['CPF'] == '01063690080'] if 'CPF' in df.columns else df[df['cpf'] == '01063690080']
    if len(jorge) > 0:
        print(jorge)
        # Calcular totais por tipo
        if 'TIPO' in jorge.columns and 'VALOR' in jorge.columns:
            print("\n--- Totais por tipo para JORGE ANTONIO ---")
            print(jorge.groupby('TIPO')['VALOR'].sum())
    else:
        print("CPF não encontrado na amostra inicial, buscando em todo o arquivo...")
        # Buscar em todo o arquivo
        df_full = pd.read_excel(file, sheet_name="EXTRATO", header=7)
        for col in df_full.columns:
            if df_full[col].astype(str).str.contains('01063690080', na=False).any():
                print(f"Encontrado na coluna {col}")
                jorge = df_full[df_full[col].astype(str).str.contains('01063690080', na=False)]
                print(jorge.head(20))
                break
    
    return df

def analisar_controle_painel():
    """Analisa a aba PAINEL do arquivo CONTROLE"""
    print("\n" + "=" * 80)
    print("ANÁLISE: CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx - Aba PAINEL")
    print("=" * 80)
    
    file = DATA_DIR / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"
    
    # Ler a aba PAINEL (header na linha 11, índice 10)
    df = pd.read_excel(file, sheet_name="PAINEL", header=10)
    print(f"\nDimensões PAINEL: {df.shape} (linhas x colunas)")
    print(f"Colunas: {df.columns.tolist()}")
    
    # Mostrar dados de JORGE ANTONIO
    print("\n--- Dados de JORGE ANTONIO no PAINEL ---")
    jorge = df[df['COLABORADOR'].astype(str).str.contains('JORGE', na=False, case=False)]
    print(jorge.to_string())
    
    return df

def comparar_estruturas():
    """Compara como os dados são obtidos na planilha antiga vs API"""
    print("\n" + "=" * 80)
    print("COMPARAÇÃO: Planilha Antiga vs API")
    print("=" * 80)
    
    print("""
## PLANILHA ANTIGA (CONTROLE Excel)

### Como obtém CARGA, TRANSFERÊNCIA, TARIFA, SALDO CARTÃO:

1. **Aba EXTRATO** no arquivo CONTROLE-VEXPENSES-MAIO-2026.xlsx:
   - Contém histórico de todas as transações
   - Colunas: Data, Hora, Código, Número do Cartão, Grupo, Usuário, Tipo, Descrição, Valor, Status...
   - Cada linha é uma transação individual
   - CARGA = Transferências com Valor > 0
   - TRANSFERÊNCIA = Transferências com Valor < 0
   - TARIFA = linhas com Tipo = "Taxa"
   - SALDO CARTÃO = saldo acumulado no momento

2. **Cálculo é feito por CPF**, somando todas as transações até a data de corte

## API VExpenses v3/pay (NOVA DESCOBERTA)

### Endpoints disponíveis:

1. **GET /v3/pay/statement/excel-all?start_date=&end_date=**
   - Retorna URL de XLSX com extrato de TODOS os colaboradores
   - Estrutura idêntica à aba EXTRATO da planilha
   - Inclui: Data, Hora, Tipo, Usuário, Valor, etc.
   - Pode ser filtrado por período!

2. **GET /v3/pay/statement/account-aggregations/{id}**
   - Retorna saldo atual (daily_balances) por grupo
   - Permite obter SALDO CARTÃO atual

3. **GET /v3/pay/v2/app/card-groups/**
   - Lista os 23 grupos regionais com account_aggregation_id

### Vantagens da API vs Planilha Manual:

| Aspecto | Planilha Antiga | API Nova |
|---------|----------------|----------|
| **Atualização** | Manual, mensal | Automática, em tempo real |
| **Período** | Fixo (mês atual) | Qualquer período (start_date/end_date) |
| **Dados históricos** | Limitado ao mês | Completo (qualquer range) |
| **Processo** | Copiar/colar do painel VExpenses | Download automático via código |
| **Cálculo quinzenal** | Manual (metade do mês) | Dinâmico por período |

### Como usar a API para cálculo dinâmico:

**Para calcular a 1ª QZ (dias 1-15):**
```
GET /v3/pay/statement/excel-all?start_date=2026-05-01&end_date=2026-05-15
```

**Para calcular a 2ª QZ (dias 16-31):**
```
GET /v3/pay/statement/excel-all?start_date=2026-05-16&end_date=2026-05-31
```

**Para calcular saldo acumulado até uma data:**
```
GET /v3/pay/statement/excel-all?start_date=2020-01-01&end_date=2026-05-31
```

### Mapeamento de campos API -> Planilha:

| Dado Planilha | Origem no XLSX da API | Cálculo |
|--------------|----------------------|---------|
| **CARGA** | Tipo="Transferência", Valor>0 | Soma das entradas no período |
| **TRANSFERÊNCIA** | Tipo="Transferência", Valor<0 | Soma das saídas (abs) |
| **TARIFA** | Tipo="Taxa" | Soma das taxas no período |
| **SALDO CARTÃO** | Linha com Hora="-" ou daily_balances | Valor inicial + soma transações |
| **SALDO PRESTAÇÃO** | CARGA + TRANSFERÊNCIA + TARIFA - PRESTAÇÃO | Fórmula existente |
    """)

if __name__ == "__main__":
    print("Iniciando análise...")
    
    # Analisar CARGA QZ
    df_carga = analisar_carga_qz()
    
    # Analisar CONTROLE - EXTRATO
    df_extrato = analisar_controle_extrato()
    
    # Analisar CONTROLE - PAINEL
    df_painel = analisar_controle_painel()
    
    # Comparar estruturas
    comparar_estruturas()
    
    print("\n" + "=" * 80)
    print("Análise concluída!")
    print("=" * 80)
