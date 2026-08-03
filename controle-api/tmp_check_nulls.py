import os, psycopg2, psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Show all 36 NULL expenses with details
cur.execute("""
    SELECT e.id, e.report_id, e.value, e.description, e.date,
           r.name as report_name, r.user_name, r.user_cpf,
           r.raw_data->>'pdf_link' as pdf_link,
           r.raw_data->>'observation' as observation
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON e.report_id = r.id
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
      AND e.raw_data->>'payment_method_id' IS NULL
    ORDER BY e.value DESC
""")
rows = cur.fetchall()
print(f"NULL pm_id expenses: {len(rows)}\n")
for r in rows:
    print(f"id={r['id']} | report={r['report_name']} | user={r['user_name']} | R$ {float(r['value']):,.2f}")
    print(f"  desc: {r['description']}")
    print(f"  obs: {r.get('observation') or ''}")
    print(f"  pdf: {r.get('pdf_link') or ''}")
    print()

conn.close()
