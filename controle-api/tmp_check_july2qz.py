"""Check if July 2QZ is ready to be generated correctly."""
import os, psycopg2, psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# 1. Check quinzena_config for July 2QZ
cur.execute("SELECT * FROM quinzena_config WHERE year = 2026 AND month = 7")
print("=== quinzena_config for July 2026 ===")
for r in cur.fetchall():
    print(f"  QZ {r['quinzena']}: multiplier={r['reembolso_multiplier']}, notes={r.get('notes', '')}")

# 2. Check if July 2QZ is already frozen
cur.execute("SELECT COUNT(*) as cnt, MIN(frozen_at) as frozen_at FROM quinzena_frozen_snapshots WHERE year = 2026 AND month = 7 AND quinzena = 2")
row = cur.fetchone()
print(f"\n=== Frozen status July 2QZ ===")
print(f"  Frozen rows: {row['cnt']}, frozen_at: {row['frozen_at']}")

# 3. Check extrato data coverage
cur.execute("SELECT MIN(data) as min_date, MAX(data) as max_date, COUNT(*) as cnt FROM extrato_movimentacao")
row = cur.fetchone()
print(f"\n=== Extrato coverage ===")
print(f"  Date range: {row['min_date']} → {row['max_date']}, {row['cnt']} records")

# 4. Check manual inputs for July 2QZ
cur.execute("SELECT COUNT(*) as cnt FROM quinzena_manual_inputs WHERE year = 2026 AND month = 7 AND quinzena = 2")
row = cur.fetchone()
print(f"\n=== Manual inputs July 2QZ ===")
print(f"  Count: {row['cnt']}")

# 5. Check somase_snapshots for July 2QZ
cur.execute("SELECT COUNT(*) as cnt, SUM(total) as t FROM somase_snapshots WHERE quinzena = '2026-07-2'")
row = cur.fetchone()
print(f"\n=== Somase snapshots July 2QZ ===")
print(f"  CPFs: {row['cnt']}, Total: R$ {row['t'] or 0:,.2f}")

# 6. Check cadastro count
cur.execute("SELECT COUNT(*) as cnt FROM quinzena_cadastro")
row = cur.fetchone()
print(f"\n=== Cadastro ===")
print(f"  Total: {row['cnt']} employees")

# 7. Check what the quinzena-complete API would return (key stats)
# Simulate the cutoff dates for July 2QZ 2026
# 2QZ: period 11-25, financial_cutoff = day 1 of current month = 2026-07-01
# saldo_cartao_controle_date = 2026-07-01, saldo_cartao_carga_date = 2026-07-25
print(f"\n=== Expected quinzena-complete behavior for July 2QZ ===")
print(f"  financial_cutoff: 2026-07-01 (but somase is cumulative, no cutoff in live calc)")
print(f"  saldo_cartao_controle_date: 2026-07-01")
print(f"  saldo_cartao_carga_date: 2026-07-25")
print(f"  reembolso: 0 (2nd quinzena never has reembolso)")

# 8. Check extrato up to July 25
cur.execute("SELECT COUNT(*) as cnt, SUM(valor) as total FROM extrato_movimentacao WHERE data <= '2026-07-25' AND is_snapshot = FALSE")
row = cur.fetchone()
print(f"\n=== Extrato transactions up to July 25 ===")
print(f"  Records: {row['cnt']}, Total: R$ {row['total'] or 0:,.2f}")

# 9. Check latest snapshot date
cur.execute("SELECT MAX(data) as max_date FROM extrato_movimentacao WHERE is_snapshot = TRUE")
row = cur.fetchone()
print(f"\n=== Latest snapshot date ===")
print(f"  {row['max_date']}")

conn.close()
