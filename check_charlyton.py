import psycopg2, json

DB_URL = "postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

expense_ids = [87188382, 87189813, 87198791, 87198932]

# Get full expense data including raw_data
cur.execute("""
    SELECT id, report_id, value, date, description, status, raw_data
    FROM prestacao_expenses
    WHERE id = ANY(%s)
    ORDER BY id
""", (expense_ids,))

print("=" * 120)
print("EXPENSE DETAILS (raw_data)")
print("=" * 120)
for row in cur.fetchall():
    eid, rid, val, dt, desc, st, raw = row
    print(f"\n--- Expense ID: {eid} ---")
    print(f"  Report ID: {rid}")
    print(f"  Value: R$ {val}")
    print(f"  Date: {dt}")
    print(f"  Description: '{desc}'")
    print(f"  Status: '{st}'")
    if raw:
        raw_str = json.dumps(raw, indent=2, ensure_ascii=False) if isinstance(raw, dict) else str(raw)
        print(f"  Raw data:")
        for line in raw_str.split('\n'):
            print(f"    {line}")
    else:
        print(f"  Raw data: NULL")

# Also get the report's raw_data for context
cur.execute("""
    SELECT id, name, status, raw_data
    FROM prestacao_reports
    WHERE id = 10912883
""")
report = cur.fetchone()
if report:
    print(f"\n{'=' * 120}")
    print(f"REPORT 10912883 raw_data:")
    print(f"{'=' * 120}")
    raw = report[3]
    if raw:
        raw_str = json.dumps(raw, indent=2, ensure_ascii=False) if isinstance(raw, dict) else str(raw)
        for line in raw_str.split('\n'):
            print(f"  {line}")

# Count total expenses for this report
cur.execute("""
    SELECT COUNT(*), COALESCE(SUM(value), 0)
    FROM prestacao_expenses
    WHERE report_id = 10912883
""")
cnt, total = cur.fetchone()
print(f"\nReport 10912883 total: {cnt} expenses, R$ {total:.2f}")

# Also check his other report
cur.execute("""
    SELECT r.id, r.name, r.status, COUNT(e.id), COALESCE(SUM(e.value), 0)
    FROM prestacao_reports r
    LEFT JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.user_cpf = '01050938232'
      AND (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND NOT (r.name ILIKE '%FATURA%' OR r.name ILIKE '%CARTAO%' OR r.name ILIKE '%CARTÃO%')
    GROUP BY r.id, r.name, r.status
    ORDER BY r.id
""")
print(f"\nAll CHARLYTON reports:")
for row in cur.fetchall():
    print(f"  id={row[0]} {row[1]} status={row[2]} expenses={row[3]} total=R${row[4]:.2f}")

cur.close()
conn.close()
