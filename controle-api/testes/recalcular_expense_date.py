#!/usr/bin/env python3
"""
Recalcular Δ(PRESTAÇÃO) usando data da DESPESA (expense.date) e comparar com planilha
"""
import os
import pandas as pd
import psycopg2
from dotenv import load_dotenv
from pathlib import Path

BASE = Path(__file__).parent.parent
CONTROLE_FILE = BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"

load_dotenv(BASE / ".env")
NEON_URL = os.getenv("NEON_DATABASE_URL")

print("=" * 80)
print("  RECÁLCULO POR DATA DA DESPESA (expense.date)")
print("=" * 80)

conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor()

# Calcular por expense date (todas as quinzenas de maio 2026)
periodos = [
    ("1ª QZ MAIO (01-10/05)", "2026-05-01", "2026-05-10"),
    ("2ª QZ MAIO (11-25/05)", "2026-05-11", "2026-05-25"),
    ("3ª QZ MAIO (26-31/05)", "2026-05-26", "2026-05-31"),
    ("TODO MAIO 2026", "2026-05-01", "2026-05-31"),
]

print("\n📊 API - Por data da despesa (expense.date):")
for desc, inicio, fim in periodos:
    cur.execute("""
        SELECT COUNT(*), COALESCE(SUM(value), 0)
        FROM prestacao_expenses
        WHERE date >= %s AND date <= %s
    """, (inicio, fim))
    count, total = cur.fetchone()
    print(f"  {desc:<25} {count:>5} expenses  R$ {float(total):>12,.2f}")

# Por data do report para comparação
print("\n📊 API - Por data do report (report.created_at):")
for desc, inicio, fim in periodos:
    cur.execute("""
        SELECT COUNT(e.id), COALESCE(SUM(e.value), 0)
        FROM prestacao_reports r
        JOIN prestacao_expenses e ON e.report_id = r.id
        WHERE r.created_at >= %s AND r.created_at <= %s
    """, (inicio, fim))
    count, total = cur.fetchone()
    print(f"  {desc:<25} {count:>5} expenses  R$ {float(total):>12,.2f}")

# Ler planilha
print("\n📊 PLANILHA CONTROLE:")
df = pd.read_excel(CONTROLE_FILE, sheet_name='QUINZENAS', header=3)
df['VALOR'] = pd.to_numeric(df['VALOR'], errors='coerce')
df['ANO'] = pd.to_numeric(df['ANO'], errors='coerce')

for qz in ['1ª QZ', '2ª QZ']:
    filtro = (
        (df['QUINZENA'].astype(str).str.contains(qz, na=False, case=False)) &
        (df['MÊS'].astype(str).str.contains('MAIO', na=False, case=False)) &
        (df['ANO'] == 2026) &
        (df['VALOR'] > 0)
    )
    df_qz = df[filtro]
    total = df_qz['VALOR'].sum()
    print(f"  {qz:<25} {len(df_qz):>5} registros  R$ {total:>12,.2f}")

# Comparar 2ª QZ em detalhe
print("\n" + "=" * 80)
print("  COMPARAÇÃO DETALHADA - 2ª QZ MAIO 2026")
print("=" * 80)

filtro_2qz = (
    (df['QUINZENA'].astype(str).str.contains('2ª', na=False, case=False)) &
    (df['MÊS'].astype(str).str.contains('MAIO', na=False, case=False)) &
    (df['ANO'] == 2026) &
    (df['VALOR'] > 0)
)
df_2qz = df[filtro_2qz].copy()

# Buscar na API por cada colaborador da planilha
print("\n  Comparando colaboradores (Planilha vs API por expense date):")
print(f"  {'Colaborador':<40} {'Planilha':>12} {'API':>12} {'Diferença':>12}")
print("  " + "-" * 80)

total_planilha = 0
total_api = 0

for _, row in df_2qz.sort_values('VALOR', ascending=False).iterrows():
    nome = str(row['COLABORADOR'])
    valor_planilha = row['VALOR']
    
    if pd.isna(nome) or nome == 'nan':
        continue
    
    # Buscar na API por expense date
    cur.execute("""
        SELECT COALESCE(SUM(e.value), 0)
        FROM prestacao_reports r
        JOIN prestacao_expenses e ON e.report_id = r.id
        WHERE e.date >= '2026-05-11' AND e.date <= '2026-05-25'
          AND r.user_name ILIKE %s
    """, (f"%{nome.split()[0]}%",))
    
    valor_api = float(cur.fetchone()[0])
    diff = valor_planilha - valor_api
    
    total_planilha += valor_planilha
    total_api += valor_api
    
    if abs(diff) > 100:  # Só mostrar diferenças significativas
        print(f"  {nome[:40]:<40} R$ {valor_planilha:>10,.2f} R$ {valor_api:>10,.2f} R$ {diff:>10,.2f}")

print("  " + "-" * 80)
print(f"  {'TOTAL':<40} R$ {total_planilha:>10,.2f} R$ {total_api:>10,.2f} R$ {total_planilha - total_api:>10,.2f}")

conn.close()
print("=" * 80)
