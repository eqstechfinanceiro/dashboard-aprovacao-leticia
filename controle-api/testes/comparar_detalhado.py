#!/usr/bin/env python3
"""
Comparar detalhadamente planilha CONTROLE vs API para entender a diferença
"""
import pandas as pd
import psycopg2
import os
from dotenv import load_dotenv
from pathlib import Path

BASE = Path(__file__).parent.parent
CONTROLE_FILE = BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"

load_dotenv(BASE / ".env")
NEON_URL = os.getenv("NEON_DATABASE_URL")

print("=" * 80)
print("  COMPARAÇÃO DETALHADA: CONTROLE vs API")
print("=" * 80)

# Ler planilha
df = pd.read_excel(CONTROLE_FILE, sheet_name='QUINZENAS', header=3)
df['VALOR'] = pd.to_numeric(df['VALOR'], errors='coerce')
df['ANO'] = pd.to_numeric(df['ANO'], errors='coerce')

# Filtrar 2ª QZ MAIO 2026
filtro = (
    (df['QUINZENA'].astype(str).str.contains('2ª', na=False, case=False)) &
    (df['MÊS'].astype(str).str.contains('MAIO', na=False, case=False)) &
    (df['ANO'] == 2026) &
    (df['VALOR'] > 0)
)
df_qz = df[filtro].copy()

print(f"\n📊 PLANILHA CONTROLE - 2ª QZ MAIO 2026:")
print(f"  Total: R$ {df_qz['VALOR'].sum():,.2f}")
print(f"  Registros: {len(df_qz)}")

# Top 20 colaboradores da planilha
print("\n  Top 20 colaboradores (PLANILHA):")
df_top = df_qz.sort_values('VALOR', ascending=False).head(20)
for _, row in df_top.iterrows():
    print(f"    {row['COLABORADOR']:<35} R$ {row['VALOR']:>10,.2f}")

# Consultar API - por report date
conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor()

cur.execute("""
    SELECT 
        r.user_name,
        COUNT(e.id) as qtd,
        COALESCE(SUM(e.value), 0) as total
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.created_at >= '2026-05-11' AND r.created_at <= '2026-05-25'
      AND r.status = 'APROVADO'
    GROUP BY r.user_name
    ORDER BY total DESC
    LIMIT 20
""")

print("\n📊 API - Top 20 colaboradores (por report date):")
api_report_total = 0
for nome, qtd, total in cur.fetchall():
    print(f"    {nome or 'N/A':<35} R$ {total:>10,.2f} ({qtd} despesas)")
    api_report_total += total

print(f"\n  Total API (report date): R$ {api_report_total:,.2f}")

# Consultar API - por expense date
cur.execute("""
    SELECT 
        r.user_name,
        COUNT(e.id) as qtd,
        COALESCE(SUM(e.value), 0) as total
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE e.date >= '2026-05-11' AND e.date <= '2026-05-25'
      AND r.status = 'APROVADO'
    GROUP BY r.user_name
    ORDER BY total DESC
    LIMIT 20
""")

print("\n📊 API - Top 20 colaboradores (por expense date):")
api_expense_total = 0
for nome, qtd, total in cur.fetchall():
    print(f"    {nome or 'N/A':<35} R$ {total:>10,.2f} ({qtd} despesas)")
    api_expense_total += total

print(f"\n  Total API (expense date): R$ {api_expense_total:,.2f}")

# Comparar valores por colaborador
print("\n" + "=" * 80)
print("  COMPARAÇÃO POR COLABORADOR (Top 10 da planilha)")
print("=" * 80)

for _, row in df_qz.sort_values('VALOR', ascending=False).head(10).iterrows():
    nome = row['COLABORADOR']
    valor_planilha = row['VALOR']
    
    # Buscar na API por nome (match aproximado)
    cur.execute("""
        SELECT COALESCE(SUM(e.value), 0)
        FROM prestacao_reports r
        JOIN prestacao_expenses e ON e.report_id = r.id
        WHERE r.created_at >= '2026-05-11' AND r.created_at <= '2026-05-25'
          AND r.status = 'APROVADO'
          AND r.user_name ILIKE %s
    """, (f"%{nome.split()[0]}%",))
    
    valor_api = float(cur.fetchone()[0])
    diff = valor_planilha - valor_api
    
    print(f"\n  {nome}:")
    print(f"    Planilha: R$ {valor_planilha:>10,.2f}")
    print(f"    API:      R$ {valor_api:>10,.2f}")
    print(f"    Diferença: R$ {diff:>10,.2f}")

conn.close()

print("\n" + "=" * 80)
print("  ANÁLISE DE CAUSAS POSSÍVEIS")
print("=" * 80)
print("""
1. A planilha pode usar 'DATA' (coluna DATA) que parece ser número serial Excel
   em vez da data de criação do report

2. A planilha pode acumular prestações de períodos anteriores (acumulado)

3. A API pode estar filtrando por 'created_at' do report, mas a planilha
   pode usar outro critério (data de aprovação, data da despesa, etc.)

4. Verificar se há diferença de status: a planilha pode incluir 'ENVIADO'
   enquanto a API filtra apenas 'APROVADO'
""")
print("=" * 80)
