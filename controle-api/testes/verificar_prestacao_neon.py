#!/usr/bin/env python3
"""Verifica quantos registros foram baixados nas tabelas de prestação"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import psycopg2

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")

NEON_URL = os.getenv("NEON_DATABASE_URL")

conn = psycopg2.connect(NEON_URL)
cur = conn.cursor()

# Contar reports
cur.execute("SELECT COUNT(*) FROM prestacao_reports")
count_reports = cur.fetchone()[0]

# Contar expenses
cur.execute("SELECT COUNT(*) FROM prestacao_expenses")
count_expenses = cur.fetchone()[0]

# Verificar período dos reports
cur.execute("SELECT MIN(created_at), MAX(created_at) FROM prestacao_reports")
periodo = cur.fetchone()

# Verificar período das expenses
cur.execute("SELECT MIN(date), MAX(date) FROM prestacao_expenses")
periodo_expenses = cur.fetchone()

print("=" * 80)
print("  VERIFICAÇÃO DOWNLOAD PRESTAÇÃO DE CONTAS")
print("=" * 80)
print(f"  Total reports: {count_reports}")
print(f"  Total expenses: {count_expenses}")
print(f"  Período reports: {periodo[0]} a {periodo[1]}")
print(f"  Período expenses: {periodo_expenses[0]} a {periodo_expenses[1]}")
print("=" * 80)

conn.close()
