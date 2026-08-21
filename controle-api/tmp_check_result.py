import os, psycopg2, psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
c = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = c.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

cur.execute("SELECT COUNT(*) as cnt FROM prestacao_expenses WHERE raw_data->>'payment_method_id' IS NULL")
print(f"Total NULL in DB: {cur.fetchone()['cnt']:,}")

cur.execute("""
    SELECT (raw_data->>'payment_method_id') as pm, COUNT(*) as cnt
    FROM prestacao_expenses
    GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 10
""")
print("All expenses by pm_id:")
for r in cur.fetchall():
    print(f"  pm={r['pm'] or 'NULL'}: {r['cnt']:,}")

# Check with the Aprovado/Enviado filter
cur.execute("""
    SELECT (e.raw_data->>'payment_method_id') as pm, COUNT(*) as cnt
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON e.report_id = r.id
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
    GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 10
""")
print("\nAprovado/Enviado expenses by pm_id:")
for r in cur.fetchall():
    print(f"  pm={r['pm'] or 'NULL'}: {r['cnt']:,}")

c.close()
