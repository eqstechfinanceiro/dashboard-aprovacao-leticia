import os, psycopg2
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur = conn.cursor()

cur.execute("SELECT COUNT(*) FROM prestacao_reports")
total_reports = cur.fetchone()[0]

cur.execute("SELECT COUNT(DISTINCT report_id) FROM prestacao_expenses")
com_expenses = cur.fetchone()[0]

cur.execute("SELECT COUNT(*) FROM prestacao_expenses")
total_exp = cur.fetchone()[0]

cur.execute("SELECT SUM(value) FROM prestacao_expenses")
soma = float(cur.fetchone()[0] or 0)

sem_expenses = total_reports - com_expenses
print(f"Total reports:     {total_reports:,}")
print(f"Com expenses:      {com_expenses:,}")
print(f"Sem expenses:      {sem_expenses:,}")
print(f"Total expenses:    {total_exp:,}")
print(f"Soma valor:        R$ {soma:,.2f}")

print(f"\nStatus dos reports SEM expenses:")
cur.execute("""
    SELECT status, COUNT(*)
    FROM prestacao_reports
    WHERE NOT EXISTS (SELECT 1 FROM prestacao_expenses e WHERE e.report_id = prestacao_reports.id)
    GROUP BY status ORDER BY COUNT(*) DESC
""")
for status, cnt in cur.fetchall():
    print(f"  {status or '(null)'}: {cnt:,}")

print(f"\nStatus dos reports COM expenses:")
cur.execute("""
    SELECT r.status, COUNT(DISTINCT r.id)
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    GROUP BY r.status ORDER BY COUNT(*) DESC
""")
for status, cnt in cur.fetchall():
    print(f"  {status or '(null)'}: {cnt:,}")

conn.close()
