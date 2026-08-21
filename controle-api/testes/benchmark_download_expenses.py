#!/usr/bin/env python3
"""
Benchmark: quanto tempo levaria baixar TODOS os expenses do Neon.
Faz um teste com 20 reports aleatórios para medir velocidade média.
"""
import os
import sys
import time
import random
import warnings
from pathlib import Path
from dotenv import load_dotenv
import requests
import psycopg2

warnings.filterwarnings("ignore")
BASE = Path(__file__).parent.parent
sys.path.insert(0, str(BASE / "src"))
load_dotenv(BASE / ".env")

BASE_URL = os.getenv("VEXPENSES_BASE_URL", "https://api.vexpenses.com")
API_KEY = os.getenv("VEXPENSES_API_KEY", "")
NEON_URL = os.getenv("NEON_DATABASE_URL")
HEADERS = {"Authorization": API_KEY, "Accept": "application/json"}
SAMPLE_SIZE = 20


def fetch_report_expenses(report_id: int) -> tuple:
    """Retorna (qtd_expenses, tempo_segundos, status_code)."""
    t0 = time.time()
    try:
        resp = requests.get(
            f"{BASE_URL}/v2/reports/{report_id}?include=expenses",
            headers=HEADERS,
            timeout=30,
        )
        elapsed = time.time() - t0
        if resp.status_code == 200:
            data = resp.json()
            expenses = data.get("data", {}).get("expenses", {}).get("data", [])
            return (len(expenses), elapsed, resp.status_code)
        return (0, elapsed, resp.status_code)
    except Exception as e:
        return (0, time.time() - t0, -1)


print("=" * 70)
print("  BENCHMARK: velocidade de download de expenses")
print("=" * 70)

conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor()

# Estado atual do Neon
cur.execute("SELECT COUNT(*) FROM prestacao_reports")
total_reports = cur.fetchone()[0]

cur.execute("SELECT COUNT(DISTINCT report_id) FROM prestacao_expenses")
reports_com_expenses = cur.fetchone()[0]

cur.execute("SELECT COUNT(*) FROM prestacao_expenses")
total_expenses_baixados = cur.fetchone()[0]

reports_sem_expenses = total_reports - reports_com_expenses

print(f"\nEstado atual do Neon:")
print(f"  Total reports:            {total_reports:,}")
print(f"  Reports COM expenses:     {reports_com_expenses:,}")
print(f"  Reports SEM expenses:     {reports_sem_expenses:,}  ← a baixar")
print(f"  Expenses já baixados:     {total_expenses_baixados:,}")

# Pegar amostra aleatória de reports SEM expenses
cur.execute("""
    SELECT r.id, r.status
    FROM prestacao_reports r
    WHERE NOT EXISTS (
        SELECT 1 FROM prestacao_expenses e WHERE e.report_id = r.id
    )
    ORDER BY RANDOM()
    LIMIT %s
""", (SAMPLE_SIZE,))
sample = cur.fetchall()
conn.close()

print(f"\nAmostra de {len(sample)} reports para benchmark...")
print(f"{'Report ID':<12} {'Status':<12} {'Expenses':>10} {'Tempo':>8} {'HTTP':>6}")
print("-" * 55)

tempos = []
total_exp = 0
erros = 0

for report_id, status in sample:
    qtd, t, code = fetch_report_expenses(report_id)
    tempos.append(t)
    total_exp += qtd
    if code != 200:
        erros += 1
    print(f"{report_id:<12} {status:<12} {qtd:>10} {t:>7.2f}s {code:>6}")

print("-" * 55)

if tempos:
    avg = sum(tempos) / len(tempos)
    min_t = min(tempos)
    max_t = max(tempos)
    p50 = sorted(tempos)[len(tempos) // 2]

    print(f"\nEstatísticas da amostra ({len(tempos)} requests):")
    print(f"  Tempo médio:   {avg:.2f}s/report")
    print(f"  Tempo mínimo:  {min_t:.2f}s")
    print(f"  Tempo máximo:  {max_t:.2f}s")
    print(f"  Mediana (p50): {p50:.2f}s")
    print(f"  Erros:         {erros}/{len(sample)}")
    print(f"  Expenses/req:  {total_exp/len(tempos):.1f} em média")

    print(f"\n{'=' * 70}")
    print(f"  PROJEÇÃO PARA {reports_sem_expenses:,} REPORTS RESTANTES")
    print(f"{'=' * 70}")

    total_segundos = avg * reports_sem_expenses
    total_minutos = total_segundos / 60
    total_horas = total_minutos / 60

    # Com paralelismo
    for workers in [1, 2, 4, 8]:
        t_h = total_horas / workers
        t_m = total_minutos / workers
        label = f"{workers} worker{'s' if workers > 1 else ' '}"
        if t_h >= 1:
            print(f"  {label}: {t_h:.1f}h ({t_m:.0f} min)")
        else:
            print(f"  {label}: {t_m:.0f} min")

    print(f"\n  Velocidade atual: {60/avg:.1f} reports/min | {3600/avg:.0f} reports/hora")
    print(f"  Expenses estimados total: ~{int(total_exp/len(tempos) * reports_sem_expenses):,}")
