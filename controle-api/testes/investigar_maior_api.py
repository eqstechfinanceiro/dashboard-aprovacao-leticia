#!/usr/bin/env python3
"""
Investigar por que a API (expense date) mostra valor MAIOR que a planilha
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
print("  INVESTIGAÇÃO: API MAIOR QUE PLANILHA")
print("=" * 80)

conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor()

# 1. Verificar se há expenses sem report_id (órfãos)
print("\n1. Expenses sem report_id (órfãos):")
cur.execute("SELECT COUNT(*), COALESCE(SUM(value), 0) FROM prestacao_expenses WHERE report_id IS NULL")
count, total = cur.fetchone()
print(f"   {count} expenses, R$ {float(total):,.2f}")

# 2. Verificar se há expenses de reports com status diferente
print("\n2. Expenses por status do report (expense date 11-25/05):")
cur.execute("""
    SELECT r.status, COUNT(e.id), COALESCE(SUM(e.value), 0)
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE e.date >= '2026-05-11' AND e.date <= '2026-05-25'
    GROUP BY r.status
    ORDER BY SUM(e.value) DESC
""")
for status, count, total in cur.fetchall():
    print(f"   {status:<15} {count:>5} expenses  R$ {float(total):>12,.2f}")

# 3. Verificar se há expenses de outros meses com data em 11-25/05
print("\n3. Expenses de reports criados em OUTROS meses:")
cur.execute("""
    SELECT 
        TO_CHAR(r.created_at, 'YYYY-MM') as mes_report,
        COUNT(e.id), 
        COALESCE(SUM(e.value), 0)
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE e.date >= '2026-05-11' AND e.date <= '2026-05-25'
      AND r.created_at < '2026-05-01'
    GROUP BY TO_CHAR(r.created_at, 'YYYY-MM')
    ORDER BY mes_report
""")
for mes, count, total in cur.fetchall():
    print(f"   {mes}     {count:>5} expenses  R$ {float(total):>12,.2f}")

# 4. Top colaboradores na API (expense date) que NÃO estão na planilha
print("\n4. Top 20 colaboradores na API que não estão na planilha (expense date):")

# Ler colaboradores da planilha
df = pd.read_excel(CONTROLE_FILE, sheet_name='QUINZENAS', header=3)
df = df[df['QUINZENA'].astype(str).str.contains('2ª', na=False, case=False)]
df = df[df['MÊS'].astype(str).str.contains('MAIO', na=False, case=False)]
df = df[df['ANO'] == 2026]
nomes_planilha = set(df['COLABORADOR'].dropna().astype(str).str.strip().str.upper())

# Buscar na API
cur.execute("""
    SELECT 
        r.user_name,
        COUNT(e.id),
        COALESCE(SUM(e.value), 0)
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE e.date >= '2026-05-11' AND e.date <= '2026-05-25'
    GROUP BY r.user_name
    ORDER BY SUM(e.value) DESC
""")

nao_na_planilha = []
for nome, count, total in cur.fetchall():
    if nome and nome.upper() not in nomes_planilha:
        nao_na_planilha.append((nome, count, total))

for nome, count, total in nao_na_planilha[:20]:
    print(f"   {nome[:40]:<40} {count:>5} expenses  R$ {float(total):>12,.2f}")

# 5. Verificar duplicados
print("\n5. Verificar expenses duplicados:")
cur.execute("""
    SELECT id, COUNT(*) as qtd
    FROM prestacao_expenses
    GROUP BY id
    HAVING COUNT(*) > 1
""")
duplicados = cur.fetchall()
print(f"   {len(duplicados)} IDs duplicados")

# 6. Verificar colaboradores na planilha que não têm nome na API
print("\n6. Colaboradores na planilha sem nome na API:")
cur.execute("""
    SELECT DISTINCT user_name 
    FROM prestacao_reports 
    WHERE user_name IS NOT NULL
""")
nomes_api = set(r[0].upper() for r in cur.fetchall() if r[0])

sem_nome_api = []
for nome in nomes_planilha:
    nome_parts = nome.split()
    if nome_parts:
        found = any(nome_parts[0] in api_nome for api_nome in nomes_api)
        if not found:
            sem_nome_api.append(nome)

print(f"   {len(sem_nome_api)} colaboradores na planilha não encontrados na API")
for nome in sem_nome_api[:10]:
    print(f"   - {nome}")

conn.close()
print("=" * 80)
