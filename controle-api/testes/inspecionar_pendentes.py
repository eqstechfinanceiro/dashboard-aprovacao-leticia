"""
Inspeciona os reports pendentes (sem expenses no Neon) diretamente,
um por um, mostrando o HTTP status e o conteúdo da resposta.
"""
import os, time, requests, psycopg2
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
BASE_URL = os.getenv("VEXPENSES_BASE_URL", "https://api.vexpenses.com")
API_KEY  = os.getenv("VEXPENSES_API_KEY", "")
NEON_URL = os.getenv("NEON_DATABASE_URL")
HEADERS  = {"Authorization": API_KEY, "Accept": "application/json"}

conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur  = conn.cursor()
cur.execute("""
    SELECT id, status, raw_data->>'approval_date'
    FROM prestacao_reports
    WHERE NOT EXISTS (SELECT 1 FROM prestacao_expenses e WHERE e.report_id = prestacao_reports.id)
    ORDER BY id
""")
pendentes = cur.fetchall()
conn.close()

print(f"Total pendentes: {len(pendentes)}\n")
print(f"{'ID':<12} {'Status':<12} {'Approval':<12} {'HTTP':>5} {'Expenses':>10} {'Motivo'}")
print("-" * 75)

codigos = {}
for rid, status, approval in pendentes:
    time.sleep(0.3)
    try:
        resp = requests.get(
            f"{BASE_URL}/v2/reports/{rid}?include=expenses",
            headers=HEADERS, timeout=30
        )
        code = resp.status_code
        codigos[code] = codigos.get(code, 0) + 1

        if code == 200:
            data = resp.json().get("data", {})
            exps = data.get("expenses", {}).get("data", [])
            motivo = f"{len(exps)} expenses (vazio=report sem despesas)"
        elif code == 403:
            motivo = "403 Forbidden"
        elif code == 404:
            motivo = "404 Not Found"
        else:
            motivo = resp.text[:60]

        print(f"{rid:<12} {status:<12} {str(approval)[:10]:<12} {code:>5} {len(exps) if code==200 else 0:>10}  {motivo}")
    except Exception as ex:
        codigos[-1] = codigos.get(-1, 0) + 1
        print(f"{rid:<12} {status:<12} {str(approval)[:10]:<12} {'ERR':>5} {'0':>10}  {str(ex)[:60]}")

print("\nResumo de HTTP codes:")
for code, cnt in sorted(codigos.items()):
    print(f"  {code}: {cnt}")
