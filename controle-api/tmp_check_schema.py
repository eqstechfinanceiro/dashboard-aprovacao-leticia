#!/usr/bin/env python3
"""Check database schema for extrato and prestacao tables."""
import os
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path

BASE = Path(__file__).parent
load_dotenv(BASE / ".env")
NEON_URL = os.getenv("NEON_DATABASE_URL")

conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Check extrato_movimentacao columns
cur.execute("""
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'extrato_movimentacao'
    ORDER BY ordinal_position
""")
print("extrato_movimentacao columns:")
for r in cur.fetchall():
    print("  {} ({})".format(r["column_name"], r["data_type"]))

# Check prestacao_reports columns
cur.execute("""
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'prestacao_reports'
    ORDER BY ordinal_position
""")
print("\nprestacao_reports columns:")
for r in cur.fetchall():
    print("  {} ({})".format(r["column_name"], r["data_type"]))

# Check prestacao_expenses columns
cur.execute("""
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'prestacao_expenses'
    ORDER BY ordinal_position
""")
print("\nprestacao_expenses columns:")
for r in cur.fetchall():
    print("  {} ({})".format(r["column_name"], r["data_type"]))

# Sample extrato row
cur.execute("SELECT * FROM extrato_movimentacao LIMIT 1")
r = cur.fetchone()
print("\nSample extrato row:")
for k, v in r.items():
    print("  {} = {}".format(k, repr(v)[:60]))

# Sample prestacao_reports row
cur.execute("SELECT * FROM prestacao_reports LIMIT 1")
r = cur.fetchone()
print("\nSample prestacao_reports row:")
for k, v in r.items():
    print("  {} = {}".format(k, repr(v)[:60]))

# Sample prestacao_expenses row
cur.execute("SELECT * FROM prestacao_expenses LIMIT 1")
r = cur.fetchone()
print("\nSample prestacao_expenses row:")
for k, v in r.items():
    print("  {} = {}".format(k, repr(v)[:60]))

conn.close()
