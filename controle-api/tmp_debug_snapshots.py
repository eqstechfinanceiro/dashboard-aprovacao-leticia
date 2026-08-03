"""Debug: check updated_at distribution and why all quinzenas show same totals."""
import os, psycopg2, psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Check updated_at distribution
cur.execute("""
    SELECT 
        COUNT(*) FILTER (WHERE updated_at IS NULL) as null_count,
        COUNT(*) FILTER (WHERE updated_at IS NOT NULL) as has_count,
        MIN(updated_at) as min_date,
        MAX(updated_at) as max_date
    FROM prestacao_reports
    WHERE status = 'APROVADO' AND user_cpf IS NOT NULL
""")
row = cur.fetchone()
print(f"Reports APROVADO with user_cpf:")
print(f"  updated_at NULL: {row['null_count']}")
print(f"  updated_at NOT NULL: {row['has_count']}")
print(f"  min: {row['min_date']}")
print(f"  max: {row['max_date']}")

# Check by month
cur.execute("""
    SELECT 
        DATE_TRUNC('month', updated_at) as month,
        COUNT(*) as report_count,
        SUM(pe.value) as total_expenses
    FROM prestacao_reports pr
    JOIN prestacao_expenses pe ON pe.report_id = pr.id
    WHERE pr.status = 'APROVADO'
      AND pr.user_cpf IS NOT NULL
      AND COALESCE(pe.raw_data->>'payment_method_id', '') != '627401'
      AND pr.updated_at IS NOT NULL
    GROUP BY DATE_TRUNC('month', updated_at)
    ORDER BY month
""")
print(f"\nApproved expenses by report updated_at month (excluding Cartão Itaú):")
for r in cur.fetchall():
    print(f"  {r['month']}: {r['report_count']} reports, R$ {r['total_expenses']:,.2f}")

# Check what the cutoff filtering does
for quinzena_id, cutoff in [("2026-06-1", "2026-06-25"), ("2026-06-2", "2026-07-10"), 
                              ("2026-07-1", "2026-07-25"), ("2026-07-2", "2026-08-10")]:
    cur.execute("""
        SELECT COUNT(DISTINCT pe.id) as expense_count, SUM(pe.value) as total
        FROM prestacao_expenses pe
        JOIN prestacao_reports pr ON pe.report_id = pr.id
        WHERE pr.status = 'APROVADO'
          AND pr.user_cpf IS NOT NULL
          AND (pr.updated_at IS NULL OR pr.updated_at <= %s)
          AND COALESCE(pe.raw_data->>'payment_method_id', '') != '627401'
    """, (cutoff + " 23:59:59",))
    row = cur.fetchone()
    print(f"\n  {quinzena_id} (cutoff {cutoff}): {row['expense_count']} expenses, R$ {row['total']:,.2f}")

# Check NULL updated_at reports
cur.execute("""
    SELECT COUNT(DISTINCT pe.id) as expense_count, SUM(pe.value) as total
    FROM prestacao_expenses pe
    JOIN prestacao_reports pr ON pe.report_id = pr.id
    WHERE pr.status = 'APROVADO'
      AND pr.user_cpf IS NOT NULL
      AND pr.updated_at IS NULL
      AND COALESCE(pe.raw_data->>'payment_method_id', '') != '627401'
""")
row = cur.fetchone()
print(f"\n  NULL updated_at reports: {row['expense_count']} expenses, R$ {row['total']:,.2f}")

# Check raw_data approval_date as alternative
cur.execute("""
    SELECT 
        COUNT(*) FILTER (WHERE raw_data->>'approval_date' IS NULL) as no_approval_date,
        COUNT(*) FILTER (WHERE raw_data->>'approval_date' IS NOT NULL) as has_approval_date,
        MIN((raw_data->>'approval_date')::timestamp) as min_approval,
        MAX((raw_data->>'approval_date')::timestamp) as max_approval
    FROM prestacao_reports
    WHERE status = 'APROVADO' AND user_cpf IS NOT NULL
""")
row = cur.fetchone()
print(f"\nApproval date from raw_data:")
print(f"  No approval_date: {row['no_approval_date']}")
print(f"  Has approval_date: {row['has_approval_date']}")
print(f"  min: {row['min_approval']}")
print(f"  max: {row['max_approval']}")

conn.close()
