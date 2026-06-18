#!/usr/bin/env python3
"""Atualiza nomes em lotes de 1000 para ser mais rápido"""
import os
from dotenv import load_dotenv
import psycopg2

load_dotenv(r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\controle-api\.env')

NEON_URL = os.getenv("NEON_DATABASE_URL")
conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor()

print("Atualizando nomes em lotes...")

# Atualizar em lotes de 1000
batch_size = 1000
offset = 0

while True:
    cur.execute("""
        UPDATE prestacao_reports
        SET 
            user_name = COALESCE(
                raw_data->'user'->'data'->>'name',
                raw_data->>'name'
            ),
            user_cpf = COALESCE(
                raw_data->'user'->'data'->>'cpf',
                raw_data->>'cpf'
            )
        WHERE id IN (
            SELECT id FROM prestacao_reports
            WHERE user_name IS NULL
            ORDER BY id
            LIMIT %s
        )
    """, (batch_size,))
    
    conn.commit()
    
    if cur.rowcount == 0:
        break
    
    offset += cur.rowcount
    print(f"  Atualizados: {offset}")

print(f"✓ Total atualizado: {offset} reports")
conn.close()
