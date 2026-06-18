#!/usr/bin/env python3
"""
download_prestacao_neon.py
---------------------------
Downloader de EXPENSES de TODOS os reports existentes no Neon.
Usa 4 workers paralelos para reduzir o tempo de download.

Tabelas Neon:
  - prestacao_reports (relatórios) - JÁ EXISTE
  - prestacao_expenses (despesas dentro dos relatórios) - A PREENCHER
"""
import os
import sys
import time
import json
import threading
from pathlib import Path
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
import psycopg2
from psycopg2.extras import execute_batch

BASE = Path(__file__).parent.parent
sys.path.insert(0, str(BASE / "src"))
load_dotenv(BASE / ".env")

BASE_URL = os.getenv("VEXPENSES_BASE_URL", "https://api.vexpenses.com")
API_KEY = os.getenv("VEXPENSES_API_KEY", "")
NEON_URL = os.getenv("NEON_DATABASE_URL")

HEADERS = {"Authorization": API_KEY, "Accept": "application/json"}

MAX_RETRIES = 3
RETRY_DELAY = 5
REQUEST_TIMEOUT = 30
WORKERS = 1
LOG_INTERVAL = 50
REQUEST_DELAY = 1.0  # delay entre requests por thread (~13 req/s total com 4 workers)


def _fetch_expenses(report_id: int) -> tuple:
    """Busca expenses de um report. Retorna (report_id, expenses_list)."""
    time.sleep(REQUEST_DELAY)
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(
                f"{BASE_URL}/v2/reports/{report_id}?include=expenses",
                headers=HEADERS,
                timeout=REQUEST_TIMEOUT,
            )
            if resp.status_code == 404:
                return (report_id, [])
            if resp.status_code == 403:
                print("BLOQUEADO")
                # Possível bloqueio temporário por rate limit — espera e tenta novamente
                if attempt < MAX_RETRIES - 1:
                    time.sleep(120)
                    continue
                return (report_id, [])
            resp.raise_for_status()
            data = resp.json()
            expenses = data.get("data", {}).get("expenses", {}).get("data", [])
            for e in expenses:
                e["report_id"] = report_id
            return (report_id, expenses)
        except Exception:
            if attempt == MAX_RETRIES - 1:
                return (report_id, [])
            time.sleep(RETRY_DELAY)
    return (report_id, [])


def get_todos_reports_sem_expenses(conn) -> list:
    """Retorna IDs de TODOS os reports que ainda não têm expenses no Neon."""
    cur = conn.cursor()
    cur.execute("""
        SELECT r.id
        FROM prestacao_reports r
        WHERE NOT EXISTS (
            SELECT 1 FROM prestacao_expenses e WHERE e.report_id = r.id
        )
        ORDER BY r.id
    """)
    return [row[0] for row in cur.fetchall()]


def upsert_expenses(conn, expenses: list):
    """Insere ou atualiza expenses no Neon (thread-safe: usa conexão dedicada)."""
    if not expenses:
        return
    cur = conn.cursor()
    values = [
        (
            e.get("id"),
            e.get("report_id"),
            e.get("value"),
            e.get("date"),
            e.get("description"),
            e.get("status"),
            json.dumps(e),
        )
        for e in expenses
    ]
    execute_batch(
        cur,
        """
            INSERT INTO prestacao_expenses (id, report_id, value, date, description, status, raw_data)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                report_id=EXCLUDED.report_id, value=EXCLUDED.value, date=EXCLUDED.date,
                description=EXCLUDED.description, status=EXCLUDED.status, raw_data=EXCLUDED.raw_data
        """,
        values,
    )
    conn.commit()


def format_time(seconds: float) -> str:
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m:02d}:{s:02d}"


def main():
    print("=" * 80)
    print("  DOWNLOAD DE EXPENSES — TODOS OS REPORTS (4 workers)")
    print("=" * 80)

    conn_main = psycopg2.connect(NEON_URL, connect_timeout=10)

    cur = conn_main.cursor()
    cur.execute("SELECT COUNT(*) FROM prestacao_reports")
    total_reports = cur.fetchone()[0]
    cur.execute("SELECT COUNT(DISTINCT report_id) FROM prestacao_expenses")
    com_expenses = cur.fetchone()[0]

    reports_pendentes = get_todos_reports_sem_expenses(conn_main)
    total_pendentes = len(reports_pendentes)

    print(f"\n  Total reports no Neon:    {total_reports:,}")
    print(f"  Já com expenses:          {com_expenses:,}")
    print(f"  Pendentes (a baixar):     {total_pendentes:,}")
    print()

    if total_pendentes == 0:
        print("  Todos os expenses já foram baixados!")
        conn_main.close()
        return

    # Cada thread tem sua própria conexão via threading.local()
    thread_local = threading.local()

    def get_thread_conn():
        conn = getattr(thread_local, "conn", None)
        if conn is None or conn.closed:
            thread_local.conn = psycopg2.connect(NEON_URL, connect_timeout=15)
        return thread_local.conn

    def fetch_and_save(report_id: int) -> tuple:
        """Busca expenses da API e salva no Neon. Tudo na mesma thread."""
        rid, expenses = _fetch_expenses(report_id)
        if expenses:
            try:
                conn = get_thread_conn()
                upsert_expenses(conn, expenses)
            except Exception:
                # Fechar conexão com problema para recriar na próxima tentativa
                try:
                    thread_local.conn.close()
                except Exception:
                    pass
                thread_local.conn = None
                return (rid, expenses, True)
        return (rid, expenses, False)

    # Contadores thread-safe
    counter_lock = threading.Lock()
    processed = [0]
    total_expenses = [0]
    erros = [0]

    start = time.time()

    print(f"  Iniciando download com {WORKERS} workers...")
    print("=" * 80)

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(fetch_and_save, rid): rid for rid in reports_pendentes}

        for future in as_completed(futures):
            report_id, expenses, teve_erro = future.result()

            with counter_lock:
                processed[0] += 1
                total_expenses[0] += len(expenses)
                if teve_erro:
                    erros[0] += 1
                n = processed[0]

            if n % LOG_INTERVAL == 0 or n == 1:
                elapsed = time.time() - start
                avg = elapsed / n
                eta = format_time(avg * (total_pendentes - n))
                pct = n / total_pendentes * 100
                throughput = n / (elapsed / 60)
                print(
                    f"  [{n:5d}/{total_pendentes:5d}] {pct:5.1f}% | "
                    f"Expenses: {total_expenses[0]:6d} | "
                    f"{throughput:.0f} rep/min | "
                    f"ETA: {eta} | Erros: {erros[0]}"
                )

    conn_main.close()

    elapsed = time.time() - start
    print()
    print("=" * 80)
    print(f"  CONCLUÍDO em {format_time(elapsed)} ({elapsed/60:.1f} min)")
    print(f"  Reports processados: {processed[0]:,}/{total_pendentes:,}")
    print(f"  Total expenses baixados: {total_expenses[0]:,}")
    print(f"  Erros: {erros[0]}")
    print(f"  Velocidade média: {processed[0]/(elapsed/60):.0f} reports/min")
    print("=" * 80)


if __name__ == "__main__":
    main()
