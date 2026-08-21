import os, psycopg2, psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
c = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = c.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Get 3 NULL expenses - check if raw_data itself is NULL
cur.execute("""
    SELECT e.id, e.raw_data IS NULL as raw_is_null,
           (e.raw_data->>'payment_method_id') as pm_id,
           e.raw_data
    FROM prestacao_expenses e
    WHERE e.raw_data->>'payment_method_id' IS NULL
    LIMIT 3
""")
for r in cur.fetchall():
    print(f"  id={r['id']}: raw_is_null={r['raw_is_null']}, pm_id={r['pm_id']}, raw_data={'NULL' if r['raw_data'] is None else str(r['raw_data'])[:100]}")

# Test with COALESCE
cur.execute("""
    SELECT e.id FROM prestacao_expenses e
    WHERE e.raw_data->>'payment_method_id' IS NULL
    LIMIT 3
""")
test_ids = [r["id"] for r in cur.fetchall()]
print(f"\nTest ids: {test_ids}")

cur.execute("""
    UPDATE prestacao_expenses e
    SET raw_data = COALESCE(e.raw_data, '{}'::jsonb) || jsonb_build_object(
        'payment_method_id', pm.pm_id,
        'payment_method_name', pm.pm_name
    )
    FROM unnest(%s::bigint[], %s::text[], %s::text[]) AS pm(eid, pm_id, pm_name)
    WHERE e.id = pm.eid AND e.raw_data->>'payment_method_id' IS NULL
""", (test_ids, ["999", "998", "997"], ["test1", "test2", "test3"]))
print(f"Update rowcount: {cur.rowcount}")
c.commit()

# Verify
cur.execute("""
    SELECT id, raw_data->>'payment_method_id' as pm_id, raw_data->>'payment_method_name' as pm_name
    FROM prestacao_expenses
    WHERE id = ANY(%s::bigint[])
""", (test_ids,))
for r in cur.fetchall():
    print(f"  id={r['id']}: pm_id={r['pm_id']}, pm_name={r['pm_name']}")

# Clean up
cur.execute("""
    UPDATE prestacao_expenses
    SET raw_data = raw_data - 'payment_method_id' - 'payment_method_name'
    WHERE id = ANY(%s::bigint[])
""", (test_ids,))
c.commit()
print(f"Cleaned up {cur.rowcount} test rows")

c.close()
