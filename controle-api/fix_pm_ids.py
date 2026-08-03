"""Fetch payment_method_id from API and patch raw_data JSON in DB."""
import os, sys, json, requests, psycopg2, psycopg2.extras, time
from dotenv import load_dotenv
from pathlib import Path

def log(msg):
    print(msg, flush=True)

load_dotenv(Path(__file__).parent / ".env")
API_KEY = os.getenv("VEXPENSES_API_KEY", "")
BASE_URL = os.getenv("VEXPENSES_BASE_URL", "https://api.vexpenses.com")
NEON_URL = os.getenv("NEON_DATABASE_URL")

conn = psycopg2.connect(NEON_URL)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Count how many need fixing
cur.execute("""
    SELECT COUNT(*) as cnt FROM prestacao_expenses
    WHERE raw_data->>'payment_method_id' IS NULL
""")
total_null = cur.fetchone()["cnt"]
log(f"Expenses with NULL pm_id in DB: {total_null:,}")

# Build a set of expense IDs that need fixing
cur.execute("""
    SELECT e.id FROM prestacao_expenses e
    WHERE e.raw_data->>'payment_method_id' IS NULL
""")
need_fix = {r["id"] for r in cur.fetchall()}
log(f"Expense IDs to fix: {len(need_fix):,}")

# PM ID -> name mapping (already confirmed from API)
PM_NAMES = {
    "627401": "Cartao Corporativo Itau",
    "627721": "Saque VExpenses",
    "627508": "Cartao VExpenses",
    "668240": "Pix VExpenses",
    "630113": "Recurso Proprio",
    "627741": "Tarifa de Saque",
}

# Generate 15-day chunks from 2024-01-01 to 2026-07-31
from datetime import date, timedelta
date_ranges = []
d = date(2024, 1, 1)
end_all = date(2026, 7, 31)
while d <= end_all:
    chunk_end = min(d + timedelta(days=14), end_all)
    date_ranges.append((d.isoformat(), chunk_end.isoformat()))
    d = chunk_end + timedelta(days=1)

# Check which chunks actually have NULL expenses in our DB (skip empty ones)
cur.execute("""
    SELECT MIN(e.date) as min_d, MAX(e.date) as max_d
    FROM prestacao_expenses e
    WHERE e.raw_data->>'payment_method_id' IS NULL
""")
null_range = cur.fetchone()
null_min = null_range["min_d"]
null_max = null_range["max_d"]
log(f"NULL expenses date range: {null_min} to {null_max}")

# Filter chunks to only those overlapping with NULL expense dates
filtered_ranges = []
for start, end in date_ranges:
    s = date.fromisoformat(start)
    e = date.fromisoformat(end)
    if e >= null_min and s <= null_max:
        filtered_ranges.append((start, end))

log(f"Filtered to {len(filtered_ranges)} chunks (with NULL expenses)")

updated = 0
errors = 0

def fetch_chunk(start, end):
    """Fetch all expenses for a date range. API returns everything in one response (no pagination)."""
    for retry in range(3):
        t0 = time.time()
        try:
            resp = requests.get(f"{BASE_URL}/v2/expenses",
                headers={"Authorization": API_KEY, "Accept": "application/json"},
                params={
                    "search": f"date:{start},{end}",
                    "searchFields": "date:between",
                },
                timeout=30)
            elapsed = (time.time() - t0) * 1000
            if resp.status_code != 200:
                return None, f"status {resp.status_code}", elapsed
            data = resp.json()
            expenses = data.get("data", [])
            return expenses, None, elapsed
        except requests.exceptions.Timeout:
            elapsed = (time.time() - t0) * 1000
            if retry < 2:
                log(f"    timeout after {elapsed:.0f}ms, retry {retry+1}/3")
                continue
            return None, f"timeout {elapsed:.0f}ms (3 retries)", elapsed
        except Exception as e:
            elapsed = (time.time() - t0) * 1000
            return None, f"{type(e).__name__}: {e}", elapsed

for chi, (start, end) in enumerate(filtered_ranges):
    if errors > 10:
        log("Too many errors, stopping.")
        break

    chunk_start = time.time()
    expenses, err, elapsed = fetch_chunk(start, end)
    if err:
        log(f"  [{chi+1}/{len(filtered_ranges)}] {start}..{end}: {err} ({elapsed:.0f}ms)")
        errors += 1
        continue
    if not expenses:
        continue

    batch = []
    for exp in expenses:
        eid = exp["id"]
        if eid not in need_fix:
            continue
        pm_id = exp.get("payment_method_id")
        if pm_id is None:
            continue
        pm_name = PM_NAMES.get(str(pm_id), "")
        batch.append((str(pm_id), pm_name, eid))

    if batch:
        t0 = time.time()
        ids = [b[2] for b in batch]
        pm_ids = [b[0] for b in batch]
        pm_names = [b[1] for b in batch]
        cur.execute("""
            UPDATE prestacao_expenses e
            SET raw_data = COALESCE(e.raw_data, '{}'::jsonb) || jsonb_build_object(
                'payment_method_id', pm.pm_id,
                'payment_method_name', pm.pm_name
            )
            FROM unnest(%s::bigint[], %s::text[], %s::text[]) AS pm(eid, pm_id, pm_name)
            WHERE e.id = pm.eid AND e.raw_data->>'payment_method_id' IS NULL
        """, (ids, pm_ids, pm_names))
        actually_patched = cur.rowcount
        db_ms = (time.time() - t0) * 1000
        updated += actually_patched
        conn.commit()
    else:
        actually_patched = 0
        db_ms = 0

    chunk_elapsed = time.time() - chunk_start
    log(f"  [{chi+1}/{len(filtered_ranges)}] {start}..{end}: {len(expenses)} fetched, {len(batch)} matched, {actually_patched} patched, API {elapsed:.0f}ms, DB {db_ms:.0f}ms, total {chunk_elapsed:.1f}s (running total: {updated:,})")

log(f"\nDone! Updated {updated:,} expenses with payment_method_id.")

# Verify
cur.execute("""
    SELECT (e.raw_data->>'payment_method_id') as pm_id, COUNT(*) as cnt, SUM(e.value) as total
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON e.report_id = r.id
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
    GROUP BY 1 ORDER BY SUM(e.value) DESC
""")
log("\n--- Payment method distribution after fix ---")
for r in cur.fetchall():
    pm = str(r["pm_id"] or "NULL")
    log(f"  pm_id={pm:>10s}  count={r['cnt']:>6d}  total=R$ {float(r['total']):>14,.2f}")

conn.close()
