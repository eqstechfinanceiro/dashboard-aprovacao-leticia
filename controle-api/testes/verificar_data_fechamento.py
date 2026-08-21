#!/usr/bin/env python3
"""
Verificar se QUINZENAS usa data de fechamento (25/05) para filtrar reports
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import psycopg2

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")
NEON_URL = os.getenv("NEON_DATABASE_URL")

print("=" * 80)
print("  VERIFICAÇÃO: DATA DE FECHAMENTO (25/05)")
print("=" * 80)

conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor()

# A QUINZENAS mostra DATA = 25/05 para 2ª QZ
# Vou verificar se há reports criados em 25/05
print("\n1. Reports criados em 25/05/2026:")
cur.execute("""
    SELECT 
        r.id,
        r.user_name,
        COUNT(e.id) as qtd_expenses,
        COALESCE(SUM(e.value), 0) as total
    FROM prestacao_reports r
    LEFT JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE DATE(r.created_at) = '2026-05-25'
    GROUP BY r.id, r.user_name
    ORDER BY total DESC
    LIMIT 20
""")

print(f"   {'Report ID':<12} {'Colaborador':<30} {'Qtd':>5} {'Total':>12}")
print("   " + "-" * 60)
total_25 = 0
for rid, nome, qtd, total in cur.fetchall():
    print(f"   {rid:<12} {str(nome)[:30]:<30} {qtd:>5} R$ {float(total):>10,.2f}")
    total_25 += float(total)

print(f"\n   Total reports criados em 25/05: R$ {total_25:,.2f}")

# Verificar ABNER especificamente
print("\n2. ABNER ANDRADE CAVALCANTE:")
cur.execute("""
    SELECT 
        r.id,
        r.created_at,
        COUNT(e.id) as qtd_expenses,
        COALESCE(SUM(e.value), 0) as total
    FROM prestacao_reports r
    LEFT JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.user_name ILIKE '%ABNER%'
      AND r.created_at >= '2026-05-11' AND r.created_at <= '2026-05-25'
    GROUP BY r.id, r.created_at
    ORDER BY r.created_at
""")

print("   Reports no período 11-25/05:")
total_abner = 0
for rid, created_at, qtd, total in cur.fetchall():
    print(f"     Report {rid} em {created_at}: {qtd} expenses, R$ {float(total):,.2f}")
    total_abner += float(total)

print(f"\n   Total ABNER (11-25/05): R$ {total_abner:,.2f}")
print(f"   Valor na QUINZENAS: R$ 9.840,00")

# Verificar se há reports criados antes de 11/05 mas com expenses em 11-25/05
print("\n3. Reports criados ANTES de 11/05 com expenses em 11-25/05:")
cur.execute("""
    SELECT 
        r.id,
        r.created_at,
        COUNT(e.id) as qtd_expenses,
        COALESCE(SUM(e.value), 0) as total
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.created_at < '2026-05-11'
      AND e.date >= '2026-05-11' AND e.date <= '2026-05-25'
    GROUP BY r.id, r.created_at
    ORDER BY total DESC
    LIMIT 10
""")

total_antes = 0
for rid, created_at, qtd, total in cur.fetchall():
    print(f"     Report {rid} criado em {created_at}: {qtd} expenses, R$ {float(total):,.2f}")
    total_antes += float(total)

print(f"\n   Total: R$ {total_antes:,.2f}")

conn.close()
print("=" * 80)
