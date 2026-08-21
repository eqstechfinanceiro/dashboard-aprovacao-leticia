#!/usr/bin/env python3
"""Limpa tabelas de prestação para recomeçar o download"""
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

print("Limpando tabelas de prestação...")
cur.execute("TRUNCATE TABLE prestacao_expenses, prestacao_reports CASCADE")
conn.commit()
print("Tabelas limpas!")

conn.close()
