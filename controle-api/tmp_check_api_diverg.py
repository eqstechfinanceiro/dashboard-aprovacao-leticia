#!/usr/bin/env python3
"""Check API prestacao data for divergent CPFs."""
import os
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path
from collections import defaultdict

BASE = Path(__file__).parent  # controle-api/
load_dotenv(BASE / ".env")
NEON_URL = os.getenv("NEON_DATABASE_URL")

conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

divergent_cpfs = [
    "26652452804",  # JOSE CARLOS BATISTA
    "07214272946",  # PATRICK FERNANDO GOULART
    "67094260334",  # JACKSON CAROLINO CARNEIRO
    "85648809620",  # LEONARDO GONCALVES RIBEIRO
    "04982917906",  # AFONSO FIORELLO CARVALHO
]

for cpf in divergent_cpfs:
    cur.execute("""
        SELECT r.id, r.name, r.status, r.user_cpf,
               COUNT(e.id) as expense_count,
               COALESCE(SUM(e.value), 0) as total
        FROM prestacao_reports r
        JOIN prestacao_expenses e ON e.report_id = r.id
        WHERE r.user_cpf = %s
          AND (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
          AND TRIM(r.name) !~* '^(fatu|farur|cart)'
          AND TRIM(r.name) !~* '(fatura|fatuar|fatut|farur)'
        GROUP BY r.id, r.name, r.status, r.user_cpf
        ORDER BY r.name
    """, (cpf,))
    rows = cur.fetchall()
    total = sum(float(r["total"]) for r in rows)
    print("\nCPF {} - {} reports, R$ {:,.2f}".format(cpf, len(rows), total))
    for r in rows:
        print("  {} | {:<30} | {} | R$ {:,.2f}".format(
            r["id"], str(r["name"])[:30], r["status"], float(r["total"])))

conn.close()
