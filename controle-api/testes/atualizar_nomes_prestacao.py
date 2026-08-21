#!/usr/bin/env python3
"""Atualiza nomes dos colaboradores nos reports a partir do raw_data JSON"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
import json

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")

NEON_URL = os.getenv("NEON_DATABASE_URL")
conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor()

print("Atualizando nomes dos colaboradores...")

# Buscar todos os reports com raw_data
cur.execute("SELECT id, raw_data FROM prestacao_reports WHERE user_name IS NULL")
reports = cur.fetchall()

atualizados = 0
for rid, raw_data in reports:
    if raw_data:
        try:
            # raw_data é um dict (JSONB do PostgreSQL já vem como dict no psycopg2)
            if isinstance(raw_data, dict):
                data = raw_data
            else:
                data = json.loads(raw_data)
            
            # Extrair nome do usuário - estrutura: data.user.data.name
            user_data = data.get("user", {})
            if isinstance(user_data, dict):
                user_inner = user_data.get("data", {})
                if isinstance(user_inner, dict):
                    name = user_inner.get("name")
                    cpf = user_inner.get("cpf")
                    
                    if name:
                        cur.execute("""
                            UPDATE prestacao_reports 
                            SET user_name = %s, user_cpf = %s
                            WHERE id = %s
                        """, (name, cpf, rid))
                        atualizados += 1
        except Exception as e:
            print(f"Erro no report {rid}: {e}")

conn.commit()
print(f"✓ {atualizados} reports atualizados com nome do colaborador")
conn.close()
