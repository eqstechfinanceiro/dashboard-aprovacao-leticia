import os, psycopg2, warnings
from dotenv import load_dotenv
from pathlib import Path
warnings.filterwarnings("ignore")
load_dotenv(Path(__file__).parent.parent / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur = conn.cursor()
cur.execute("""
    SELECT
        to_char((r.raw_data->>'approval_date')::date, 'YYYY-MM') as ym,
        COUNT(DISTINCT r.id) as reports,
        COUNT(e.id) as expenses,
        SUM(e.value) as valor
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.raw_data->>'approval_date' IS NOT NULL
    GROUP BY 1 ORDER BY 1
""")
rows = cur.fetchall()
conn.close()
print(f"  {'Periodo':<10} {'Reports':>8} {'Expenses':>10} {'Valor':>16}")
print(f"  {'-'*48}")
total_v = 0
for ym, reps, exps, val in rows:
    v = float(val)
    total_v += v
    print(f"  {ym:<10} {reps:>8} {exps:>10}   R$ {v:>12,.2f}")
print(f"  {'-'*48}")
print(f"  {'TOTAL':<10} {'':>8} {'':>10}   R$ {total_v:>12,.2f}")
