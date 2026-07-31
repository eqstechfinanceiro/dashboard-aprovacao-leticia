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


def is_fatura_or_cartao(name: str) -> bool:
    """Comprehensive FATURA/CARTAO filter matching ref BASE PREST behavior."""
    n = name.strip().upper()
    if 'CAIXA ITAU' in n or 'CAIXA ITAÚ' in n:
        return True
    if n.startswith('CAIXA'):
        return False
    if n.startswith(('FATURA', 'CARTAO', 'CARTÃO', 'FATUAR', 'FARTUR', 'FATUT', 'FARUR', 'FATUTR')):
        return True
    if 'CARTÃO DE CRÉDITO' in n or 'CARTAO DE CREDITO' in n or 'CARTÃO DE CREDITO' in n:
        return True
    if 'CARTÃO CORPORATIVO' in n:
        return True
    if ('ITAU' in n or 'ITAÚ' in n) and 'CAIXA' not in n:
        return True
    if 'DOLAR' in n or 'DÓLAR' in n:
        return True
    if n.startswith('DESPESA') and 'FATURA' in n:
        return True
    if n.startswith('COMPLEMENTAR') and 'FATURA' in n:
        return True
    if 'CARTÃO' in n and 'CRÉDITO' in n:
        return True
    if 'CARTAO' in n and 'CREDITO' in n:
        return True
    if n.startswith('CARTÃO VEXPENSES'):
        return True
    return False


def get_cutoff(quinzena_id: str) -> str:
    """
    Retorna o cutoff financeiro: dia 30 do mês anterior (mesmo para QZ1 e QZ2).
    """
    year, month, q = quinzena_id.split("-")
    year = int(year)
    month = int(month)
    prev_month = month - 1 if month > 1 else 12
    prev_year = year if month > 1 else year - 1
    return f"{prev_year}-{prev_month:02d}-30"


def snapshot_somase(quinzena_id: str, dry_run: bool = False):
    """Create a somase snapshot from API data (prestacao_reports + prestacao_expenses)."""
    conn = psycopg2.connect(NEON_URL, connect_timeout=10)
    cur = conn.cursor()
    cutoff = get_cutoff(quinzena_id)
    cutoff_str = f"{cutoff} 23:59:59"

    # 1. Check freshness of prestacao data
    cur.execute("SELECT COUNT(*) FROM prestacao_reports WHERE status ILIKE 'Aprovado' OR status ILIKE 'Enviado'")
    approved_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM prestacao_expenses")
    exp_count = cur.fetchone()[0]
    print(f"  Approved reports: {approved_count}")
    print(f"  Total expenses: {exp_count}")

    if approved_count == 0 or exp_count == 0:
        print("ERROR: No prestacao data found. Run download_prestacao_neon.py first.")
        conn.close()
        return

    # 2. Compute somase by CPF from APROVADO + ENVIADO reports (snapshot on closing date)
    # Filter FATURA/CARTAO in Python using comprehensive filter
    cur.execute("""
        SELECT pr.id, pr.name
        FROM prestacao_reports pr
        WHERE (pr.status ILIKE 'Aprovado' OR pr.status ILIKE 'Enviado')
          AND pr.user_cpf IS NOT NULL
    """)
    all_reports = cur.fetchall()
    valid_rids = [rid for rid, name in all_reports if not is_fatura_or_cartao(str(name or ''))]
    print(f"  Valid reports (after FATURA/CARTAO filter): {len(valid_rids)}/{len(all_reports)}")

    if not valid_rids:
        print("ERROR: No valid reports after FATURA/CARTAO filter.")
        conn.close()
        return

    placeholders = ','.join(['%s'] * len(valid_rids))
    cur.execute(f"""
        SELECT pr.user_cpf, SUM(pe.value) as total
        FROM prestacao_expenses pe
        JOIN prestacao_reports pr ON pe.report_id = pr.id
        WHERE pr.id IN ({placeholders})
        GROUP BY pr.user_cpf
        ORDER BY SUM(pe.value) DESC
    """, valid_rids)
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

    cur.execute(f"""
        SELECT pe.id, pr.user_cpf, pe.value
        FROM prestacao_expenses pe
        JOIN prestacao_reports pr ON pe.report_id = pr.id
        WHERE pr.id IN ({placeholders})
    """, valid_rids)
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

    cutoff = get_cutoff(args.quinzena)
    print("=" * 60)
    print(f"  SNAPSHOT SOMASE — {args.quinzena} (cutoff {cutoff})")
    print("=" * 60)
    snapshot_somase(args.quinzena, args.dry_run)


if __name__ == "__main__":
    main()
