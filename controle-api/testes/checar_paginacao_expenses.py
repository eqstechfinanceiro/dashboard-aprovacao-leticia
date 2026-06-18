"""
Verifica se a API retorna expenses paginadas para reports APROVADOS sem expenses no Neon.
Testa alguns desses reports diretamente para ver o que a API devolve.
"""
import os, requests, psycopg2
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")
BASE_URL = os.getenv("VEXPENSES_BASE_URL", "https://api.vexpenses.com")
API_KEY  = os.getenv("VEXPENSES_API_KEY", "")
NEON_URL = os.getenv("NEON_DATABASE_URL")
HEADERS  = {"Authorization": API_KEY, "Accept": "application/json"}

conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur  = conn.cursor()

# Pegar 10 reports APROVADOS sem expenses
cur.execute("""
    SELECT id FROM prestacao_reports
    WHERE status = 'APROVADO'
      AND NOT EXISTS (SELECT 1 FROM prestacao_expenses e WHERE e.report_id = prestacao_reports.id)
    LIMIT 10
""")
sample = [r[0] for r in cur.fetchall()]
conn.close()

print(f"Testando {len(sample)} reports APROVADOS sem expenses no Neon...\n")
print(f"{'Report ID':<12} {'HTTP':>5} {'exp.data':>10} {'pagination':>12} {'total_pages':>12} {'raw_keys'}")
print("-" * 75)

for rid in sample:
    resp = requests.get(
        f"{BASE_URL}/v2/reports/{rid}?include=expenses",
        headers=HEADERS, timeout=30
    )
    if resp.status_code != 200:
        print(f"{rid:<12} {resp.status_code:>5}")
        continue

    data = resp.json().get("data", {})
    exp_block = data.get("expenses", {})
    exp_data  = exp_block.get("data", [])
    meta      = exp_block.get("meta", {}) or {}
    pagination = exp_block.get("pagination", {}) or {}
    last_page  = meta.get("last_page") or pagination.get("last_page", "?")
    total      = meta.get("total") or pagination.get("total", "?")
    keys       = list(exp_block.keys())
    print(f"{rid:<12} {resp.status_code:>5} {len(exp_data):>10} {str(total):>12} {str(last_page):>12}  {keys}")
