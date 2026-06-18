#!/usr/bin/env python3
"""
Teste de workers paralelos: mede velocidade e detecta throttling.
Testa 30 reports com 2 workers e monitora erros/lentidão.
"""
import os
import sys
import time
import warnings
from pathlib import Path
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor, as_completed
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

SAMPLE_SIZE = 60
WORKERS = 8


def fetch_report(report_id: int) -> dict:
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
            return {"id": report_id, "qtd": len(expenses), "time": elapsed, "code": 200, "err": None}
        return {"id": report_id, "qtd": 0, "time": elapsed, "code": resp.status_code, "err": resp.text[:80]}
    except Exception as e:
        return {"id": report_id, "qtd": 0, "time": time.time() - t0, "code": -1, "err": str(e)[:80]}


print("=" * 70)
print(f"  TESTE COM {WORKERS} WORKERS PARALELOS ({SAMPLE_SIZE} reports)")
print("=" * 70)

conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor()
cur.execute("""
    SELECT r.id FROM prestacao_reports r
    WHERE NOT EXISTS (SELECT 1 FROM prestacao_expenses e WHERE e.report_id = r.id)
    ORDER BY RANDOM()
    LIMIT %s
""", (SAMPLE_SIZE,))
sample_ids = [row[0] for row in cur.fetchall()]
conn.close()

print(f"\nIniciando {SAMPLE_SIZE} requests com {WORKERS} workers...")
print(f"{'#':<4} {'Report ID':<12} {'Expenses':>10} {'Tempo':>8} {'HTTP':>6} {'Erro'}")
print("-" * 65)

results = []
t_global = time.time()

with ThreadPoolExecutor(max_workers=WORKERS) as pool:
    futures = {pool.submit(fetch_report, rid): rid for rid in sample_ids}
    done_count = 0
    for future in as_completed(futures):
        r = future.result()
        results.append(r)
        done_count += 1
        err_str = r["err"] if r["err"] else ""
        print(f"{done_count:<4} {r['id']:<12} {r['qtd']:>10} {r['time']:>7.2f}s {r['code']:>6}  {err_str}")

total_elapsed = time.time() - t_global

# Análise
tempos = [r["time"] for r in results]
erros = [r for r in results if r["code"] != 200]
lento = [r for r in results if r["time"] > 3.0]

avg = sum(tempos) / len(tempos)
throughput = len(results) / total_elapsed  # reports/seg reais com paralelismo

print("-" * 65)
print(f"\nResultados com {WORKERS} workers:")
print(f"  Tempo total real:    {total_elapsed:.1f}s para {SAMPLE_SIZE} reports")
print(f"  Throughput real:     {throughput:.2f} reports/seg = {throughput*60:.1f} reports/min")
print(f"  Tempo médio/req:     {avg:.2f}s (wall clock por request individual)")
print(f"  Erros (não-200):     {len(erros)}")
print(f"  Requests lentos >3s: {len(lento)}")

if erros:
    print(f"\n  ERROS DETECTADOS:")
    for r in erros:
        print(f"    report={r['id']} code={r['code']} err={r['err']}")

if lento:
    print(f"\n  REQUESTS LENTOS (possível throttling):")
    for r in lento:
        print(f"    report={r['id']} tempo={r['time']:.2f}s")

# Projeção
print(f"\n{'=' * 70}")
print(f"  PROJEÇÃO PARA 6,509 REPORTS COM {WORKERS} WORKERS")
print(f"{'=' * 70}")
tempo_total_min = (6509 / (throughput * 60))
print(f"  Throughput medido:   {throughput*60:.1f} reports/min")
print(f"  Tempo estimado:      {tempo_total_min:.0f} min ({tempo_total_min/60:.1f}h)")

# Comparação com 1 worker
print(f"\n  Comparação:")
print(f"    1 worker  (sequencial): ~108 min")
print(f"    {WORKERS} workers (paralelo):  ~{tempo_total_min:.0f} min")
print(f"    Ganho real:             {108/tempo_total_min:.1f}x")
