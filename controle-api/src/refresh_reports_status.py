#!/usr/bin/env python3
"""
refresh_reports_status.py
-------------------------
Downloads ALL reports from the VExpenses API and updates their status
in the prestacao_reports table. Also inserts new reports.

This is critical because report statuses change over time (APROVADO → REABERTO,
ENVIADO → APROVADO, etc.). The somase snapshot depends on knowing which
reports were APROVADO at snapshot time.

Usage:
    python refresh_reports_status.py

Run this BEFORE snapshot_somase_api.py at quinzena closing time.
"""
import os
import sys
import time
import json
import psycopg2
from psycopg2.extras import execute_batch
from dotenv import load_dotenv
from pathlib import Path
import requests

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")

BASE_URL = os.getenv("VEXPENSES_BASE_URL", "https://api.vexpenses.com")
API_KEY = os.getenv("VEXPENSES_API_KEY", "")
NEON_URL = os.getenv("NEON_DATABASE_URL")

HEADERS = {"Authorization": API_KEY, "Accept": "application/json"}
PER_PAGE = 100
MAX_RETRIES = 3
RETRY_DELAY = 5
REQUEST_TIMEOUT = 60


def fetch_all_reports() -> list:
    """Download all reports from API, paginating through all statuses."""
    all_reports = []
    page = 1

    while True:
        for attempt in range(MAX_RETRIES):
            try:
                resp = requests.get(
                    f"{BASE_URL}/v2/reports",
                    headers=HEADERS,
                    params={
                        "paginate": "true",
                        "page": str(page),
                        "per_page": str(PER_PAGE),
                        "include": "user",
                    },
                    timeout=REQUEST_TIMEOUT,
                )
                resp.raise_for_status()
                data = resp.json()
                reports = data.get("data", [])
                all_reports.extend(reports)

                total_pages = data.get("last_page", 1)
                print(f"  Page {page}/{total_pages} | got {len(reports)} reports | total: {len(all_reports)}")

                if page >= total_pages:
                    return all_reports
                page += 1
                time.sleep(0.3)
                break
            except Exception as e:
                print(f"  Error on page {page}, attempt {attempt+1}: {e}")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_DELAY)
                else:
                    print(f"  FAILED page {page}, skipping")
                    return all_reports


def upsert_reports(conn, reports: list):
    """Insert or update reports in prestacao_reports."""
    if not reports:
        return 0

    cur = conn.cursor()
    values = []
    for r in reports:
        user_data = r.get("user", {}).get("data", {})
        values.append((
            r.get("id"),
            r.get("name") or r.get("description"),
            r.get("status"),
            r.get("user_id"),
            user_data.get("name"),
            user_data.get("cpf"),
            json.dumps(r),
        ))

    execute_batch(cur, """
        INSERT INTO prestacao_reports (id, name, status, user_id, user_name, user_cpf, raw_data)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            status = EXCLUDED.status,
            user_id = EXCLUDED.user_id,
            user_name = EXCLUDED.user_name,
            user_cpf = EXCLUDED.user_cpf,
            raw_data = EXCLUDED.raw_data
    """, values)
    conn.commit()
    return len(values)


def main():
    print("=" * 60)
    print("  REFRESH REPORTS STATUS FROM API")
    print("=" * 60)

    print("\n  Downloading all reports from API...")
    reports = fetch_all_reports()
    print(f"  Total reports downloaded: {len(reports)}")

    if not reports:
        print("  ERROR: No reports downloaded. Check API key and connection.")
        return

    # Count by status
    status_counts = {}
    for r in reports:
        s = r.get("status", "UNKNOWN")
        status_counts[s] = status_counts.get(s, 0) + 1
    print(f"\n  Status distribution:")
    for s, c in sorted(status_counts.items(), key=lambda x: -x[1]):
        print(f"    {s:20} = {c}")

    print(f"\n  Upserting to Neon...")
    conn = psycopg2.connect(NEON_URL, connect_timeout=10)
    inserted = upsert_reports(conn, reports)
    conn.close()

    print(f"  Upserted: {inserted} reports")
    print(f"\n  Done! Now run: python snapshot_somase_api.py --quinzena <quinzena_id>")


if __name__ == "__main__":
    main()
