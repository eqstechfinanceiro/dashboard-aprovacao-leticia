#!/usr/bin/env python3
"""
snapshot_somase_api.py
----------------------
Creates a somase snapshot at the current point in time by querying the API
for all approved reports and their expenses, then storing the accumulated
sum by CPF in somase_snapshots.

This replaces the planilha BASE PREST import — 100% API.

Usage:
    python snapshot_somase_api.py --quinzena 2026-06-2
    python snapshot_somase_api.py --quinzena 2026-07-1

The script:
1. Queries prestacao_reports (already downloaded via download_prestacao_neon.py)
   for all APROVADO reports
2. Joins with prestacao_expenses to get all expense values
3. Groups by user_cpf and sums values
4. Upserts into somase_snapshots with the given quinzena ID

IMPORTANT: Run this at quinzena closing time to capture the exact state.
The prestacao_reports/expenses tables must be fresh (run download_prestacao_neon.py first).
"""
import os
import sys
import argparse
import psycopg2
from psycopg2.extras import execute_batch
from dotenv import load_dotenv
from pathlib import Path

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")

NEON_URL = os.getenv("NEON_DATABASE_URL")


def snapshot_somase(quinzena_id: str, dry_run: bool = False):
    """Create a somase snapshot from API data (prestacao_reports + prestacao_expenses)."""
    conn = psycopg2.connect(NEON_URL, connect_timeout=10)
    cur = conn.cursor()

    # 1. Check freshness of prestacao data
    cur.execute("SELECT COUNT(*) FROM prestacao_reports WHERE status = 'APROVADO'")
    approved_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM prestacao_expenses")
    exp_count = cur.fetchone()[0]
    print(f"  Approved reports: {approved_count}")
    print(f"  Total expenses: {exp_count}")

    if approved_count == 0 or exp_count == 0:
        print("ERROR: No prestacao data found. Run download_prestacao_neon.py first.")
        conn.close()
        return

    # 2. Compute somase by CPF from all approved reports
    cur.execute("""
        SELECT pr.user_cpf, SUM(pe.value) as total
        FROM prestacao_expenses pe
        JOIN prestacao_reports pr ON pe.report_id = pr.id
        WHERE pr.status = 'APROVADO'
          AND pr.user_cpf IS NOT NULL
        GROUP BY pr.user_cpf
        ORDER BY SUM(pe.value) DESC
    """)
    rows = cur.fetchall()
    print(f"  CPFs with approved expenses: {len(rows)}")
    print(f"  Total somase: R$ {sum(float(r[1]) for r in rows):,.2f}")

    if dry_run:
        print("\n  [DRY RUN] Top 10:")
        for cpf, total in rows[:10]:
            print(f"    {cpf}: R$ {float(total):,.2f}")
        conn.close()
        return

    # 3. Delete existing snapshot for this quinzena
    cur.execute("DELETE FROM somase_snapshots WHERE quinzena = %s", (quinzena_id,))
    deleted = cur.rowcount
    conn.commit()
    print(f"  Deleted existing snapshot: {deleted} rows")

    # 4. Insert new snapshot
    values = [(quinzena_id, cpf, float(total)) for cpf, total in rows]
    execute_batch(cur, """
        INSERT INTO somase_snapshots (quinzena, user_cpf, total)
        VALUES (%s, %s, %s)
        ON CONFLICT (quinzena, user_cpf) DO UPDATE SET total = EXCLUDED.total
    """, values)
    conn.commit()
    print(f"  Inserted: {len(values)} rows")

    # 5. Also snapshot prestacao_expense_snapshots (for delta computation)
    cur.execute("DELETE FROM prestacao_expense_snapshots WHERE quinzena = %s", (quinzena_id,))
    deleted_snap = cur.rowcount
    conn.commit()

    cur.execute("""
        SELECT pe.id, pr.user_cpf, pe.value
        FROM prestacao_expenses pe
        JOIN prestacao_reports pr ON pe.report_id = pr.id
        WHERE pr.status = 'APROVADO'
          AND pr.user_cpf IS NOT NULL
    """)
    snap_rows = [(row[0], quinzena_id, float(row[2]), row[1]) for row in cur.fetchall()]
    execute_batch(cur, """
        INSERT INTO prestacao_expense_snapshots (id, quinzena, value, user_cpf)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (id, quinzena) DO UPDATE SET value = EXCLUDED.value, user_cpf = EXCLUDED.user_cpf
    """, snap_rows)
    conn.commit()
    print(f"  prestacao_expense_snapshots: {len(snap_rows)} rows")

    conn.close()
    print(f"\n  Done! Snapshot for {quinzena_id} created.")


def main():
    parser = argparse.ArgumentParser(description="Snapshot somase from API data")
    parser.add_argument("--quinzena", required=True, help="Quinzena ID (e.g., 2026-07-1)")
    parser.add_argument("--dry-run", action="store_true", help="Don't write to DB, just show")
    args = parser.parse_args()

    print("=" * 60)
    print(f"  SNAPSHOT SOMASE — {args.quinzena}")
    print("=" * 60)
    snapshot_somase(args.quinzena, args.dry_run)


if __name__ == "__main__":
    main()
