import os, psycopg2, psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Check report raw_data for pdf_link
cur.execute("""
    SELECT r.id, r.name, r.raw_data->>'pdf_link' as pdf_link,
           r.raw_data IS NULL as raw_is_null
    FROM prestacao_reports r
    WHERE r.raw_data->>'pdf_link' IS NOT NULL
    LIMIT 3
""")
print("Reports with pdf_link in raw_data:")
for r in cur.fetchall():
    print(f"  id={r['id']}: {r['pdf_link']}")

# Check if any report has raw_data at all
cur.execute("""
    SELECT COUNT(*) as total,
           SUM(CASE WHEN raw_data IS NULL THEN 1 ELSE 0 END) as null_count,
           SUM(CASE WHEN raw_data->>'pdf_link' IS NOT NULL THEN 1 ELSE 0 END) as has_pdf
    FROM prestacao_reports
""")
r = cur.fetchone()
print(f"\nReports total: {r['total']}, raw_data NULL: {r['null_count']}, has pdf_link: {r['has_pdf']}")

# Check what keys exist in report raw_data
cur.execute("""
    SELECT DISTINCT jsonb_object_keys(raw_data) as key
    FROM prestacao_reports
    WHERE raw_data IS NOT NULL
    LIMIT 20
""")
print("\nKeys in report raw_data:")
for r in cur.fetchall():
    print(f"  {r['key']}")

conn.close()
