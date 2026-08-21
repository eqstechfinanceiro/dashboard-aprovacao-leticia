#!/usr/bin/env python3
"""
Calcular Δ(PRESTAÇÃO) para o período 11-25/05/2026 usando dados do Neon
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
print("  CÁLCULO DE Δ(PRESTAÇÃO) - PERÍODO 11-25/05/2026")
print("=" * 80)

conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor()

# Δ(PRESTAÇÃO) = soma de expenses de reports aprovados no período
# Usando expense.date (data da despesa) como critério
print("\n1. Δ(PRESTAÇÃO) usando expense.date (11-25/05):")
cur.execute("""
    SELECT 
        COALESCE(SUM(e.value), 0) as total
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON r.id = e.report_id
    WHERE e.date >= '2026-05-11' 
      AND e.date <= '2026-05-25'
      AND r.status = 'APROVADO'
""")

total_expense_date = cur.fetchone()[0]
print(f"   Total: R$ {float(total_expense_date):,.2f}")

# Detalhamento por colaborador (top 10)
print("\n2. Top 10 colaboradores por valor:")
cur.execute("""
    SELECT 
        r.user_name,
        COUNT(e.id) as qtd_expenses,
        COALESCE(SUM(e.value), 0) as total
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON r.id = e.report_id
    WHERE e.date >= '2026-05-11' 
      AND e.date <= '2026-05-25'
      AND r.status = 'APROVADO'
    GROUP BY r.user_name
    ORDER BY total DESC
    LIMIT 10
""")

print(f"   {'Colaborador':<35} {'Qtd':>5} {'Total':>15}")
print("   " + "-" * 60)
for nome, qtd, total in cur.fetchall():
    print(f"   {str(nome)[:35]:<35} {qtd:>5} R$ {float(total):>13,.2f}")

# Comparar com valor da planilha QUINZENAS (R$ 451.950,00)
print("\n3. Comparação com QUINZENAS:")
print(f"   API (expense.date): R$ {float(total_expense_date):,.2f}")
print(f"   QUINZENAS (2ª QZ MAIO): R$ 451.950,00")
print(f"   Diferença: R$ {float(total_expense_date) - 451950:,.2f}")

# Verificar usando report.created_at
print("\n4. Δ(PRESTAÇÃO) usando report.created_at (11-25/05):")
cur.execute("""
    SELECT 
        COALESCE(SUM(e.value), 0) as total
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON r.id = e.report_id
    WHERE r.created_at >= '2026-05-11' 
      AND r.created_at <= '2026-05-25'
      AND r.status = 'APROVADO'
""")

total_created = cur.fetchone()[0]
print(f"   Total: R$ {float(total_created):,.2f}")
print(f"   Diferença vs QUINZENAS: R$ {float(total_created) - 451950:,.2f}")

conn.close()
print("=" * 80)
