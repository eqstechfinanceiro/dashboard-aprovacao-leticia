#!/usr/bin/env python3
"""Verificar se a diferença é devido ao status ENVIADO vs APROVADO"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import psycopg2

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")
NEON_URL = os.getenv("NEON_DATABASE_URL")

conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor()

print("=" * 80)
print("  VERIFICAÇÃO POR STATUS")
print("=" * 80)

# Verificar total por status no período
for status in ['APROVADO', 'ENVIADO']:
    cur.execute("""
        SELECT COUNT(*), COALESCE(SUM(e.value), 0)
        FROM prestacao_reports r
        LEFT JOIN prestacao_expenses e ON e.report_id = r.id
        WHERE r.created_at >= '2026-05-11' AND r.created_at <= '2026-05-25'
          AND r.status = %s
    """, (status,))
    count, total = cur.fetchone()
    print(f"  Status {status}: {count} reports, R$ {float(total):,.2f}")

# Verificar ABNER especificamente
print()
print("  ABNER ANDRADE CAVALCANTE:")
for status in ['APROVADO', 'ENVIADO']:
    cur.execute("""
        SELECT COUNT(*), COALESCE(SUM(e.value), 0)
        FROM prestacao_reports r
        LEFT JOIN prestacao_expenses e ON e.report_id = r.id
        WHERE r.created_at >= '2026-05-11' AND r.created_at <= '2026-05-25'
          AND r.status = %s
          AND r.user_name ILIKE '%%ABNER%%'
    """, (status,))
    count, total = cur.fetchone()
    print(f"    Status {status}: {count} reports, R$ {float(total):,.2f}")

# Verificar distribuição de status no período
print()
print("  Distribuição de status no período:")
cur.execute("""
    SELECT r.status, COUNT(*), COALESCE(SUM(e.value), 0)
    FROM prestacao_reports r
    LEFT JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.created_at >= '2026-05-11' AND r.created_at <= '2026-05-25'
    GROUP BY r.status
""")
for status, count, total in cur.fetchall():
    print(f"    {status}: {count} reports, R$ {float(total):,.2f}")

conn.close()
print("=" * 80)
