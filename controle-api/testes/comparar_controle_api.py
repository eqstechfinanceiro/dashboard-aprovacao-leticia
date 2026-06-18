#!/usr/bin/env python3
"""
Comparar valor de PRESTAÇÃO da planilha CONTROLE com o valor da API (Δ = R$ 205.793,25)
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import psycopg2

# Verificar se pandas/openpyxl está disponível
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False
    print("⚠ pandas não instalado. Instalando...")
    os.system("pip install pandas openpyxl -q")
    import pandas as pd

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")

NEON_URL = os.getenv("NEON_DATABASE_URL")

# Arquivo CONTROLE
CONTROLE_FILE = BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"

print("=" * 80)
print("  COMPARAÇÃO: CONTROLE vs API (Prestação 2ª QZ MAIO 2026)")
print("=" * 80)

# ============================================================
# 1. Ler planilha CONTROLE
# ============================================================
print("\n📊 Lendo planilha CONTROLE...")

# Abrir o arquivo Excel
xl = pd.ExcelFile(CONTROLE_FILE)
print(f"  Abas disponíveis: {xl.sheet_names}")

# Procurar a aba de CONTROLE ou PAINEL
aba_controle = None
for sheet in xl.sheet_names:
    if 'CONTROLE' in sheet.upper() or 'PAINEL' in sheet.upper():
        aba_controle = sheet
        break

if not aba_controle:
    aba_controle = xl.sheet_names[0]  # Usar primeira aba

print(f"  Usando aba: '{aba_controle}'")
df = pd.read_excel(CONTROLE_FILE, sheet_name=aba_controle)

print(f"  Linhas: {len(df)}, Colunas: {len(df.columns)}")
print(f"  Colunas: {list(df.columns[:10])}...")

# Procurar coluna de PRESTAÇÃO
print("\n  Procurando coluna PRESTAÇÃO...")
col_prestacao = None
for col in df.columns:
    if 'PREST' in str(col).upper():
        col_prestacao = col
        print(f"  ✓ Encontrada: '{col}'")
        break

if col_prestacao:
    # Verificar se a coluna tem valores
    valores_prestacao = df[col_prestacao].dropna()
    print(f"  Valores não-nulos: {len(valores_prestacao)}")
    
    if len(valores_prestacao) > 0:
        # Mostrar amostra
        print(f"\n  Amostra de valores:")
        for i, (idx, val) in enumerate(valores_prestacao.head(10).items()):
            print(f"    Linha {idx}: R$ {val:,.2f}")
        
        # Tentar calcular total
        try:
            total_prestacao = pd.to_numeric(valores_prestacao, errors='coerce').sum()
            print(f"\n  TOTAL PRESTAÇÃO (CONTROLE): R$ {total_prestacao:,.2f}")
            
            # Comparar com API
            total_api = 205793.25
            print(f"\n  TOTAL PRESTAÇÃO (API): R$ {total_api:,.2f}")
            
            diferenca = abs(total_prestacao - total_api)
            pct_dif = (diferenca / total_prestacao * 100) if total_prestacao > 0 else 0
            
            print(f"\n  DIFERENÇA: R$ {diferenca:,.2f} ({pct_dif:.1f}%)")
            
            if pct_dif < 5:
                print("  ✅ DENTRO DA MARGEM DE ERRO (< 5%)")
            else:
                print("  ⚠️ DIFERENÇA SIGNIFICATIVA (> 5%)")
                
        except Exception as e:
            print(f"  Erro ao calcular total: {e}")
else:
    print("  ⚠️ Coluna PRESTAÇÃO não encontrada")
    print("\n  Colunas disponíveis:")
    for i, col in enumerate(df.columns):
        print(f"    {i}: {col}")

# ============================================================
# 2. Verificar dados no Neon
# ============================================================
print("\n" + "=" * 80)
print("  VERIFICAÇÃO NO NEON")
print("=" * 80)

conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor()

# Verificar total de expenses no período
cur.execute("""
    SELECT COUNT(*), COALESCE(SUM(value), 0)
    FROM prestacao_expenses
    WHERE date >= '2026-05-11' AND date <= '2026-05-25'
""")
qtd, total = cur.fetchone()
print(f"  Expenses no período 11-25/05: {qtd} despesas")
print(f"  Total (por data do expense): R$ {total:,.2f}")

# Também por created_at do report (nossa métrica principal)
cur.execute("""
    SELECT COUNT(e.id), COALESCE(SUM(e.value), 0)
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.created_at >= '2026-05-11' AND r.created_at <= '2026-05-25'
      AND r.status = 'APROVADO'
""")
qtd2, total2 = cur.fetchone()
print(f"  Total (por data do report): R$ {total2:,.2f}")

conn.close()

print("\n" + "=" * 80)
print("  CONCLUSÃO")
print("=" * 80)
print(f"  API (report date): R$ {total2:,.2f}")
print(f"  API (expense date): R$ {total:,.2f}")
print("=" * 80)
